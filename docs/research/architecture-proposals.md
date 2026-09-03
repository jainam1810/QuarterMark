# QuarterMark — Architecture Design Proposals

(Partial run: 3 agents completed.)



---

## Two-Surface / One-IR: structured covenant schema lowered into a total, statically-typed expression IR (QML) with a fuel-metered pure interpreter

### Summary
The design splits a covenant into three layers — the *test* (comparator, threshold schedule, frequency, cure rights), the *defined terms* (the bespoke "Consolidated EBITDA", "Total Net Debt" etc.), and the *facts* (extracted line items with page/bbox provenance) — because in real UK/EU credit agreements the tests are boring and near-universal while the defined terms are where every agreement diverges. The structured half is an ordered adjustment-stack schema over a canonical financial taxonomy; the escape hatch is QML, a small, pure, total, statically-typed expression language with units and currencies in the type system. The critical architectural move is that **the structured schema is not a separate execution path: it is lowered (compiled) into the same QML AST**, so there is exactly one evaluator, one trace format, one set of resource limits, one provenance model, and one thing to maintain — which is the only way a solo founder keeps both halves correct. The escape hatch is available at three granularities (a whole term, a single adjustment inside an otherwise-structured term, or a whole test), so the common case is "95% structured with one weird adjustment", not "abandon structure". QML is executed by a hand-written interpreter over an explicit value union — no `eval`, no `Function`, no `node:vm`, no host object graph — so the worst case of a hostile formula derived from a poisoned PDF is a wrong number or a burned fuel budget, never code execution; CPU and memory are bounded by a step budget, a bounded-cardinality comprehension form, a decimal exponent clamp, and a worker-thread heap cap. Determinism is guaranteed by decimal128 arithmetic with pinned precision/rounding, no clock/random/locale/IO, and pinned FX rate sets, and is *verified* by a nightly canary that re-runs the last N runs and compares trace hashes. Every evaluation emits an immutable content-addressed trace DAG in which each leaf carries a `ProvenanceRef` (document version, page, bbox), which is what powers both the click-through-to-source UI and the differentiating feature: diffing our trace against the borrower's compliance certificate to localise *which* adjustment explains the discrepancy. Definitions are bitemporal (business time = which test dates a version governs; system time = when we knew it), amendments are typed patches folded in a deterministic order, and every run pins definition versions, fact versions, FX set and engine version so historical results reproduce byte-identically. Honestly: I estimate the structured half fully covers roughly 70–80% of defined terms and ~95% of test mechanics, formula-valued adjustments take it to ~90–95%, and a genuine 5–10% (excess-cashflow waterfalls, borrowing bases, project-finance DSCR/LLCR, NAV/LTV with haircuts) need a full formula — but the real ceiling is *extraction*, not calculation, and the design treats "analyst keys this number by hand, with a reason and a citation" as a first-class path rather than an error.

### Design
# QuarterMark — Covenant Definition & Recalculation Engine

**Status of claims.** Where I state how often something appears in real agreements, that is my prior from LMA-style UK/European mid-market leveraged documentation, **not measured data**. I mark those explicitly as `[ESTIMATE]`. Everything about the engine mechanics is a design commitment, not an estimate. Two external-dependency claims I'd verify before depending on them are flagged `[VERIFY]`.

---

## 0. The shape of the problem (why the layering is what it is)

A covenant clause is not one thing. It is:

```
Clause 21.2 (Leverage)  ← the TEST      : comparator, threshold, when tested
  "Total Net Debt"      ← a DEFINED TERM: bespoke, 1-2 paragraphs
  "Consolidated EBITDA" ← a DEFINED TERM: bespoke, 1-2 PAGES
  "Relevant Period"     ← a PERIOD SPEC : LTM, annualised for first 3 tests, ...
```

Tests are near-universal across agreements. Defined terms are where every agreement is different. So:

- **Tests → structured schema, always.** `[ESTIMATE]` ~95% coverage; the escape hatch at test level is rare (multi-condition tests, "no more than 1 breach in any 4 quarters").
- **Defined terms → structured *by default*, formula *by exception*.**
- **Facts → never authored; extracted, versioned, provenance-bearing.**

And the load-bearing decision:

> **One IR.** `StructuredDefinition` is *lowered* to a `QmlAst`. The interpreter, the type/unit checker, the fuel meter, the trace emitter, the provenance plumbing and the versioning machinery are written **once**. There is no "structured evaluator" and "formula evaluator" that can drift apart.

```
StructuredDefinition ──lower()──┐
                                ├──► QmlAst ──► check() ──► evaluate(env, budget) ──► {value, trace}
QML source ──parse()────────────┘                                        ▲
                                                                    FactSet (pinned)
```

There is also a partial inverse, `lift(QmlAst) → StructuredDefinition | null`, used purely for *display* — if a formula happens to match the canonical adjustment-stack shape, the UI renders it as cards instead of code.

---

## 1. Numeric and unit model (foundation — get this wrong and nothing else matters)

### 1.1 Decimals, not floats

```ts
/** decimal128 semantics: 34 significant digits, ROUND_HALF_EVEN.
 *  Configured ONCE at engine boot; the config is part of ENGINE_VERSION
 *  and is snapshotted into every trace. Changing it is a major version bump. */
export const DECIMAL_CONFIG = {
  precision: 34,
  rounding: 'ROUND_HALF_EVEN',   // banker's; presentation rounding is separate & explicit
  minExponent: -6144,
  maxExponent:  6144,            // hard clamp: kills 10^999999999 memory bombs
  toExpNeg: -34,
  toExpPos:  34,
} as const;

export type Dec = { readonly __dec: unique symbol };  // opaque wrapper over decimal.js
```

Rationale: IEEE-754 binary floats make `0.1 + 0.2 !== 0.3`, and a covenant that fails by 0.0001x because of float drift is a lawsuit. Presentation rounding (`4.4972 → 4.50x`) is an **explicit operation in the AST** (`round(x, 2, HALF_UP)`), never implicit, because agreements sometimes specify rounding ("rounded to two decimal places") and whether you round before or after comparison decides pass/fail at the margin.

### 1.2 Units and currency in the type system

```ts
export type CurrencyCode = 'GBP' | 'EUR' | 'USD' | 'CHF' | 'SEK' | 'NOK' | 'DKK' | 'PLN';

/** A currency slot may be statically known, or bound to the facility's base ccy. */
export type CcySlot =
  | { kind: 'fixed'; ccy: CurrencyCode }
  | { kind: 'facility' }                      // Money<@facility>
  | { kind: 'var'; id: number };              // unification variable, checker-internal

export type Unit =
  | { kind: 'money'; ccy: CcySlot }
  | { kind: 'ratio' }                          // dimensionless; displayed 'x' or '%'
  | { kind: 'percent' }                        // ratio with /100 display semantics
  | { kind: 'count' }
  | { kind: 'days' }
  | { kind: 'date' }
  | { kind: 'bool' }
  | { kind: 'list'; of: Unit }
  | { kind: 'record'; fields: Readonly<Record<string, Unit>> };
```

Checker rules (all enforced statically, before any evaluation):

| Expression | Rule |
|---|---|
| `Money<A> + Money<B>` | requires `A ≡ B` after unification, else `E_CCY_MISMATCH` |
| `Money<A> / Money<A>` | → `Ratio` |
| `Money<A> / Money<B>`, A≠B | **rejected** — must go through `fx()` |
| `Money<A> * Ratio` | → `Money<A>` |
| `Money<A> * Money<B>` | **rejected** (no dimension for money²) |
| `Ratio < Ratio`, `Money<A> < Money<A>` | ok; `Money < Ratio` rejected |
| `sum(x @ LTM)` where `x.temporality === 'stock'` | **rejected** `E_STOCK_SUMMED` |
| `x @ TEST_DATE` where `x.temporality === 'flow'` | **rejected**; must use `@ LTM`, `@ QUARTER`, or `avg_over(...)` |

That last pair — the **flow/stock discriminator** — catches, in my experience of how these models go wrong, more real bugs than anything else. Summing four quarters of *closing net debt* is the classic error, and it silently produces a number 4x too big that still "looks like" a leverage input.

### 1.3 Values at runtime

```ts
export type QValue =
  | { t: 'money';  v: Dec; ccy: CurrencyCode }
  | { t: 'ratio';  v: Dec }
  | { t: 'percent';v: Dec }         // stored as fraction: 20% => 0.20
  | { t: 'count';  v: Dec }
  | { t: 'days';   v: Dec }
  | { t: 'date';   v: IsoDate }     // 'YYYY-MM-DD', no time, no tz — ever
  | { t: 'bool';   v: boolean }
  | { t: 'list';   v: ReadonlyArray<QValue> }
  | { t: 'record'; v: ReadonlyMap<string, QValue> };   // Map, never a JS object
```

`record` is a `Map`, never a plain object. That is a deliberate security choice — see §3.4.

---

## 2. The structured schema (the 90% surface)

### 2.1 Canonical financial taxonomy (the "chart of accounts")

Extraction targets a fixed, versioned taxonomy. Bespoke definitions reference taxonomy nodes, never free text.

```ts
export type Temporality = 'flow' | 'stock';

export interface TaxonomyNode {
  path: string;                 // 'pnl.operating_profit'
  label: string;                // 'Operating profit (EBIT)'
  temporality: Temporality;
  unit: 'money' | 'count' | 'ratio';
  sign: 'natural' | 'positive'; // 'positive' => always stored as a positive magnitude
  synonyms: string[];           // extraction hints: 'Operating profit', 'EBIT', 'Result from operations'
  taxonomyVersion: number;
}
```

Illustrative subset (real system: ~180 nodes across P&L / BS / CF / covenant-specific / non-financial):

```
pnl.revenue                       flow
pnl.gross_profit                  flow
pnl.operating_profit              flow
pnl.depreciation                  flow  positive
pnl.amortisation                  flow  positive
pnl.impairment                    flow  positive
pnl.exceptional_items             flow  natural
pnl.share_based_payments          flow  positive
pnl.gain_on_disposal              flow  natural
pnl.interest_payable              flow  positive
pnl.interest_receivable           flow  positive
pnl.tax_charge                    flow
bs.cash_and_equivalents           stock
bs.cash_restricted                stock
bs.senior_debt_current            stock
bs.senior_debt_noncurrent         stock
bs.mezz_debt                      stock
bs.shareholder_loans              stock
bs.finance_leases                 stock       # IFRS16 flag — see §2.5
bs.capitalised_arrangement_fees   stock
cf.capex_tangible                 flow  positive
cf.capex_intangible               flow  positive
cf.working_capital_movement       flow  natural
cf.tax_paid                       flow  positive
cf.scheduled_amortisation         flow  positive
fac.rcf_commitment                stock
fac.rcf_drawn                     stock
fac.rcf_ancillary_utilised        stock
```

### 2.2 Facts

```ts
export type IsoDate = string & { readonly __iso: unique symbol };

export interface Fact {
  id: string;                        // fct_...
  tenantId: string;
  facilityId: string;
  obligorGroupId: string;            // which consolidation perimeter — see §8.3
  taxonomyPath: string;
  taxonomyVersion: number;

  periodStart: IsoDate;              // for stock items, == periodEnd
  periodEnd: IsoDate;
  basis: 'audited' | 'management' | 'borrower_certificate' | 'proforma' | 'analyst_override' | 'forecast';

  value: Dec;
  ccy: CurrencyCode;

  provenance: ProvenanceRef;
  confidence: number;                // 0..1 from extraction; 1.0 for human-keyed
  status: 'proposed' | 'approved' | 'rejected' | 'superseded';
  approvedBy?: string; approvedAt?: string;
  supersedesFactId?: string;         // restatements chain, never overwrite
  createdAt: string;                 // system time
}

export interface ProvenanceRef {
  kind: 'document' | 'derived' | 'manual' | 'external_feed';
  documentId?: string;
  documentVersionId?: string;        // content hash of the exact PDF bytes
  page?: number;                     // 1-indexed
  bbox?: [number, number, number, number];   // PDF user-space points
  coordSystem?: 'pdf_points_topleft';
  pageRotation?: 0 | 90 | 180 | 270;
  cellRef?: string;                  // 'Sheet1!C14' for XLSX packs
  extractedBy: 'ocr' | 'native_text' | 'table_model' | 'llm' | 'human' | 'api';
  extractorVersion?: string;
  rawText?: string;                  // '(1,234)' exactly as it appears
  normalisationNote?: string;        // 'parenthesis => negative; thousands scale applied'
  manualReason?: string;             // REQUIRED when kind === 'manual'
}
```

Facts are **immutable**. A restatement inserts a new fact with `supersedesFactId`; old runs keep pointing at the old fact and therefore still reproduce.

### 2.3 Defined terms — the adjustment stack

```ts
export type DefinedTermId = string;  // 'trm_...'

export interface DefinedTerm {
  id: DefinedTermId;
  agreementId: string;
  slug: string;                      // 'consolidated_ebitda'
  displayName: string;               // 'Consolidated EBITDA'
  unit: Unit;
  defaultPeriod: PeriodSpec;
  body: DefinitionBody;
  citations: Citation[];             // where in the agreement this comes from
  interpretationNotes: InterpretationNote[];
}

export type DefinitionBody =
  | { kind: 'structured'; base: Operand; adjustments: Adjustment[]; postProcess?: PostProcess[] }
  | { kind: 'formula';    language: 'qml/1'; source: string }
  | { kind: 'manual';     reason: string };   // analyst keys the term directly each quarter

/** ORDER MATTERS. Caps expressed as "% of EBITDA" bind against the running
 *  subtotal at that point in the stack unless anchoredTo says otherwise. */
export interface Adjustment {
  id: string;
  label: string;                     // 'Add back: exceptional items'
  sign: 'add' | 'deduct';
  operand: Operand;
  condition?: Operand;               // Bool; adjustment applies only if true
  limit?: Limit;
  citation?: Citation;
  note?: string;
}

export type Operand =
  | { kind: 'lineItem'; path: string; period?: PeriodSpec }
  | { kind: 'term'; slug: string; period?: PeriodSpec }
  | { kind: 'param'; slug: string }
  | { kind: 'constant'; unit: Unit; value: string }         // decimal string, never a JS number
  | { kind: 'sumOfEvents'; eventType: EventType; field: string;
      period?: PeriodSpec; filter?: Operand }
  | { kind: 'formula'; language: 'qml/1'; source: string }  // ◄ GRANULAR ESCAPE HATCH
  | { kind: 'manualInput'; slug: string; unit: Unit; prompt: string };

export type Limit =
  | { kind: 'cap';    amount: Operand;
      anchoredTo?: 'running_subtotal' | 'pre_adjustment_base' | 'final_value' | 'term:<slug>' }
  | { kind: 'floor';  amount: Operand }
  | { kind: 'collar'; min: Operand; max: Operand }
  | { kind: 'capPerAnnum';   amount: Operand; window: 'financial_year' | 'ltm' }
  | { kind: 'capAggregate';  amount: Operand; scope: 'life_of_facility';
      consumedBy: 'prior_test_dates' };   // basket consumption — see §2.6

export type PostProcess =
  | { kind: 'roundTo'; dp: number; mode: 'HALF_UP' | 'HALF_EVEN' | 'DOWN' }
  | { kind: 'floorAtZero' }                                  // "Net Debt shall not be less than zero"
  | { kind: 'annualise'; rule: AnnualisationRule }
  | { kind: 'convertTo'; ccy: CurrencyCode | '@facility'; fxPolicy: FxPolicyRef };
```

### 2.4 Covenant tests

```ts
export type CovenantType =
  | 'leverage' | 'senior_leverage' | 'net_leverage'
  | 'interest_cover' | 'cashflow_cover' | 'debt_service_cover'
  | 'capex' | 'minimum_liquidity' | 'minimum_ebitda'
  | 'ltv' | 'loan_to_cost' | 'net_worth' | 'gearing'
  | 'custom';

export interface CovenantTest {
  id: string;
  agreementId: string;
  type: CovenantType;
  displayName: string;                 // 'Clause 21.2(a) — Leverage'
  clauseRef: string;

  /** The metric. Either a ratio of two terms, a single term, or a formula. */
  metric:
    | { kind: 'ratio'; numeratorTermSlug: string; denominatorTermSlug: string;
        onZeroDenominator: 'pass' | 'fail' | 'treat_as_infinite' | 'error';
        onNegativeNumerator?: 'floor_at_zero' | 'allow_negative' }
    | { kind: 'level'; termSlug: string }
    | { kind: 'formula'; language: 'qml/1'; source: string };   // ◄ TEST-LEVEL ESCAPE HATCH

  comparator: '<=' | '<' | '>=' | '>' | '=';
  thresholds: ThresholdSchedule;
  period: PeriodSpec;
  schedule: TestSchedule;

  materiality?: { kind: 'deMinimis'; amount: Operand } | { kind: 'toleranceBps'; bps: number };
  cureRight?: CureRight;
  graceDays?: number;                   // remedy period before Event of Default
  reportingDeadlineDays?: number;       // compliance certificate due N days after test date
  presentationDp: number;               // display: 2 for leverage (4.50x)
  roundBeforeCompare: boolean;          // ◄ decides pass/fail at the margin. Default false.
}

export interface ThresholdSchedule {
  entries: ThresholdEntry[];
  keyedBy: 'test_index' | 'test_date';  // prefer test_index (agreements count Test Dates)
  outOfRangeBehaviour: 'use_last' | 'error';
}

export interface ThresholdEntry {
  fromTestIndex?: number;               // 1-based; inclusive
  toTestIndex?: number;                 // inclusive; undefined = thereafter
  fromDate?: IsoDate; toDate?: IsoDate;
  value: Operand;                       // usually a constant, may be a param or formula
  comparatorOverride?: CovenantTest['comparator'];
  sourceAmendmentId?: string;           // which amendment introduced this row
}

export interface TestSchedule {
  frequency: 'quarterly' | 'semi_annual' | 'annual' | 'monthly';
  financialYearEnd: { month: number; day: number };
  firstTestDate: IsoDate;
  holidayTestIndices: number[];         // covenant holiday: [1,2] = first two not tested
  lastTestDate?: IsoDate;
  testDateConvention: 'last_day_of_quarter' | 'nearest_business_day' | 'fixed_dates';
  fixedDates?: IsoDate[];
  suspensions?: Array<{ fromTestIndex: number; toTestIndex: number;
                        reason: string; amendmentId: string }>;  // covid-style waivers
}
```

### 2.5 Worked structured example — Leverage with step-downs

```jsonc
{
  "id": "cov_kestrel_leverage",
  "type": "leverage",
  "displayName": "Clause 21.2(a) — Leverage",
  "clauseRef": "21.2(a)",
  "metric": {
    "kind": "ratio",
    "numeratorTermSlug": "total_net_debt",
    "denominatorTermSlug": "consolidated_ebitda",
    "onZeroDenominator": "fail",
    "onNegativeNumerator": "floor_at_zero"      // "if Total Net Debt is negative, Leverage is zero"
  },
  "comparator": "<=",
  "thresholds": {
    "keyedBy": "test_index",
    "outOfRangeBehaviour": "use_last",
    "entries": [
      { "fromTestIndex": 3, "toTestIndex": 6,  "value": {"kind":"constant","unit":{"kind":"ratio"},"value":"4.50"} },
      { "fromTestIndex": 7, "toTestIndex": 10, "value": {"kind":"constant","unit":{"kind":"ratio"},"value":"4.00"} },
      { "fromTestIndex": 11,                    "value": {"kind":"constant","unit":{"kind":"ratio"},"value":"3.50"} }
    ]
  },
  "period": { "basis": "LTM", "anchor": "TEST_DATE",
              "overrides": [{ "testIndexUpTo": 4, "annualisation": "since_closing_x_365" }] },
  "schedule": {
    "frequency": "quarterly",
    "financialYearEnd": { "month": 12, "day": 31 },
    "firstTestDate": "2025-03-31",
    "holidayTestIndices": [1, 2],
    "testDateConvention": "last_day_of_quarter"
  },
  "roundBeforeCompare": false,
  "presentationDp": 2,
  "cureRight": { "$ref": "cure_kestrel_standard" }
}
```

And `total_net_debt` as a structured term — note the IFRS 16 problem, which is real and frequent:

```jsonc
{
  "slug": "total_net_debt",
  "unit": { "kind": "money", "ccy": { "kind": "facility" } },
  "defaultPeriod": { "basis": "POINT_IN_TIME", "anchor": "TEST_DATE" },
  "body": {
    "kind": "structured",
    "base": { "kind": "lineItem", "path": "bs.senior_debt_current" },
    "adjustments": [
      { "id":"a1","sign":"add","label":"Senior debt (non-current)",
        "operand": {"kind":"lineItem","path":"bs.senior_debt_noncurrent"} },
      { "id":"a2","sign":"add","label":"Mezzanine",
        "operand": {"kind":"lineItem","path":"bs.mezz_debt"} },
      { "id":"a3","sign":"add","label":"Finance leases (frozen GAAP: pre-IFRS16 only)",
        "operand": {"kind":"lineItem","path":"bs.finance_leases_pre_ifrs16"},
        "citation": {"clause":"1.2(c)","page":31,
                     "quote":"...determined in accordance with the Original Accounting Principles"} },
      { "id":"a4","sign":"add","label":"Add back capitalised arrangement fees",
        "operand": {"kind":"lineItem","path":"bs.capitalised_arrangement_fees"} },
      { "id":"a5","sign":"deduct","label":"Shareholder loans (excluded - subordinated)",
        "operand": {"kind":"lineItem","path":"bs.shareholder_loans"},
        "condition": {"kind":"param","slug":"shareholder_loans_are_excluded"} },
      { "id":"a6","sign":"deduct","label":"Cash and cash equivalents (capped)",
        "operand": {"kind":"lineItem","path":"bs.cash_and_equivalents"},
        "limit": {"kind":"cap","amount":{"kind":"param","slug":"cash_netting_cap"}},
        "citation": {"clause":"1.1 (Total Net Debt)","page":44,
                     "quote":"...less Cash and Cash Equivalents (up to a maximum of £10,000,000)"} },
      { "id":"a7","sign":"deduct","label":"Restricted cash is NOT deductible",
        "operand": {"kind":"constant","unit":{"kind":"money","ccy":{"kind":"facility"}},"value":"0"},
        "note": "Restricted cash deliberately excluded per cl.1.1 proviso (b)" }
    ],
    "postProcess": [{ "kind": "floorAtZero" }]
  }
}
```

### 2.6 Lowering: structured → QML

```ts
export function lower(term: DefinedTerm, ctx: LowerCtx): QmlAst
```

The `total_net_debt` above lowers to (rendered back as QML source for reviewability — the UI shows this on demand under "view as formula"):

```
# lowered from structured definition trm_total_net_debt @ v3
let base   = LineItem.bs.senior_debt_current @ TEST_DATE;
let a1     = LineItem.bs.senior_debt_noncurrent @ TEST_DATE;
let a2     = LineItem.bs.mezz_debt @ TEST_DATE;
let a3     = LineItem.bs.finance_leases_pre_ifrs16 @ TEST_DATE;
let a4     = LineItem.bs.capitalised_arrangement_fees @ TEST_DATE;
let a5     = if Param.shareholder_loans_are_excluded
             then LineItem.bs.shareholder_loans @ TEST_DATE
             else GBP 0;
let a6     = cap(LineItem.bs.cash_and_equivalents @ TEST_DATE, Param.cash_netting_cap);
let total  = base + a1 + a2 + a3 + a4 - a5 - a6;
in floor_at(total, GBP 0)
```

Every `let` name is stable and carries the adjustment `id` and `label` as AST metadata, so the trace produced by the lowered form is *identical in shape* to the structured card stack — that is what lets one trace renderer serve both halves.

---

## 3. QML — the escape hatch

### 3.1 Design constraints

1. **Total** — every program terminates. No `while`, no recursion, no unbounded iteration.
2. **Pure** — no IO, no clock, no random, no locale, no mutation.
3. **Statically typed with units** — errors surface in the editor, not at quarter-close.
4. **Small** — one person must be able to hold the whole grammar and interpreter in their head. Target ≤ 2,500 LOC for lexer + parser + checker + interpreter + trace emitter.
5. **Reversible to prose** — an AST must be renderable as English for the credit committee.

### 3.2 Grammar (EBNF, `qml/1`)

```ebnf
program      = { statement } , expr ;
statement    = "let" , ident , [ ":" , type ] , "=" , expr , ";"
             | "assert" , expr , [ "," , string ] , ";" ;

expr         = ifExpr ;
ifExpr       = "if" , expr , "then" , expr , "else" , expr | orExpr ;
orExpr       = andExpr , { "or" , andExpr } ;
andExpr      = notExpr , { "and" , notExpr } ;
notExpr      = [ "not" ] , cmpExpr ;
cmpExpr      = addExpr , [ ( "=" | "<>" | "<" | "<=" | ">" | ">=" ) , addExpr ] ;
addExpr      = mulExpr , { ( "+" | "-" ) , mulExpr } ;
mulExpr      = unary , { ( "*" | "/" ) , unary } ;
unary        = [ "-" ] , postfix ;
postfix      = primary , { "@" , periodExpr | "." , ident } ;
primary      = literal | reference | call | comprehension | "(" , expr , ")" ;

reference    = namespace , "." , path ;
namespace    = "LineItem" | "Term" | "Param" | "Facility" | "Period"
             | "Events"   | "Cure" | "Threshold" | "Fx" | ident ;   (* ident = let-bound *)
path         = ident , { "." , ident } ;

call         = builtin , "(" , [ expr , { "," , expr } ] , ")" ;
comprehension= ( "sum_over" | "count_over" | "max_over" | "min_over" | "avg_over" ) ,
               "(" , collection , "," , ident , "->" , expr ,
               [ "where" , expr ] , ")" ;
collection   = "Events" , "." , ident , [ "@" , periodExpr ]
             | "quarters" , "(" , integer , ")"
             | "test_dates" , "(" , integer , ")" ;

periodExpr   = "LTM" | "TEST_DATE" | "QUARTER" | "YTD" | "FY" | "PRIOR_FY"
             | "LTM" , "(" , periodExpr , ")"
             | "Q"  , "(" , signedInt , ")"
             | "PERIOD" , "(" , expr , "," , expr , ")" ;

literal      = decimal | moneyLit | percentLit | dateLit | boolLit | stringLit ;
moneyLit     = ccyCode , decimal ;                  (* GBP 5_000_000 *)
percentLit   = decimal , "%" ;                      (* 20% *)
dateLit      = "@" , iso8601date ;                  (* @2026-03-31 *)
decimal      = digit , { digit | "_" } , [ "." , digit , { digit | "_" } ] ;
comment      = "#" , { any-char-except-newline } ;
```

Deliberately absent: assignment, loops, user functions, string concatenation, indexing by computed integer, `null`, exceptions, imports, any form of dynamic dispatch.

### 3.3 Builtins (the complete whitelist — nothing else resolves)

```
# arithmetic / shaping
abs(Money|Ratio) -> same
min(a, b, ...)   max(a, b, ...)          # ≤ 8 args, homogeneous unit
cap(x, ceiling)                          # = min(x, ceiling)
floor_at(x, floor)                       # = max(x, floor)
clamp(x, lo, hi)
round(x, dp: Count, mode: HALF_UP|HALF_EVEN|DOWN|UP) -> same
trunc(x, dp)

# ratios & safety
safe_div(num, den, on_zero: Ratio) -> Ratio
pct_of(x, p: Percent) -> same-as-x

# periods
annualise(x: Money, months_elapsed: Count) -> Money
days_between(a: Date, b: Date) -> Days
prorate(x, days_in: Days, days_of: Days) -> same

# fx
fx(x: Money<A>, to: CurrencyCode, basis: CLOSING|AVERAGE_LTM|AGREEMENT_FIXED|ACCOUNTS) -> Money<to>

# aggregation over bounded collections only
sum_over / count_over / max_over / min_over / avg_over        # comprehension forms

# events / lookups
latest(list, field)                       # list must be statically bounded
exists(list)                              # -> Bool

# bounded numeric solve (opt-in, requires approval flag on the definition)
solve(lower: Money, upper: Money, tolerance: Money, x -> expr) -> Money
   # bisection, HARD CAP 40 iterations, monotonicity asserted at runtime,
   # emits a SolveNode in the trace with every probe recorded

# fixed-point for genuinely circular definitions (opt-in, off by default)
fixpoint(seed, x -> expr, tolerance, max_iters<=20) -> same
```

`solve` and `fixpoint` are the only constructs with iteration, both with **compile-time constant** upper bounds. This is what makes QML total.

### 3.4 Real formula examples

**(a) The bespoke EBITDA from the brief** — including the genuine circularity trap:

```
# Project Kestrel SFA cl.1.1 "Consolidated EBITDA"
# INTERPRETATION NOTE int_0091: the 20% synergy cap is read as 20% of EBITDA
# *before* synergy add-backs. Clause is ambiguous; agreed with credit committee
# 2026-02-11; alternative reading modelled in scenario 'kestrel_synergy_post'.

let base          = LineItem.pnl.operating_profit @ LTM;
let dna           = LineItem.pnl.depreciation @ LTM
                  + LineItem.pnl.amortisation @ LTM;

# (b) exceptional or non-recurring items, capped at £500k per annum
let exceptionals  = cap(LineItem.pnl.exceptional_items @ LTM, GBP 500_000);

# (c) transaction costs of Permitted Acquisitions
let txn_costs     = sum_over(Events.permitted_acquisitions @ LTM,
                             a -> a.transaction_costs);

# (d) run-rate synergies, realisable within 12 months
let synergies_raw = sum_over(Events.permitted_acquisitions @ LTM,
                             a -> a.run_rate_savings
                             where a.realisable_within_months <= 12);

# (e) less gains on disposal
let disposals     = LineItem.pnl.gain_on_disposal @ LTM;

let pre_synergy   = base + dna + exceptionals + txn_costs - disposals;
let synergies     = cap(synergies_raw, pct_of(pre_synergy, 20%));

assert pre_synergy > GBP 0, "EBITDA before synergies is negative — escalate, cap is meaningless";

in pre_synergy + synergies
```

**Note the circularity.** "capped at 20% of EBITDA" is self-referential. The checker **rejects** `Term.consolidated_ebitda` appearing inside `consolidated_ebitda` (cycle detection over the term DAG) and forces the author to either (i) pick an explicit anchor as above and record an `InterpretationNote` with a citation, or (ii) opt into `fixpoint`. This is not a limitation to apologise for — it is the product surfacing a real ambiguity in the customer's own contract, which is exactly what a covenant-intelligence tool should do.

**(b) A DSCR with a genuinely bespoke cash waterfall** — the kind of thing the structured schema cannot express:

```
# cl.1.1 "Debt Service Cover Ratio" — Project Halyard
let cfads =
      Term.consolidated_ebitda @ LTM
    - LineItem.cf.tax_paid @ LTM
    - LineItem.cf.capex_maintenance @ LTM
    + LineItem.cf.working_capital_movement @ LTM
    - cap(LineItem.cf.capex_growth @ LTM,
          max(pct_of(Term.consolidated_ebitda @ LTM, 10%), GBP 1_000_000));

# Debt service excludes the balloon, and treats the RCF as debt service only to
# the extent of the *average* drawn balance over the period (cl.1.1 proviso (iii))
let rcf_avg = avg_over(quarters(4), q -> LineItem.fac.rcf_drawn @ Q(q));
let ds =
      LineItem.pnl.interest_payable @ LTM
    - LineItem.pnl.interest_receivable @ LTM
    + LineItem.cf.scheduled_amortisation @ LTM
    + pct_of(rcf_avg, Param.rcf_margin_plus_base)
    - (if Period.index = Param.final_test_index then Param.balloon_amount else GBP 0);

in safe_div(cfads, ds, 999.00)
```

**(c) A test-level escape hatch** — "no more than one breach in any four consecutive Test Dates":

```
# cl.21.4 — Leverage is only an Event of Default if breached twice in 4 quarters
let breaches = count_over(test_dates(4), t ->
                 Term.leverage_ratio @ Q(t) > Threshold.leverage @ Q(t));
in breaches <= 1
```

**(d) Equity cure sizing via `solve`** (see §7.4):

```
# smallest injection E such that Leverage <= threshold after applying the cure
in solve(GBP 0, GBP 25_000_000, GBP 1_000, e ->
     safe_div(Term.total_net_debt - (if Param.cure_reduces_debt then e else GBP 0),
              Term.consolidated_ebitda + (if Param.cure_increases_ebitda then e else GBP 0),
              999.00)
     - Threshold.leverage)
```

### 3.5 The interpreter

```ts
export interface EvalBudget {
  fuel: number;                  // default 200_000 — decremented per AST node visit
  deadlineMs: number;            // default 250 — monotonic clock checked every 1024 steps
  maxListCardinality: number;    // default 2_000
  maxTraceNodes: number;         // default 5_000
  maxLetBindings: number;        // default 256
  maxAstDepth: number;           // default 64  (enforced at parse)
  maxSourceBytes: number;        // default 32_768 (enforced at lex)
  maxTokens: number;             // default 8_192
  maxSolveIterations: number;    // default 40
}

export interface EvalResult {
  ok: boolean;
  value?: QValue;
  diagnostics: Diagnostic[];
  trace: CalculationTrace;
  meters: { fuelUsed: number; wallMs: number; traceNodes: number; factsRead: string[] };
}

export function evaluate(
  ast: QmlAst,                   // already type-checked
  env: BoundEnvironment,         // ◄ pre-scoped, tenant-filtered, immutable
  budget: EvalBudget,
): EvalResult;
```

`BoundEnvironment` is assembled by the **host**, not the formula:

```ts
export interface BoundEnvironment {
  readonly tenantId: string;
  readonly facilityId: string;
  readonly runId: string;
  readonly testDate: IsoDate;
  readonly testIndex: number;
  readonly facts: ReadonlyMap<string, Fact>;         // key: `${path}|${periodStart}|${periodEnd}|${basis}`
  readonly terms: ReadonlyMap<string, QmlAst>;       // already version-resolved
  readonly params: ReadonlyMap<string, QValue>;
  readonly events: ReadonlyMap<EventType, ReadonlyArray<QValue>>;
  readonly fxRates: ReadonlyMap<string, Dec>;        // pinned rate set
  readonly thresholds: ReadonlyMap<string, QValue>;
  readonly facility: ReadonlyMap<string, QValue>;
}
```

Every collection is a `ReadonlyMap`, populated **only** with rows already filtered to `tenantId` + `facilityId` by a Postgres query running under row-level security. A formula therefore cannot name data it should not see, because that data is not in the environment at all. Namespace resolution is `map.get(key)` — never `obj[key]`.

---

## 4. Security model

**Threat framing.** This code path evaluates definitions *derived from customer-supplied PDFs, partly authored by an LLM*. Assume the PDF is adversarial (a borrower who wants to hide a breach; a third party who has planted an injection string in a document). Assume the LLM can be induced to emit any string. The security posture must therefore hold even if **the formula text is fully attacker-controlled**.

### 4.1 Why not sandboxed JS

| Option | Verdict |
|---|---|
| `Function` / `eval` | Absolutely not. Full host access. |
| `node:vm` | No. Node's own documentation states `vm` is **not a security mechanism**; escape via `this.constructor.constructor('return process')()` is a well-known one-liner. `[VERIFY]` — restate from current Node docs before publishing any security whitepaper, but I'm confident this is right. |
| `isolated-vm` | A genuine V8-isolate boundary and would work, but: native addon (build/deploy burden on every Node upgrade for a solo founder); Turing-complete so needs isolate termination rather than clean fuel exhaustion; IEEE-754 floats by default, which is a determinism hazard for money; and crucially **not statically analysable**, so the review UI cannot show a credit committee what the definition does. `[VERIFY]` maintenance status/compat with current Node. |
| QuickJS compiled to WASM | Reasonable fallback with real memory/interrupt control, and the option I'd take if a customer ever demands "we want to write JS". Still fails the auditability requirement. |
| **Custom AST interpreter (chosen)** | No host bridging exists to escape *to*. Total by construction. Decimal by construction. Statically analysable, diffable, and renderable as English. |

The decisive argument is not raw security — `isolated-vm` is secure enough. It is that **institutional buyers must be able to read the definition**, and a diffable, unit-checked, English-renderable AST is a product feature, not just a sandbox.

### 4.2 Threat table

| # | Threat | Mitigation |
|---|---|---|
| T1 | Arbitrary code execution / host escape | No `eval`/`Function`/`vm`/`require`/dynamic import anywhere in the path. Interpreter walks a closed AST union; values are a closed `QValue` union. There is no expressible reference to a host object. |
| T2 | Prototype pollution (`__proto__`, `constructor`, `prototype` as identifiers) | Lexer **rejects** these three identifiers outright (`E_RESERVED_IDENT`). Independently, all lookups go through `Map.get`, and records are `Map`s, so even if one slipped through it would be an ordinary missing key. Defence in depth: `Object.freeze` on env maps; interpreter module runs with `Object.prototype` untouched. |
| T3 | ReDoS | The language has **no regex feature**. The lexer is a hand-written character-class scanner with no backtracking (single pass, O(n)). No `RegExp` object is constructed anywhere in lex/parse/check/eval. |
| T4 | CPU exhaustion | Fuel counter decremented on every node visit (default 200k; a large real EBITDA definition uses `[ESTIMATE]` ~2–5k). Wall-clock deadline of 250ms checked every 1024 steps via `process.hrtime.bigint()`. `solve`/`fixpoint` have compile-time iteration caps. Comprehensions iterate only over collections whose cardinality is known at bind time and checked against `maxListCardinality`. |
| T5 | Memory exhaustion | Decimal exponent clamped to ±6144, so `10^999999999` is a checker/runtime error, not a 4GB allocation. No string concatenation operator exists. No list construction operator exists (comprehensions *reduce*, never build). Trace node count capped at 5,000. Evaluation runs in a `worker_threads` Worker with `resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 }` — an OOM kills the worker, not the API process. |
| T6 | Stack overflow via deep nesting | Parse-time `maxAstDepth = 64`, enforced by an explicit depth counter in the recursive-descent parser, checked *before* recursing. |
| T7 | Cross-tenant data access | The formula's entire universe is `BoundEnvironment`, built from a query that already applied Postgres RLS (`tenant_id = current_setting('app.tenant_id')`). There is no I/O primitive, so a formula cannot widen its own scope. Terms referenced by `Term.x` are resolved by the host against the same agreement only. |
| T8 | **Prompt injection → hostile formula** (the real one) | Layered: (a) the language cannot cause harm even if fully attacker-written — worst case is a wrong number or exhausted fuel; (b) the LLM never writes to a live definition — it produces a `DefinitionProposal` in `status: 'draft'`; (c) static gate on every proposal: unresolvable references, references to terms outside this agreement, `solve`/`fixpoint` usage, estimated fuel above a threshold, or unit-check failure → **auto-reject**; (d) **dual-control human approval** required to move `draft → active`, with the PDF clause shown side-by-side; (e) impact preview re-runs the last 8 quarters and shows any status flips before approval. |
| T9 | Formula tampering after approval | Definition rows are append-only; `content_hash = sha256(canonical_json(normalised_ast))` is stored on the version and re-verified at load time. A mismatch is a hard fail plus a security alert. |
| T10 | Trace as an exfiltration channel | Traces contain only values the formula could already compute. Trace rendering is authorised by the same facility ACL as the run. |
| T11 | Supply chain | Only runtime dependency in the eval path is the decimal library, pinned by integrity hash. Lexer/parser/checker/interpreter are first-party. No plugin loading. |
| T12 | Availability via pathological *valid* formulas | Fuel + deadline give clean, attributable failures (`E_FUEL_EXHAUSTED` names the node and the term), which the UI surfaces as "definition too expensive — simplify or raise limit with approval". A per-tenant concurrency cap and a per-run aggregate fuel budget (2M across all terms) prevent one facility from starving the pool. |

### 4.3 Determinism guarantees

Determinism is a **product requirement** (an FCA-facing audit trail is worthless if last year's number can't be reproduced), so it is enumerated explicitly:

1. Arithmetic is decimal128 with pinned precision and rounding; the config is part of `ENGINE_VERSION` and is copied into every trace header.
2. No `Date.now()`, no `Math.random()`, no `Intl`, no locale-sensitive formatting, no timezone. All dates are `IsoDate` strings; all "today"-like values come from `env.testDate` / `env.runContext.asOfDate`.
3. No floating point anywhere in the eval path (lint rule bans `number` arithmetic in `src/engine/**` except loop counters and fuel).
4. Map iteration order is never observable: `sum_over` sorts its collection by a declared, total, stable sort key (`(eventDate, eventId)`) before reducing, so addition-order-dependent decimal rounding is fixed.
5. FX rates come from an immutable `FxRateSet` pinned by id on the run.
6. `solve`/`fixpoint` use fixed iteration counts and fixed tolerances; probes are recorded in the trace.
7. **Verification, not just assertion**: a nightly canary re-runs the most recent 200 `CovenantRun`s from their pinned inputs and asserts `traceHash` equality. Any drift pages the founder. This is the only way to actually know the engine is deterministic after a dependency bump.

---

## 5. Interoperation — deciding which half to use

### 5.1 The ladder (enforced in the authoring UI, in order)

```
1. Can it be expressed as base + ordered adjustments with cap/floor/condition?
      → STRUCTURED. Always prefer. Diffable, English-renderable, cheap to review.
2. Is only ONE adjustment's *amount* awkward?
      → STRUCTURED with { kind: 'formula' } operand on that adjustment.  ◄ most common escape
3. Is the awkward thing a MISSING PRIMITIVE that ≥3 agreements have hit?
      → EXTEND THE SCHEMA (new Limit kind / new PostProcess), migrate the formula users.
         The escape hatch is instrumented precisely to detect this (§5.3).
4. Is the whole term a bespoke waterfall (excess cashflow, CFADS, borrowing base)?
      → FULL FORMULA term.
5. Is the TEST itself non-standard (multi-condition, look-back counting)?
      → FORMULA metric on the test.
6. Is the data simply not derivable from anything we hold?
      → MANUAL term with mandatory reason + citation. Not a failure — a supported state.
```

### 5.2 Why they can't drift

Because `lower()` produces the same IR, all of the following are written once and apply identically to both halves: type/unit checking, cycle detection over the term DAG, fuel metering, trace emission, provenance attachment, versioning, impact preview, English rendering, dependency graph for "what breaks if this fact is restated".

A differential test suite asserts the invariant: for each of the ~50 corpus definitions authored structurally, a hand-written QML equivalent must produce a bit-identical value **and** an isomorphic trace shape.

### 5.3 Instrumenting the boundary

Every definition version records `authoringMode` and, when a formula is used, a required `escapeReason` chosen from an enum:

```ts
export type EscapeReason =
  | 'nonlinear_cap' | 'cross_period_reference' | 'conditional_on_event'
  | 'waterfall' | 'lookback_counting' | 'circular_definition'
  | 'perimeter_arithmetic' | 'fx_bespoke' | 'other';
```

A weekly report groups formulas by `escapeReason` and by AST-shape clustering. Any cluster with ≥3 agreements is a schema-extension candidate. This turns "the 10%" from a permanent tax into a backlog that shrinks.

---

## 6. Calculation trace & provenance

### 6.1 Trace model

```ts
export interface CalculationTrace {
  traceId: string;
  runId: string;
  traceHash: string;                  // sha256 of canonical JSON — the reproducibility check
  engineVersion: string;              // 'qm-engine@2.3.1'
  languageVersion: 'qml/1';
  decimalConfigHash: string;
  rootNodeId: string;
  nodes: Record<string, TraceNode>;   // content-deduped DAG
  meters: { fuelUsed: number; wallMs: number; nodeCount: number };
  createdAt: string;
}

export type TraceNode =
  | FactNode | ParamNode | ConstNode | TermNode | OpNode | FnNode
  | LimitNode | AggregateNode | FxNode | PeriodNode | ConditionNode
  | OverrideNode | SolveNode | ProFormaNode | CureNode | ComparisonNode;

interface TraceNodeBase {
  id: string;                         // 'n_' + sha256(shape)[0..16] — content-addressed
  label: string;                      // 'Add back: exceptional items (capped)'
  value: QValue;
  unit: Unit;
  sourceSpan?: { defVersionId: string; start: number; end: number };  // ◄ highlights QML text
  structuredRef?: { adjustmentId: string };                           // ◄ highlights the card
  children: string[];
  flags?: TraceFlag[];
}

export interface FactNode extends TraceNodeBase {
  kind: 'fact';
  factId: string;
  taxonomyPath: string;
  period: { start: IsoDate; end: IsoDate };
  basis: Fact['basis'];
  provenance: ProvenanceRef;          // ◄ page + bbox: the click-through target
  confidence: number;
  supersedesFactId?: string;
}

export interface LimitNode extends TraceNodeBase {
  kind: 'limit';
  limitType: 'cap' | 'floor' | 'collar' | 'capPerAnnum' | 'capAggregate';
  rawValue: QValue;                   // before the limit
  limitValue: QValue;
  binding: boolean;                   // ◄ "the cap BIT — £312,000 was disallowed"
  disallowed?: QValue;
  basketConsumedToDate?: QValue;      // for capAggregate
  basketRemaining?: QValue;
}

export interface FxNode extends TraceNodeBase {
  kind: 'fx';
  from: CurrencyCode; to: CurrencyCode;
  rate: Dec; rateDate: IsoDate;
  rateSetId: string; basis: 'CLOSING' | 'AVERAGE_LTM' | 'AGREEMENT_FIXED' | 'ACCOUNTS';
}

export interface SolveNode extends TraceNodeBase {
  kind: 'solve';
  iterations: number;
  probes: Array<{ x: QValue; f: QValue }>;   // fully replayable
  converged: boolean; tolerance: QValue;
}

export type TraceFlag =
  | { code: 'CAP_BINDING'; detail: string }
  | { code: 'LOW_CONFIDENCE_INPUT'; factId: string; confidence: number }
  | { code: 'UNAPPROVED_FACT'; factId: string }
  | { code: 'MANUAL_OVERRIDE'; by: string; reason: string }
  | { code: 'ESTIMATED_INPUT'; detail: string }
  | { code: 'INTERPRETATION_APPLIED'; noteId: string }
  | { code: 'PRO_FORMA_INCLUDED'; eventId: string }
  | { code: 'STALE_FACT'; detail: string }
  | { code: 'DIVERGES_FROM_BORROWER'; delta: QValue };
```

### 6.2 Worked trace fragment

For `4.32x` leverage on the Kestrel facility, abbreviated:

```jsonc
{
  "traceId": "trc_01J...","runId": "run_01J...","traceHash": "sha256:9f3c...",
  "engineVersion": "qm-engine@2.3.1","rootNodeId": "n_root",
  "nodes": {
    "n_root": { "kind": "comparison", "label": "Clause 21.2(a) — Leverage",
      "value": {"t":"bool","v":true}, "children": ["n_ratio","n_threshold"],
      "comparator": "<=", "status": "PASS",
      "headroomRatio": {"t":"ratio","v":"0.18"},
      "headroomEbitda": {"t":"money","v":"484211","ccy":"GBP"},
      "headroomEbitdaPct": {"t":"percent","v":"0.0387"} },

    "n_ratio": { "kind": "op", "op": "/", "label": "Total Net Debt / Consolidated EBITDA",
      "value": {"t":"ratio","v":"4.3187..."}, "children": ["n_tnd","n_ebitda"] },

    "n_threshold": { "kind": "param", "label": "Threshold (Test 5, step-down tier 1)",
      "value": {"t":"ratio","v":"4.50"},
      "provenance": {"kind":"document","documentId":"doc_sfa","page":118,
                     "bbox":[72,410,523,438],
                     "rawText":"Leverage shall not exceed 4.50:1"} },

    "n_ebitda": { "kind": "term", "termSlug": "consolidated_ebitda",
      "definitionVersionId": "dv_ebitda_v4",
      "value": {"t":"money","v":"12512000","ccy":"GBP"},
      "children": ["n_presyn","n_syn"] },

    "n_syn": { "kind": "limit", "limitType": "cap", "label": "(d) Synergy add-back (capped at 20%)",
      "value": {"t":"money","v":"2402400","ccy":"GBP"},
      "rawValue": {"t":"money","v":"2714000","ccy":"GBP"},
      "limitValue": {"t":"money","v":"2402400","ccy":"GBP"},
      "binding": true,
      "disallowed": {"t":"money","v":"311600","ccy":"GBP"},
      "flags": [{"code":"CAP_BINDING","detail":"£311,600 of claimed synergies disallowed"},
                {"code":"INTERPRETATION_APPLIED","noteId":"int_0091"}],
      "sourceSpan": {"defVersionId":"dv_ebitda_v4","start":812,"end":864},
      "children": ["n_syn_raw","n_syn_cap"] },

    "n_exc": { "kind": "fact", "label": "Exceptional items (LTM)",
      "factId": "fct_8812", "taxonomyPath": "pnl.exceptional_items",
      "period": {"start":"2025-04-01","end":"2026-03-31"},
      "basis": "management",
      "value": {"t":"money","v":"742000","ccy":"GBP"},
      "confidence": 0.94,
      "provenance": { "kind":"document","documentId":"doc_mgmt_q1_26",
        "documentVersionId":"sha256:aa41...","page":14,
        "bbox":[318,512,392,526],"coordSystem":"pdf_points_topleft","pageRotation":0,
        "extractedBy":"table_model","extractorVersion":"tbl@1.7.2",
        "rawText":"(742)","normalisationNote":"thousands scale ×1000; parentheses => expense, sign flipped per taxonomy 'positive'" } }
  }
}
```

Clicking `n_exc` in the UI opens `doc_mgmt_q1_26` page 14 with the bbox highlighted, showing `(742)` and the normalisation note. That is the requirement in the brief, satisfied structurally rather than by convention.

### 6.3 Divergence attribution — the differentiator

The borrower's compliance certificate is itself extracted into a **partial trace** (`BorrowerAssertion` nodes: their EBITDA, their Net Debt, their ratio — plus any sub-lines they show).

```ts
export interface DivergenceReport {
  runId: string;
  ourRatio: QValue; borrowerRatio: QValue; deltaRatio: QValue;
  materiality: 'immaterial' | 'material' | 'status_flipping';
  statusOurs: CovenantStatus; statusTheirs: CovenantStatus;
  /** Highest node in our trace whose value disagrees with the borrower's
   *  corresponding assertion — i.e. the *cause*, not just the symptom. */
  attributions: Array<{
    traceNodeId: string; label: string;
    ourValue: QValue; borrowerValue: QValue; delta: QValue;
    contributionToRatioDelta: QValue;         // sensitivity-weighted
    hypothesis?: string;                       // e.g. 'synergy cap not applied by borrower'
    evidence: ProvenanceRef[];
  }>;
}
```

Algorithm: walk our trace top-down; at each node for which a borrower assertion exists, compare; recurse only into disagreeing subtrees; stop at the first node where all children agree — that node is the cause. Where the borrower gives no sub-line, attribute by **counterfactual re-run**: re-evaluate with each adjustment individually neutralised and rank by how much the ratio delta closes. This is bounded (≤ number of adjustments, typically ≤ 15 evaluations at ~3k fuel each) and fully deterministic.

Output for the analyst: *"Their 4.19x vs our 4.32x. £312k of the difference is the synergy add-back — they claimed £2.714m; cl.1.1(d) caps it at 20% of pre-synergy EBITDA = £2.402m. Cert p.3, agreement p.44."*

---

## 7. Versioning, amendments, and period mechanics

### 7.1 Bitemporal definition versioning

Two independent time axes, because both questions get asked:

- **Business time** — which *test dates* does this version govern? (An amendment executed 2026-11-14 can be expressed to apply from the 2026-09-30 Test Date.)
- **System time** — what did QuarterMark *believe* on a given date? (Needed to explain a report we issued to an investor in October.)

```ts
export interface DefinitionVersion {
  id: string;                          // dv_...
  termId: DefinedTermId;
  versionNo: number;

  // business time (inclusive/exclusive), keyed by test date
  effectiveFromTestDate: IsoDate;
  effectiveToTestDate: IsoDate | null;

  // system time
  recordedAt: string;
  supersededAt: string | null;

  body: DefinitionBody;
  loweredAstHash: string;
  contentHash: string;                 // sha256(canonical(normalisedAst))

  status: 'draft' | 'pending_approval' | 'active' | 'superseded' | 'rejected';
  sourceAmendmentId?: string;
  citations: Citation[];
  interpretationNotes: InterpretationNote[];
  authoringMode: 'structured' | 'formula' | 'hybrid' | 'manual';
  escapeReason?: EscapeReason;

  authoredBy: string; approvedBy?: string; approvedAt?: string;   // 4-eyes: must differ
}
```

Resolution:

```ts
export function resolveDefinition(
  termId: DefinedTermId,
  forTestDate: IsoDate,       // business time
  asKnownAt: string,          // system time; 'now' for live, run.createdAt for reproduction
): DefinitionVersion;
```

### 7.2 Amendments as typed patches

An amendment document is parsed into an ordered patch list, each citing its clause:

```ts
export interface Amendment {
  id: string; agreementId: string; sequence: number;   // 1 = first amendment
  executedOn: IsoDate; effectiveFromTestDate: IsoDate;
  documentId: string;
  patches: AmendmentPatch[];
  status: 'draft' | 'active';
}

export type AmendmentPatch =
  | { op: 'setThreshold'; covenantId: string; entries: ThresholdEntry[]; clauseRef: string }
  | { op: 'addStepDown'; covenantId: string; entry: ThresholdEntry; clauseRef: string }
  | { op: 'replaceDefinition'; termSlug: string; body: DefinitionBody; clauseRef: string }
  | { op: 'amendAdjustment'; termSlug: string; adjustmentId: string;
      patch: Partial<Adjustment>; clauseRef: string }
  | { op: 'addAdjustment'; termSlug: string; adjustment: Adjustment;
      afterAdjustmentId?: string; clauseRef: string }   // position matters for caps
  | { op: 'waiveTest'; covenantId: string; testIndices: number[]; clauseRef: string }
  | { op: 'suspendCovenant'; covenantId: string; fromTestIndex: number; toTestIndex: number }
  | { op: 'changeFrequency'; covenantId: string; frequency: TestSchedule['frequency'];
      reindexPolicy: 'preserve_dates' | 'reindex_from'; clauseRef: string }
  | { op: 'resetCureCount'; covenantId: string; newUsedCount: number; clauseRef: string }
  | { op: 'grantAdditionalCure'; covenantId: string; extraCures: number; clauseRef: string }
  | { op: 'addCovenant'; covenant: CovenantTest; clauseRef: string }
  | { op: 'removeCovenant'; covenantId: string; clauseRef: string }
  | { op: 'setParam'; slug: string; value: string; unit: Unit; clauseRef: string };
```

Folding is deterministic: sort by `(effectiveFromTestDate, executedOn, sequence, patchIndex)`. Two patches touching the same JSON path with overlapping business-time ranges raise `E_AMENDMENT_CONFLICT` and **block activation** until an analyst records a resolution — silently letting last-write-win here is how funds lose track today.

`changeFrequency` carries a `reindexPolicy` because it is a genuine trap: a threshold schedule keyed by `test_index` silently means something different if quarterly testing becomes semi-annual. The system forces an explicit choice and re-renders the resulting schedule as absolute dates for approval.

### 7.3 Exact historical reproducibility

```ts
export interface CovenantRun {
  id: string; tenantId: string; facilityId: string; covenantId: string;
  testDate: IsoDate; testIndex: number;

  // ── pinned inputs: everything needed to reproduce byte-identically ──
  engineVersion: string;
  languageVersion: 'qml/1';
  decimalConfigHash: string;
  definitionVersionIds: string[];
  covenantVersionId: string;
  factIds: string[];                    // exact fact rows, not a query
  eventIds: string[];
  paramSnapshot: Record<string, { value: string; unit: Unit }>;
  fxRateSetId: string;
  taxonomyVersion: number;
  amendmentIdsApplied: string[];
  asKnownAt: string;                    // system-time cut used to resolve definitions

  // ── outputs ──
  result: CovenantResult;
  traceId: string; traceHash: string;

  runType: 'scheduled' | 'what_if' | 'reproduction' | 'canary' | 'backfill';
  createdAt: string; createdBy: string;
}
```

`reproduce(runId)` re-evaluates from the pinned set and asserts `traceHash` equality; a mismatch is a **P1 incident**, surfaced in-app, because it means the audit trail is unsound. This plus the nightly canary is what makes the FCA/AIFMD story credible rather than aspirational.

### 7.4 Periods, LTM, pro forma, step-downs, cures, FX

**PeriodSpec**

```ts
export interface PeriodSpec {
  basis: 'LTM' | 'YTD' | 'QUARTER' | 'FY' | 'POINT_IN_TIME' | 'FORWARD_12M' | 'CUSTOM';
  anchor: 'TEST_DATE' | 'FY_END' | 'PRIOR_TEST_DATE';
  lookbackMonths?: number;              // LTM default 12
  offsetQuarters?: number;              // Q(-1)
  overrides?: RelevantPeriodOverride[];
  factBasisPreference?: Array<Fact['basis']>;   // ['audited','management'] — first hit wins
}

export interface RelevantPeriodOverride {
  testIndexUpTo: number;
  annualisation: AnnualisationRule;
  note?: string;
}

export type AnnualisationRule =
  | { kind: 'multiply'; factor: string }                 // Q1 x4, H1 x2
  | { kind: 'since_closing_x_365' }                      // (period-to-date) × 365 / days elapsed
  | { kind: 'quarters_available_x'; base: 4 }
  | { kind: 'none' };
```

Flow items sum across constituent quarters; stock items are read at the anchor date. Enforced by the taxonomy's `temporality` (§1.2), so it is a *type error*, not a code review issue.

**Pro forma** is an **overlay on the fact set**, not a mutation:

```ts
export interface ProFormaEvent {
  id: string; facilityId: string;
  type: 'acquisition' | 'disposal' | 'debt_incurrence' | 'refinancing'
      | 'business_closure' | 'restructuring';
  completedOn: IsoDate;
  permitted: boolean; permittedBasketRef?: string;
  targetFacts: Fact[];                  // target's own line items, with provenance
  inclusionRule: 'full_ltm' | 'from_completion' | 'annualised_since_completion'
               | 'stub_period_only';
  synergyPolicy?: { capPercentOfEbitda: string; realisableWithinMonths: number;
                    requiresDueDiligenceReport: boolean; documentId?: string };
  debtInclusion: 'at_test_date_actual' | 'as_if_drawn_at_period_start';
  approvedBy?: string; approvedAt?: string;
}
```

The bound fact set becomes `base ∪ proFormaFacts`, each PF fact tagged `basis: 'proforma'` and emitting `ProFormaNode`s so the trace shows *"of which pro forma: £1.8m"*. This preserves the ability to compute both the reported and the "actual, no-PF" ratio side by side — analysts want both, and lenders' credit committees increasingly ask for the un-adjusted number.

**Equity cures** — a full state machine, because the details decide outcomes:

```ts
export interface CureRight {
  id: string; covenantId: string;
  maxInWindow: { count: number; windowTestDates: number };   // "2 in any 4 quarters"
  maxOverLife: number;                                        // "5 over the life"
  consecutiveAllowed: boolean;                                // "no two consecutive"
  applicationMode: 'ebitda_increase' | 'debt_prepayment' | 'cash_deemed'
                 | 'lender_elects' | 'borrower_elects';
  deemedRetentionTestDates: number;   // cure stays in EBITDA for the next N tests (usually 3)
  overcureAllowed: boolean;           // may they inject more than the minimum?
  minAmountRule: 'exact_amount_needed' | 'unrestricted';
  deadlineBusinessDays: number;       // days after cert delivery to inject
  countsAgainstPrepayment: boolean;
  requiresLenderConsent: boolean;
  clauseRef: string;
}

export interface CureEvent {
  id: string; cureRightId: string; testDate: IsoDate; testIndex: number;
  amount: Dec; ccy: CurrencyCode;
  receivedOn: IsoDate;
  appliedAs: 'ebitda_increase' | 'debt_prepayment' | 'cash_deemed';
  provenance: ProvenanceRef;           // bank statement / subscription agreement
  eligibilityCheck: CureEligibilityResult;
  approvedBy: string;
}

export interface CureEligibilityResult {
  eligible: boolean;
  usedInWindow: number; windowLimit: number;
  usedOverLife: number; lifeLimit: number;
  consecutiveViolation: boolean;
  receivedWithinDeadline: boolean;
  minimumRequired: QValue;             // from solve()
  amountSufficient: boolean;
  reasons: string[];
}
```

`minimumRequired` is computed by **inverting the covenant**. For the canonical monotone ratio form the engine solves analytically:

```
leverage = (D - αE) / (B + βE) <= T
  ⟹ E >= (D - T·B) / (α + T·β)
```

(α=1 if the cure prepays debt, β=1 if it increases EBITDA; both are 1 under `cash_deemed` for some agreements). For formula-defined metrics it uses `solve()` (bisection, ≤40 probes, £1,000 tolerance, monotonicity asserted at runtime and the assertion recorded in the trace). If monotonicity fails — which it can for non-monotone metrics — the engine **refuses to state a number** and says so, rather than guessing. That refusal is the correct institutional behaviour.

`deemedRetentionTestDates` matters enormously and is routinely mishandled: a cure applied at Q3 that stays in EBITDA for Q4/Q1/Q2 changes three subsequent ratios. It is modelled as a `CureNode` adjustment injected into the LTM aggregation of those subsequent periods, visible in the trace.

**Multi-currency**

```ts
export interface FxPolicy {
  id: string; agreementId: string;
  source: 'ECB_REFERENCE' | 'BOE_SPOT' | 'AGREEMENT_FIXED' | 'ACCOUNTS_RATE'
        | 'HEDGED_RATE' | 'RATE_AT_DRAWDOWN';
  method: 'CLOSING' | 'AVERAGE_LTM' | 'AVERAGE_QUARTER' | 'FIXED';
  fixedRates?: Record<string, string>;     // 'EUR/GBP' -> '0.8620'
  clauseRef: string;
  note?: string;
}

export interface FxRateSet {
  id: string; source: string; asOfDate: IsoDate;
  rates: Record<string, string>;
  immutable: true;                          // once created, never edited
  fetchedAt: string; fetchProvenance: ProvenanceRef;
}
```

No implicit conversion exists. The checker rejects mixed-currency arithmetic; the author must call `fx(...)` or declare a term-level `convertTo` post-process, which *materialises explicit `FxNode`s* in the trace. Common real-world subtlety handled: debt translated at closing rate while EBITDA is translated at average rate — a source of leverage drift of, in my experience, several tenths of a turn for EUR/GBP borrowers, and something the trace must make visible rather than bury.

### 7.5 Result shape

```ts
export type CovenantStatus =
  | 'PASS' | 'BREACH' | 'BREACH_CURED' | 'BREACH_WAIVED'
  | 'NOT_TESTED_HOLIDAY' | 'NOT_TESTED_SUSPENDED'
  | 'PENDING_DATA' | 'PENDING_APPROVAL' | 'DISPUTED' | 'ERROR';

export interface CovenantResult {
  status: CovenantStatus;
  computedValue: QValue;                 // 4.3187...
  presentedValue: QValue;                // 4.32
  threshold: QValue;
  comparator: string;

  headroom: {
    absolute: QValue;                    // 0.18x
    percentOfThreshold: QValue;          // 4.0%
    /** The number analysts actually want: how far can EBITDA fall before breach? */
    ebitdaCushion?: QValue;              // £484,211
    ebitdaCushionPercent?: QValue;       // 3.87%
    netDebtCushion?: QValue;
  };

  borrowerReported?: QValue;
  divergence?: DivergenceReport;

  cure?: { required: QValue; eligibility: CureEligibilityResult; applied?: CureEvent };
  flags: TraceFlag[];
  dataCompleteness: { requiredFacts: number; presentFacts: number;
                      approvedFacts: number; missing: string[] };
  traceId: string;
}
```

---

## 8. Analyst-facing UI

### 8.1 Definition Workbench (authoring both halves)

Three panes, always:

```
┌──────────────────────┬────────────────────────────┬────────────────────┐
│ DOCUMENT             │ DEFINITION                 │ LIVE PREVIEW       │
│ SFA p.44, cl.1.1     │ Consolidated EBITDA  v4    │ Q1 FY26            │
│ highlighted clause   │  ┌ Base: Operating profit ┐│ EBITDA  £12.512m   │
│ text, drag-select    │  ├ + D&A                  ┤│  base    £6.900m   │
│ → creates Citation   │  ├ + Exceptionals  cap£500k│  +D&A    £2.100m   │
│   with page + bbox   │  ├ + Txn costs (events)   ┤│  +exc    £0.500m ⚠ │
│                      │  ├ + Synergies    cap 20% ⚠│  +txn    £0.600m   │
│                      │  └ − Gain on disposal     ┘│  +syn    £2.402m ⚠ │
│                      │  [+ Add adjustment]        │  −disp  −£0.010m   │
│                      │  [⚡ Switch to formula]     │ Leverage 4.32x PASS│
└──────────────────────┴────────────────────────────┴────────────────────┘
```

**Structured editor.** Adjustments are drag-reorderable cards — and reordering is *semantically meaningful* when caps are anchored to the running subtotal, so the UI warns when a reorder changes any of the last 8 quarters' values. Each card: label, sign toggle, operand picker (line item search with live extracted values shown inline / event aggregate / param / constant / formula / manual), optional condition, optional cap/floor with anchor selector, and a citation chip. Unciteed adjustments are flagged; a definition cannot reach `active` with an uncited adjustment.

**Formula editor.** Monaco with a QML language service:
- syntax + semantic highlighting, hover types including units (`Money<GBP>`, `Ratio`)
- autocomplete over the taxonomy showing each line item's *actual extracted value for the selected quarter* — turns authoring into something closer to a spreadsheet
- inline diagnostics for unit/currency/flow-stock/cycle errors, live
- **value gutter**: each `let` binding shows its computed value for the selected quarter, right-aligned in the gutter, recomputed on keystroke (debounced, in a worker, with a 50ms fuel-capped budget)
- a fuel estimate badge
- a "quarter scrubber" to re-evaluate against any of the last 8 quarters instantly
- mandatory **plain-English restatement** written by the author, shown beside the auto-generated back-translation of the AST; disagreement between the two is the cheapest review signal there is
- the `escapeReason` selector is required before save

**Interpretation notes.** First-class objects attached to a version, each with a question, chosen reading, alternative reading, rationale, decider, date, and clause citation. They render in the trace as `INTERPRETATION_APPLIED` flags and in investor/regulator packs as footnotes. This is a differentiator in itself — it is institutional memory that funds currently keep in email.

### 8.2 Review & approval

- **AST-level diff**, not text diff. Structured changes render as card-level add/remove/modify/reorder. Formula changes render as a tree diff (`cap(x, 500_000)` → `cap(x, 750_000)` shows as one changed leaf, not a line rewrite).
- **Impact preview** — the killer feature, and cheap because runs are reproducible: re-run the last 8 test dates under old and new definitions and show a table of ratio deltas plus any `PASS ⇄ BREACH` flips, *before* approval. Approving a definition change without seeing this is how mistakes ship.
- **4-eyes**: `authoredBy !== approvedBy`, enforced in the DB with a check constraint, not just the app.
- Formula proposals originating from the LLM are visually badged `AI-DRAFTED` throughout review and require the reviewer to have opened the cited PDF page (tracked) before the approve button enables.

### 8.3 Quarter-close review

Covenant card: our ratio vs borrower's, status chip, headroom expressed *in EBITDA terms*, an 8-quarter sparkline of headroom, and the trace tree collapsed to the top two levels. Expanding reveals every intermediate; every leaf number is a link opening the source PDF at the page with the bbox highlighted and the raw extracted text shown ("(742)") next to the normalised value.

Row-level affordances: **Accept**, **Flag** (raises a query to the borrower with the trace fragment attached), **Override** (creates an `OverrideNode` in the trace with a mandatory reason — never mutates the fact), **Add missing input** (opens a keyed-entry form with a citation picker; this is the *supported* path for data the extractor could not find, not an error state).

The divergence panel is the headline: *"Borrower reports 4.19x. We calculate 4.32x. £312k of the £0.13x gap is the synergy cap at cl.1.1(d)."* One click generates a drafted query letter with the clause quote and the certificate page reference.

### 8.4 Data model (Postgres, abbreviated but real)

```sql
CREATE TABLE definition_version (
  id                        text PRIMARY KEY,
  tenant_id                 uuid NOT NULL,
  term_id                   text NOT NULL REFERENCES defined_term(id),
  version_no                int  NOT NULL,
  effective_from_test_date  date NOT NULL,
  effective_to_test_date    date,
  recorded_at               timestamptz NOT NULL DEFAULT now(),
  superseded_at             timestamptz,
  body                      jsonb NOT NULL,
  lowered_ast               jsonb NOT NULL,
  content_hash              text NOT NULL,
  status                    text NOT NULL
     CHECK (status IN ('draft','pending_approval','active','superseded','rejected')),
  authoring_mode            text NOT NULL,
  escape_reason             text,
  authored_by               uuid NOT NULL,
  approved_by               uuid,
  approved_at               timestamptz,
  source_amendment_id       text,
  CONSTRAINT four_eyes CHECK (approved_by IS NULL OR approved_by <> authored_by),
  CONSTRAINT escape_reason_required
    CHECK (authoring_mode <> 'formula' OR escape_reason IS NOT NULL),
  EXCLUDE USING gist (
    term_id WITH =,
    daterange(effective_from_test_date, effective_to_test_date, '[)') WITH &&
  ) WHERE (status = 'active' AND superseded_at IS NULL)
);

ALTER TABLE definition_version ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON definition_version
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- append-only enforcement
CREATE RULE no_update_dv AS ON UPDATE TO definition_version
  WHERE OLD.status = 'active' DO INSTEAD NOTHING;   -- status transitions go via SECURITY DEFINER fn
```

The `EXCLUDE USING gist` constraint is the important one: it makes overlapping active definition versions for the same term **impossible at the database level**, which is exactly the failure mode ("we had two versions of the EBITDA definition and used the wrong one") the product exists to eliminate.

Data residency: single-region UK/EU deployment (eu-west-2 primary, eu-west-1 DR), no cross-region replication, per-tenant KMS keys for document blobs, and PDFs stored in an object store with the same regional constraint. Extraction LLM calls go to an EU-resident endpoint with zero-retention; documents are chunked so no full agreement leaves the region in one payload. `[VERIFY]` — the exact EU-residency and zero-retention terms of whichever model provider is used must be confirmed contractually before making this claim to a buyer.

### 8.5 Testing strategy (what makes this maintainable by one person)

- **Golden corpus**: ~50 anonymised real covenant definitions with pinned inputs and expected traces. Any engine change diffs traces, not just values.
- **Differential**: structured vs hand-written-QML equivalents must agree bit-for-bit.
- **Property tests**: leverage is monotone decreasing in EBITDA; ICR monotone increasing in EBITDA; cap nodes never exceed their limit; `sum_over` is order-independent modulo the declared sort; trace value at every node equals recomputing that subtree.
- **Parser fuzzing**: 10M random and mutated inputs; assertions = no crash, no hang, no stack overflow, bounded memory, and every rejection carries a span.
- **Reproducibility canary**: nightly, last 200 runs, trace-hash equality.
- **Fuel regression**: any definition whose fuel use grows >20% between engine versions fails CI.

---

## 9. Honest coverage analysis

All percentages are `[ESTIMATE]` — my prior from LMA-style UK/European mid-market documentation, not a measurement. The system is instrumented (§5.3) specifically so these become measured numbers within two quarters of first customer data.

### 9.1 What each half actually covers

| Layer | Structured only | + formula-valued adjustment | Needs full formula | Not computable at all |
|---|---|---|---|---|
| **Test mechanics** (comparator, thresholds, step-downs, frequency, holidays) | ~95% | — | ~4% (lookback counting, multi-condition) | ~1% ("as the Agent shall reasonably determine") |
| **Leverage numerator** (Total Net Debt) | ~85% | ~10% | ~4% | ~1% |
| **EBITDA-family denominators** | ~65% | ~25% | ~8% | ~2% |
| **Interest Cover terms** | ~80% | ~12% | ~6% | ~2% |
| **DSCR / cashflow terms** | ~35% | ~25% | ~35% | ~5% |
| **Capex / liquidity / minimum EBITDA** | ~90% | ~7% | ~2% | ~1% |
| **Weighted across a typical 15–80 loan book** | **~70–80%** | **~15%** | **~5–10%** | **~1–3%** |

The escape hatch earns its place mostly on **DSCR/cashflow-cover terms** and on **caps with unusual anchors**. If I built only the structured half, DSCR would be the thing that made the product unusable for a third of a book — and DSCR is disproportionately common in the lower-mid-market and asset-backed deals that £50m–£500m UK funds actually do.

### 9.2 Where the design genuinely breaks

1. **Extraction is the binding constraint, not calculation.** The engine can compute anything the schema plus QML can express, but management accounts routinely do not break out "exceptional items relating to Permitted Acquisitions" as a line. `[ESTIMATE]` 20–30% of quarters will need at least one analyst-keyed input. This is why `manualInput` operands and the keyed-entry flow are first-class, and why the honest product claim is "independently recalculated with full provenance", not "fully automated".

2. **Consolidation perimeter.** Which entities are in "the Group"? Unrestricted subsidiaries, JVs equity-accounted vs proportionally consolidated, entities acquired mid-period. Perimeter error dwarfs formula error and is largely invisible in the borrower's pack. The model has `obligorGroupId` on facts and a versioned `GroupPerimeter` entity, but the *data* to police it usually is not in the quarterly pack. Realistically this is an annual audited-accounts check plus a Companies House group-structure cross-reference, not a quarterly calculation.

3. **Ambiguous drafting.** The 20% synergy cap circularity is not an edge case; it is representative. The engine's answer is to refuse to guess and force a recorded interpretation. That is correct but it means the product cannot be "set and forget" — every bespoke term needs one careful human pass. For a 60-loan fund with ~4 bespoke terms each, that is ~240 definitions to author, at `[ESTIMATE]` 30–90 minutes each with good LLM drafting. Onboarding is 4–8 person-weeks per fund. **This is the real commercial risk of the design and should be priced and staffed as such.**

4. **Non-monotone metrics break cure sizing.** Where a metric is non-monotone in the injection amount (some cash-deemed cures that both increase cash and increase EBITDA under a cap), bisection is invalid. The engine detects the monotonicity assertion failure and declines to state a required amount. Correct, but the analyst gets no answer.

5. **Forward-looking covenants.** A forward 12-month DSCR requires a projection model, which is a different product surface (the eventual Underwriting module). QML can consume `basis: 'forecast'` facts, but the *quality* of those facts is out of scope; forecasting a breach 60–90 days ahead (§brief) is therefore a statistical/trend layer on top of historical traces, not a covenant-engine feature, and should be presented to buyers as such rather than conflated.

6. **Borrowing-base and NAV/LTV facilities** need row-level asset data (per-receivable eligibility, per-position valuations with concentration haircuts) at cardinalities well above `maxListCardinality = 2000`. That is a different ingestion pipeline and, honestly, a different product. QML's bounded comprehension is the wrong tool.

7. **Frozen GAAP / accounting-change clauses.** "If there is a change in the Accounting Principles, the Borrower and the Agent shall negotiate in good faith..." — the covenant's meaning becomes *undetermined pending negotiation*. IFRS 16 is the canonical instance and forced the `bs.finance_leases_pre_ifrs16` taxonomy split above. The design handles the known cases by taxonomy duplication; it cannot handle the general case, and every such clause needs a flag on the agreement and an analyst decision.

8. **Trace size and step-down/index coupling.** Deeply nested terms with 4-quarter comprehensions can approach the 5,000-node trace cap; the fallback (collapsing repeated aggregation subtrees to summary nodes) loses some click-through depth. Separately, thresholds keyed by `test_index` are fragile across frequency-changing amendments — mitigated by an explicit `reindexPolicy` and a mandatory re-render as absolute dates, but it remains a place where a careless amendment entry produces a wrong threshold that *looks* right.

9. **Bitemporality is genuinely hard to maintain solo.** Two time axes multiply the state space of every query, and the "as known at" dimension is easy to forget in new code paths. Mitigation is to funnel *all* definition reads through `resolveDefinition()` and lint against direct table access — but this is the part of the system most likely to grow a subtle bug that only shows up in an audit.

10. **False confidence from AI-drafted definitions.** A plausible-looking wrong formula that passes the unit checker and produces a plausible ratio is the highest-consequence failure mode in the whole system. The mitigations (dual control, impact preview, mandatory clause citation with page/bbox, forced plain-English restatement, PDF-opened tracking) are process controls, and process controls decay under time pressure at quarter-close. I would additionally hold back a **shadow period**: the first two quarters of any new definition run in parallel with the borrower's own number and require explicit sign-off on the divergence before the definition is trusted for investor-facing reporting.

### Key decisions
- One IR, two surfaces: the structured schema is COMPILED (lowered) into the same QML AST the escape hatch produces, so the interpreter, type/unit checker, fuel meter, trace emitter, provenance plumbing, versioning and English-rendering are written exactly once and cannot drift — the single most important decision for a solo founder maintaining both halves.
- Custom total AST interpreter instead of sandboxed JS. Rejected node:vm (documented as not a security boundary), isolated-vm (native addon burden, Turing-complete, float arithmetic, not statically analysable) and QuickJS-WASM (still unauditable). Decisive argument is auditability, not raw security: a credit committee must be able to READ the definition, and an AST can be diffed, unit-checked and rendered back to English.
- Escape hatch at three granularities — whole term, single adjustment inside an otherwise-structured term, or whole test — so the common real case is '95% structured plus one weird adjustment', not an all-or-nothing switch.
- Units AND currency in the static type system, plus a flow/stock discriminator on every taxonomy node. Summing four quarters of closing net debt becomes a compile error rather than a silently 4x-too-large number.
- decimal128 arithmetic (34 digits, ROUND_HALF_EVEN) with the config version-pinned and hashed into every trace; no IEEE-754 anywhere in the eval path; presentation rounding is an explicit AST node because round-before-compare decides pass/fail at the margin.
- Totality by construction: no loops, no recursion, no user functions; iteration exists only via bounded comprehensions over statically-known collections and via solve/fixpoint with compile-time iteration caps. Fuel exhaustion is therefore a rare, attributable, clean failure rather than the primary defence.
- Self-referential definitions (the '20% of EBITDA' cap) are REJECTED by cycle detection, forcing an explicit recorded InterpretationNote with a clause citation — turning a real contract ambiguity into a visible product artifact instead of a silent modelling assumption.
- Bitemporal definition versioning: business time (which test dates a version governs) is separate from system time (what we believed when), because retroactive amendments and 'explain the report we issued in October' are both real requirements.
- Amendments as typed, clause-cited patches folded in a deterministic order, with conflicting patches on the same path BLOCKING activation rather than last-write-wins — plus a Postgres GiST exclusion constraint making overlapping active definition versions structurally impossible.
- Runs pin everything (definition version ids, exact fact ids, param snapshot, FX rate set id, taxonomy version, engine version, decimal config, as-known-at cut) and a nightly canary re-runs the last 200 runs asserting trace-hash equality — determinism is verified, not merely asserted.
- Divergence attribution against the borrower's compliance certificate via top-down trace comparison plus bounded counterfactual re-runs, localising the discrepancy to the specific adjustment and clause — this is the actual differentiator, and it is only possible because the trace is a DAG with provenance at every leaf.
- Headroom expressed in EBITDA terms (how far can EBITDA fall before breach) as well as in ratio terms, computed by covenant inversion — the number analysts actually act on.
- Manual/keyed inputs are a first-class supported state with mandatory reason and citation, not an error path, because extraction — not calculation — is the real ceiling on coverage.
- The escape hatch is instrumented with a mandatory EscapeReason enum and AST-shape clustering, so recurring formula patterns become a schema-extension backlog rather than a permanent tax.

### Trade-offs
- Custom language vs sandboxed JS: gains auditability, totality, decimal-by-default and static analysis; costs ~2,500 LOC of lexer/parser/checker/interpreter to write and maintain, and customers cannot bring existing JS/Excel logic. If a large buyer demands JS, QuickJS-WASM is the escape valve — but it forfeits the diffable, English-renderable definition that makes credit-committee review work.
- Lowering structured to QML halves maintenance and guarantees the halves agree, but adds an indirection: an error in lower() corrupts BOTH surfaces at once. Mitigated by a differential test suite (structured vs hand-written QML must agree bit-for-bit and produce isomorphic traces), but the blast radius of a lowering bug is total.
- Static units + currency catch a large class of real errors early, but the type system gets fiddly where currency is bound to the facility rather than statically known. Full currency polymorphism is more machinery than a solo founder should write; the design accepts a checked runtime error as a fallback in that narrow case.
- Bitemporal versioning delivers exact historical reproducibility and correct handling of retroactive amendments, at the cost of doubling the state space of every definition query. It is the part of the system most likely to grow a subtle, audit-only-visible bug.
- Content-addressed immutable traces give perfect auditability and cheap deduplication, but storage grows with runs x nodes. A 60-loan fund at ~4 covenants each x 4 quarters x ~500 nodes is manageable, but what-if and impact-preview runs multiply it; hence the 5,000-node cap and a retention policy that keeps scheduled-run traces forever and prunes what-if traces.
- Refusing to guess (cycle rejection, monotonicity assertion failure on cure sizing, blocked amendment conflicts) is the correct institutional behaviour and a trust-builder, but it means the product cannot be 'set and forget' — it converts silent wrongness into visible analyst work, which is better but is still work the customer must staff.
- Fuel and cardinality limits guarantee availability but will occasionally reject a legitimately large definition (a genuinely 2-page excess-cashflow waterfall). Raising a limit is possible but is itself an approved, audited change — deliberate friction.
- Bounded comprehension over statically-known collections is what makes the language total, but it structurally rules out borrowing-base and NAV/LTV facilities with thousands of underlying positions. That is a conscious scope exclusion, not an oversight.
- Definition authoring is the onboarding bottleneck: ~240 bespoke definitions for a 60-loan fund at an estimated 30-90 minutes each means 4-8 person-weeks per customer. LLM drafting reduces the per-definition time but cannot remove the mandatory human approval that makes the output trustworthy — so the design deliberately trades onboarding speed for defensibility.
- Process controls (dual control, impact preview, forced PDF-page-opened tracking) are the primary defence against AI-drafted-but-wrong definitions, and process controls decay under quarter-close time pressure. The proposed shadow period (two quarters running in parallel with the borrower's own number before a definition is trusted for investor reporting) buys safety at the cost of slower time-to-value.

### Failure modes
- Extraction, not calculation, is the binding constraint. Management accounts routinely do not break out 'exceptional items relating to Permitted Acquisitions'. An estimated 20-30% of quarters will need at least one analyst-keyed input, so the honest claim is 'independently recalculated with full provenance', not 'fully automated'.
- Consolidation perimeter error dwarfs formula error and is largely invisible in the quarterly pack: unrestricted subsidiaries, equity-accounted vs proportionally consolidated JVs, mid-period acquisitions. The schema models a versioned GroupPerimeter, but the data to police it usually is not available quarterly.
- Ambiguous drafting is the norm, not the exception. The '20% of EBITDA' synergy cap circularity is representative; the engine refuses to guess and demands a recorded interpretation, which is correct but means every bespoke term needs a careful human pass and there is no fully automatic onboarding path.
- AI-drafted definitions that are plausible, unit-check-clean and produce a plausible ratio but are subtly wrong. This is the highest-consequence failure in the system, and its mitigations are process controls that decay under quarter-close time pressure.
- Non-monotone metrics invalidate bisection-based cure sizing (e.g. cash-deemed cures that both raise cash and raise EBITDA under a cap). The engine detects the monotonicity assertion failure and declines to state a required injection amount — correct, but the analyst gets no answer.
- Forward-looking covenants (forward 12-month DSCR) require a projection model that is out of scope. Breach forecasting 60-90 days ahead is a statistical layer over historical traces, not a covenant-engine capability, and conflating the two in sales would be dishonest.
- Borrowing-base and NAV/LTV facilities need per-receivable / per-position row-level data at cardinalities far above the 2,000-element comprehension cap. Bounded comprehension is the wrong tool; that is a separate ingestion pipeline and arguably a separate product.
- Frozen-GAAP and accounting-change clauses ('the parties shall negotiate in good faith') leave the covenant's meaning genuinely undetermined. IFRS 16 is handled by taxonomy duplication (finance_leases_pre_ifrs16); the general case cannot be handled and needs a per-agreement flag plus an analyst decision.
- Threshold schedules keyed by test_index are fragile across frequency-changing amendments — quarterly to semi-annual silently re-points every step-down. Mitigated by an explicit reindexPolicy and forced re-render as absolute dates, but a careless amendment entry still yields a wrong threshold that looks right.
- Bitemporality is the most likely home for a long-lived subtle bug, because the 'as known at' axis is easy to omit in any new query path. All definition reads must funnel through resolveDefinition() with lint enforcement, and violations will only surface during an audit.
- Trace size: deeply nested terms with 4-quarter comprehensions can approach the 5,000-node cap; the collapse-to-summary-node fallback loses click-through depth precisely on the most complex definitions, which are the ones analysts most need to inspect.
- A bug in lower() corrupts both the structured and formula surfaces simultaneously, since they share one IR — the cost of the maintenance win. Differential and golden-corpus tests are the only defence.
- Engine non-determinism introduced by a dependency bump (decimal library, Node version, Map ordering assumption) would silently break the audit trail. The nightly reproducibility canary is what catches this; if the canary is ever disabled to unblock a release, the FCA/AIFMD story quietly becomes false.
- Onboarding cost (4-8 person-weeks per fund to author bespoke definitions) is a commercial failure mode as much as a technical one: it caps how many customers a solo founder can land per year and must be priced and staffed deliberately rather than discovered.


---

## Covenant Expression Kernel (CEK): a dimension-typed, content-addressed JSON expression DSL with a pure TypeScript interpreter that emits a provenance-linked calculation trace

### Summary
QuarterMark's moat is not "we parse credit agreements" — it is that every covenant ratio the platform shows is a pure, replayable function of (pinned definition version, pinned fact snapshot, pinned FX snapshot, pinned ledger state, pinned engine version), and that the function emits a complete audit trace down to a page-and-bounding-box on the borrower's PDF. This design specifies that function. Covenant definitions are stored as a tagged-union JSON AST with static dimensional types (money-with-currency, scalar, boolean, date), so `EBITDA + Net Debt` and `GBP + EUR without an FX policy` are compile-time errors, not silent wrong answers. The bespoke-definition problem is solved by a first-class `adjustedAggregate` node whose ordered, lettered `adjustments[]` mirror how the contract is actually drafted ((a), (b), (c)…), each with its own sign, gating condition, cap and clause citation — which makes the AI extraction target structured, the analyst UI a table rather than a code editor, and the trace human-readable. Caps are modelled as ledgers, not `Math.min`: per-period caps, per-financial-year aggregate caps shared across a group of add-backs, and life-of-loan depleting baskets, plus an explicit, mandatory answer to the circularity question ("20% of EBITDA" — before or after the add-back?) which is the single most common source of dispute with borrowers and which the engine resolves by fixed-point iteration when the contract genuinely means post-adjustment. Period aggregation (LTM from four quarters, YTD-delta derivation for management accounts, stub periods after closing) and pro-forma acquisition adjustments are nodes in the same tree, so they appear in the same trace. Versioning is bitemporal and content-addressed: amendments mint new immutable definition versions, old engine versions are vendored as pure modules and never deleted, and a "reproduce" button re-executes any historical calculation and asserts the result hash still matches. Equity cures sit outside the definition as an append-only ledger applied at test time, producing paired pre-cure and post-cure results so the breach is never erased from the record. The extraction pipeline is deliberately unglamorous — layout-aware PDF parse, clause segmentation, constrained structured generation into the AST schema, deterministic validators, self-consistency sampling as a confidence signal, deterministic back-translation of the AST into English shown side-by-side with the clause, and a back-test against the borrower's own historical compliance certificates, which is the strongest available evidence that the encoded definition is right.

### Design
## 0. Architectural framing

The expression kernel is deliberately **not** covenant-specific. It is a general "financial expression + provenance + trace" engine. Covenants are the first consumer; Valuation (multiples, DCF, waterfall), Fund Accounting (management fee, carried interest hurdle), and Loan Servicing (interest accrual, PIK toggles, margin ratchets — which are themselves leverage-grid lookups) all reduce to the same three primitives: *a typed expression over provenanced facts, evaluated in a period context, producing a trace*. Build it once, correctly.

```
packages/
  cek-ast/            # types + JSON schema + canonicaliser + hash. Zero deps.
  cek-engine-v1/      # pure interpreter. Zero deps except decimal.
  cek-engine-v2/      # vendored, never deleted, still runnable
  cek-validate/       # dimensional typecheck, schedule totality, cycle detection
  cek-print/          # AST -> English, AST -> LaTeX/HTML formula, trace -> UI model
  cek-extract/        # LLM pipeline producing candidate ASTs
  covenant-domain/    # covenant tests, cures, schedules, compliance status
```

Everything in `cek-engine-*` is a pure function. No I/O, no `Date.now()`, no locale-dependent formatting. All external state (facts, FX, ledgers, calendars) arrives as a frozen, hashed `EvalInputs` object. This is what makes reproducibility a property of the code rather than a promise in a policy document.

---

## 1. Numeric substrate and dimensions

### 1.1 Decimals, not floats

Every number in stored JSON is a **string**. `4.5` in JSON is a float and `0.1 + 0.2 !== 0.3`; a covenant that fails at 4.5001x because of binary representation is a lawsuit.

```ts
/** Branded decimal string. Canonical form: optional '-', digits, optional '.', digits.
 *  No exponent, no leading '+', no leading zeros except '0.x', no trailing '.'  */
export type DecStr = string & { readonly __dec: unique symbol };

// Runtime uses decimal.js configured once, globally, and never reconfigured:
//   Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9e15, toExpPos: 9e15 })
// 34 significant digits = IEEE 754-2008 decimal128. Enough for £10bn to the penny with
// 20 digits of headroom for intermediate ratio work.
export type Dec = import('decimal.js').Decimal;
```

Rounding is **never** applied implicitly. It happens only at an explicit `roundTo` node or at the covenant test's declared comparison policy. Intermediate values keep full precision.

### 1.2 Dimensions (the type system)

```ts
export type CurrencyCode = 'GBP' | 'EUR' | 'USD' | 'CHF' | 'SEK' | 'NOK' | 'DKK' | 'PLN' | (string & {});

export type Dim =
  | { kind: 'money'; ccy: CurrencyCode }
  | { kind: 'scalar'; display?: 'multiple' | 'percent' | 'count' | 'plain' }
  | { kind: 'boolean' }
  | { kind: 'date' }
  | { kind: 'duration'; unit: 'day' | 'month' | 'quarter' | 'year' };

/** Dimensional algebra enforced by cek-validate at authoring time AND asserted at runtime.
 *  money(C) + money(C) -> money(C)
 *  money(C) + money(D) -> TYPE ERROR unless the node declares resultCcy (then an fx step is
 *                          inserted and recorded in the trace)
 *  money(C) / money(C) -> scalar(multiple)         <- this is how a leverage ratio is born
 *  money(C) / money(D) -> TYPE ERROR, always. Convert explicitly.
 *  money(C) * scalar   -> money(C)
 *  scalar  * scalar    -> scalar
 *  money   * money     -> TYPE ERROR
 *  any comparison      -> boolean, operands must be dimension-identical
 */
```

The `money/money -> scalar(multiple)` rule is the reason a leverage covenant cannot accidentally be computed against an un-converted EUR debt tranche. In practice this single rule has caught more real errors in spreadsheet-based covenant monitoring than any other check I can name — funds routinely add a EUR tranche to a GBP tranche at 1.00.

---

## 2. The AST

### 2.1 Node envelope

```ts
export type NodeId = string;   // stable, human-authored slug: "ebitda.adj.b.value"
export type DefinitionId = string;
export type ConceptId = string;   // "qm.pl.operatingProfit"

export interface ClauseCitation {
  documentId: string;            // the credit agreement / amendment
  documentVersionId: string;
  clauseRef?: string;            // "Clause 1.1 (definition of EBITDA), para (b)"
  page: number;                  // 1-indexed
  bbox?: [number, number, number, number];  // PDF user space, top-left origin, normalised 0..1
  quote: string;                 // exact text, used for back-translation diffing
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Interpretation {
  /** Set when the drafting is genuinely ambiguous and a human had to choose. */
  question: string;              // "Is the 20% cap measured on EBITDA before or after this add-back?"
  chosen: string;                // "before this add-back"
  alternatives: string[];
  rationale?: string;
  decidedBy?: UserId;
  decidedAt?: ISODateTime;
  escalatedToCounsel?: boolean;
  materialityGbp?: DecStr;       // impact of choosing the alternative, computed by the engine
}

export interface NodeMeta {
  id: NodeId;
  label?: string;                // "Add back: exceptional and non-recurring items"
  cite?: ClauseCitation[];
  note?: string;
  confidence?: Confidence;       // from extraction; cleared to 'high' on human approval
  interpretation?: Interpretation;
  /** If true, the UI renders this node as a collapsible summary row in the trace. */
  traceProminence?: 'headline' | 'normal' | 'detail';
}
```

Every node carries `NodeMeta`. This is what turns the trace from a debug dump into an audit artefact: each intermediate step can cite the clause that produced it.

### 2.2 Node union

```ts
export type Expr =
  // ---- leaves -------------------------------------------------------------
  | LiteralNode
  | FactRefNode
  | ParamNode
  | DefRefNode
  | VarNode
  | SelfRefNode
  | ScheduleRefNode
  | AttestedInputNode
  | EventAggregateNode
  // ---- arithmetic ---------------------------------------------------------
  | SumNode
  | ProductNode
  | DivideNode
  | NegateNode
  | AbsNode
  | MinNode
  | MaxNode
  | RoundNode
  // ---- structure ----------------------------------------------------------
  | AdjustedAggregateNode
  | LetNode
  | IfNode
  | CoalesceNode
  // ---- logic --------------------------------------------------------------
  | CompareNode
  | LogicNode
  | NotNode
  | IsPresentNode
  // ---- period / time ------------------------------------------------------
  | PeriodAggregateNode
  | PeriodShiftNode
  | PointInTimeNode
  | AnnualiseNode
  | ProFormaNode
  // ---- money --------------------------------------------------------------
  | FxConvertNode
  // ---- caps / baskets -----------------------------------------------------
  | CappedNode
  | BasketDrawNode
  | GreaterOfNode;
```

### 2.3 Leaves

```ts
export interface LiteralNode extends NodeMeta {
  type: 'literal';
  value: DecStr | boolean | ISODate;
  dim: Dim;
}

/** Period selection is relative to the evaluation context's Relevant Period. */
export type PeriodSelector =
  | { rel: 'relevantPeriod' }                       // whatever the covenant tests on (usually LTM)
  | { rel: 'testDate' }                             // a point in time
  | { rel: 'quarter'; offset: number }              // 0 = quarter ending on test date, -1 = prior
  | { rel: 'financialYear'; offset: number }        // 0 = FY containing the test date
  | { rel: 'financialYearToDate' }
  | { rel: 'sinceClosing' }
  | { rel: 'ltm' }
  | { rel: 'absolute'; periodId: string };

export interface FactRefNode extends NodeMeta {
  type: 'factRef';
  concept: ConceptId;
  period: PeriodSelector;
  /** Which consolidation perimeter. 'group' = Obligor Group per the agreement. */
  entityScope?: 'group' | 'obligors' | 'borrower' | { entityId: string };
  /** Restricts to a sub-slice the borrower must break out (e.g. only costs of
   *  Permitted Acquisitions). Requires an attested breakdown; validator warns if the
   *  concept has no registered breakdown source. */
  qualifier?: string;
  /** Overrides the concept registry default. */
  whenAbsent?: 'zero' | 'missing' | 'error';
  /** Sign convention flip: some sources report D&A as negative. */
  signConvention?: 'asReported' | 'positiveIsAddback';
}

export interface ParamNode extends NodeMeta {
  type: 'param';
  name: string;                  // resolved from the definition's own params[]
}

export interface DefRefNode extends NodeMeta {
  type: 'defRef';
  definitionId: DefinitionId;    // "def_consolidated_ebitda"
  /** Evaluate the referenced definition in a different period than the current context. */
  periodOverride?: PeriodSelector;
  /** Pin to a specific version. Normally omitted — resolution is by the run's version map. */
  versionId?: string;
}

export interface VarNode extends NodeMeta { type: 'var'; name: string; }

/** Only legal inside a CappedNode.limit that sits inside an AdjustedAggregateNode. */
export interface SelfRefNode extends NodeMeta {
  type: 'selfRef';
  stage: 'base'                  // the aggregate's base only
       | 'beforeThisAdjustment'  // base + all prior adjustments, this one excluded
       | 'final';                // fully adjusted -> triggers fixed-point iteration
}

export interface ScheduleRefNode extends NodeMeta {
  type: 'scheduleRef';
  scheduleId: string;
  at?: PeriodSelector;           // default: testDate
}

/** A number that cannot come from the financial statements and must be supplied and
 *  signed off by a human (or extracted from a compliance-certificate schedule). */
export interface AttestedInputNode extends NodeMeta {
  type: 'attestedInput';
  key: string;                   // "synergies.runRate.realisableWithin12m"
  dim: Dim;
  period: PeriodSelector;
  requires: 'borrowerCertificate' | 'analyst' | 'either';
  /** Blocks publication of the calc until an approver signs. */
  approvalRequired: boolean;
  whenAbsent?: 'zero' | 'missing' | 'error';
}

/** Sums over a ledger of corporate events (acquisitions, disposals, cures, drawdowns). */
export interface EventAggregateNode extends NodeMeta {
  type: 'eventAggregate';
  ledger: 'acquisitions' | 'disposals' | 'equityCures' | 'permittedDisposalProceeds' | 'drawdowns';
  window: PeriodSelector;
  field: string;                 // "considerationPaid" | "amount"
  filter?: Expr;                 // boolean expr evaluated per event with event fields in scope
  dim: Dim;
}
```

### 2.4 Arithmetic and structure

```ts
export interface SumNode extends NodeMeta {
  type: 'sum';
  terms: Array<{ sign: 1 | -1; expr: Expr; label?: string }>;
  /** Required if terms mix currencies; inserts fx conversion per the definition's fxPolicy. */
  resultCcy?: CurrencyCode;
}

export interface ProductNode extends NodeMeta { type: 'product'; factors: Expr[]; }

export interface DivideNode extends NodeMeta {
  type: 'divide';
  numerator: Expr;
  denominator: Expr;
  /** What to do if the denominator is zero or negative. Negative EBITDA is common in
   *  distress and every fund handles it differently; the contract rarely says. */
  onZeroDenominator: 'error' | 'infinity' | 'null';
  onNegativeDenominator?: 'error' | 'compute' | 'treatAsBreach';
}

export interface NegateNode extends NodeMeta { type: 'negate'; expr: Expr; }
export interface AbsNode extends NodeMeta { type: 'abs'; expr: Expr; }
export interface MinNode extends NodeMeta { type: 'min'; exprs: Expr[]; }
export interface MaxNode extends NodeMeta { type: 'max'; exprs: Expr[]; }

export interface RoundNode extends NodeMeta {
  type: 'round';
  expr: Expr;
  dp: number;
  mode: 'halfUp' | 'halfEven' | 'down' | 'up' | 'ceil' | 'floor';
}

export interface LetNode extends NodeMeta {
  type: 'let';
  bindings: Array<{ name: string; expr: Expr }>;   // sequential scope, no recursion
  body: Expr;
}

export interface IfNode extends NodeMeta {
  type: 'if'; cond: Expr; then: Expr; else: Expr;
}

/** First non-missing wins. Used for "management accounts, or audited if available". */
export interface CoalesceNode extends NodeMeta { type: 'coalesce'; exprs: Expr[]; }

export interface CompareNode extends NodeMeta {
  type: 'compare';
  op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';
  left: Expr; right: Expr;
  /** Rounding applied to BOTH sides before comparing. Agreements commonly express
   *  ratios "to two decimal places"; 4.504 then passes a 4.50x limit. */
  comparisonRounding?: { dp: number; mode: 'halfUp' | 'halfEven' };
}

export interface LogicNode extends NodeMeta { type: 'logic'; op: 'and' | 'or'; exprs: Expr[]; }
export interface NotNode extends NodeMeta { type: 'not'; expr: Expr; }
export interface IsPresentNode extends NodeMeta { type: 'isPresent'; expr: Expr; }
```

### 2.5 The adjusted-aggregate node — the heart of the bespoke-definition problem

A generic expression tree *could* express a bespoke EBITDA definition with nested `sum`/`min` nodes. It would be unreadable, un-diffable across amendments, un-editable by an analyst, and a poor generation target for an LLM. `adjustedAggregate` mirrors the drafting convention directly.

```ts
export interface AdjustedAggregateNode extends NodeMeta {
  type: 'adjustedAggregate';
  base: Expr;
  adjustments: Adjustment[];
  /** Ordering matters when caps reference 'beforeThisAdjustment'. */
  fixedPoint?: { maxIterations: number; toleranceDec: DecStr };
}

export interface Adjustment {
  key: string;                   // matches the contract's lettering: "a", "b", "c"
  label: string;
  sign: 'add' | 'deduct';
  value: Expr;
  /** Gate. If false, the adjustment contributes zero (and says so in the trace). */
  condition?: Expr;
  cap?: CapSpec;
  floor?: { limit: Expr; label?: string };
  cite?: ClauseCitation[];
  confidence?: Confidence;
  interpretation?: Interpretation;
  /** Set when the fund's credit committee has disallowed an add-back the contract permits
   *  (shadow/"underwriting" view). Produces a second result alongside the contractual one. */
  disallowedInFundView?: boolean;
}

export interface CapSpec {
  limit: Expr;
  /** Over what window the cap is measured. */
  basis:
    | 'perRelevantPeriod'          // the LTM window being tested
    | 'perFinancialYear'           // "per annum"
    | 'perTestPeriod'              // the quarter
    | 'aggregateSinceClosing';     // life-of-loan basket, depletes
  /** 'group' shares one cap across several adjustments ("in aggregate"). */
  scope: { kind: 'thisAdjustment' } | { kind: 'group'; groupId: string };
  /** For 'aggregateSinceClosing', the ledger key whose consumed balance is tracked. */
  ledgerKey?: string;
  /** How a cap that references the aggregate itself is resolved. REQUIRED whenever the
   *  limit expression contains a selfRef or a defRef back to this definition. */
  circularity?: 'beforeAllAdjustments' | 'beforeThisAdjustment' | 'final';
  /** If the relevant period straddles two financial years and basis is 'perFinancialYear'. */
  straddleTreatment?: 'noProRata' | 'proRataByDays' | 'applyToLaterYear';
  label?: string;
}

/** "the greater of £5,000,000 and 15% of Consolidated EBITDA" — a grower basket. */
export interface GreaterOfNode extends NodeMeta {
  type: 'greaterOf'; exprs: Expr[]; resultCcy?: CurrencyCode;
}

/** Draws against a life-of-loan basket, returning the amount actually available. */
export interface BasketDrawNode extends NodeMeta {
  type: 'basketDraw';
  basketId: string;
  requested: Expr;
  capacity: Expr;
  /** Whether prior draws that have since been repaid restore capacity. */
  replenishing: boolean;
}

export interface CappedNode extends NodeMeta {
  type: 'capped'; expr: Expr; cap: CapSpec;
}
```

**The circularity point is the single most important detail in this section.** "run-rate cost savings … capped at 20% of EBITDA" is circular: EBITDA depends on the add-back, and the cap on the add-back depends on EBITDA. Three readings are defensible and they give materially different answers. Market drafting *usually* clarifies with a parenthetical ("before giving effect to such add-back"), but a meaningful minority of mid-market agreements do not — I'd treat that as the common case rather than the exception, though I have not sampled a corpus and would want to verify the frequency before making the claim to a customer. The engine **refuses to evaluate** a self-referential cap without an explicit `circularity` value plus a recorded `Interpretation`. When `circularity: 'final'`, the engine solves by fixed-point iteration and records every iterate in the trace; the system is linear in the single unknown so convergence is immediate in practice, but non-convergence (possible with multiple interacting `final` caps) raises `E_FIXED_POINT_DIVERGED` and routes to human review rather than guessing.

The engine also computes, for any node carrying an `Interpretation`, the **counterfactual value under each alternative**, and writes the delta into `Interpretation.materialityGbp`. An analyst reviewing a definition therefore sees "this ambiguity is worth 0.31x of leverage headroom" rather than an abstract question.

### 2.6 Period and pro-forma nodes

```ts
export interface PeriodAggregateNode extends NodeMeta {
  type: 'periodAggregate';
  expr: Expr;                       // evaluated once per sub-period
  over: { unit: 'quarter' | 'month'; count: number; endingAt: PeriodSelector };
  op: 'sum' | 'average' | 'min' | 'max' | 'last';
  /** What to do when fewer sub-periods exist than requested (post-closing stub). */
  insufficientHistory:
    | { policy: 'error' }
    | { policy: 'annualise' }                       // scale available periods to 12m
    | { policy: 'useAvailableOnly' }
    | { policy: 'backfillFromPreClosing'; source: 'longFormAccounts' | 'vendorDD' }
    | { policy: 'fixedAmounts'; amounts: Record<string, DecStr> };  // agreed "Base Case" figures
  resultCcy?: CurrencyCode;
}

export interface PeriodShiftNode extends NodeMeta {
  type: 'periodShift'; expr: Expr; to: PeriodSelector;
}

/** Forces a stock (balance-sheet) reading at the end of the period rather than a flow sum. */
export interface PointInTimeNode extends NodeMeta {
  type: 'pointInTime'; expr: Expr; at: PeriodSelector;
}

export interface AnnualiseNode extends NodeMeta {
  type: 'annualise';
  expr: Expr;
  method: 'multiplyByPeriodsInYear' | 'scaleByDays';
  periodsElapsed: Expr;
}

export interface ProFormaNode extends NodeMeta {
  type: 'proForma';
  expr: Expr;
  events: Array<'acquisitions' | 'disposals' | 'permittedReorganisations'>;
  method:
    | 'targetActualsForStub'      // add target's own pre-acquisition results for the stub
    | 'annualisedRunRate'         // annualise post-acquisition actuals
    | 'lastTwelveMonthsOfTarget'
    | 'none';
  /** Whether a disposal's contribution is stripped out of the full LTM. */
  disposalTreatment: 'removeFullPeriod' | 'removeFromDisposalDate' | 'none';
  /** Only events at or above this size are pro-formed ("Material Acquisition"). */
  materialityThreshold?: Expr;
}

export interface FxConvertNode extends NodeMeta {
  type: 'fxConvert'; expr: Expr; to: CurrencyCode; rateBasis?: FxRateBasis;
}
```

---

## 3. Definitions, concepts, and the facility model

```ts
export interface CovenantDefinition {
  definitionId: DefinitionId;
  facilityId: string;
  /** The defined term exactly as capitalised in the agreement. */
  term: string;                    // "Consolidated EBITDA"
  kind: 'financialMeasure' | 'threshold' | 'testCondition' | 'helper';
  dim: Dim;
  params: Array<{ name: string; dim: Dim; default?: DecStr }>;
  ast: Expr;
  /** Default period the definition is evaluated over when referenced without override. */
  defaultPeriod: PeriodSelector;
  fxPolicy: FxPolicy;
  dependsOn: DefinitionId[];       // denormalised for cycle checking and impact analysis
}

export interface CovenantTest {
  covenantId: string;
  facilityId: string;
  name: string;                    // "Leverage"
  measure: DefinitionId;           // def_leverage_ratio
  operator: 'lte' | 'gte';
  thresholdSchedule: string;       // schedule_leverage_stepdown
  comparisonRounding: { dp: number; mode: 'halfUp' | 'halfEven' };
  testingSchedule: string;         // which test dates are live (covenant holidays live here)
  testCondition?: Expr;            // springing covenants
  cureRights?: CureRightsId;
  /** Headroom expressed in the units the fund reports on. */
  headroomPresentation: Array<'ratioDelta' | 'ebitdaDeclinePct' | 'debtIncreaseAbs'>;
  gracePeriodDays?: number;
  materialityQualifier?: string;
}
```

### 3.1 Concept registry and mapping

```ts
export interface ConceptDef {
  id: ConceptId;                   // "qm.pl.operatingProfit"
  label: string;
  statement: 'pl' | 'balanceSheet' | 'cashflow' | 'memo';
  temporality: 'flow' | 'stock';   // flow -> summable across quarters; stock -> point-in-time
  dim: Dim;
  /** Whether absence means "zero" (line simply not present because nil) or "unknown". */
  defaultWhenAbsent: 'zero' | 'missing';
  normalSign: 'positive' | 'negative';
  synonyms: string[];              // for extraction matching
  taxonomy?: { frs102?: string; ifrs?: string; ukGaapTag?: string };
}
```

`defaultWhenAbsent: 'zero'` is dangerous and honest: if a borrower had no exceptional items the line is simply absent, and treating it as missing would block every calculation. So absence-as-zero is allowed **but always emits a `TraceFlag` of kind `assumedZero`**, which surfaces in the UI as an amber chip and appears in the audit trail. Analysts can convert an amber chip into an affirmative "borrower confirmed nil" attestation.

Per-facility mapping from the borrower's own chart of accounts to concepts:

```ts
export interface LineItemMapping {
  facilityId: string;
  conceptId: ConceptId;
  sourceLabels: string[];          // "Operating profit", "Profit from operations"
  statementSection?: string;
  transform?: { multiply?: DecStr; negate?: boolean };
  approvedBy: UserId; approvedAt: ISODateTime;
}
```

### 3.2 Facts

```ts
export interface FinancialFact {
  factId: string;
  facilityId: string;
  entityId: string;
  conceptId: ConceptId;
  periodId: string;
  /** How the source reported it — the engine derives what it needs from this. */
  reportingBasis: 'period' | 'yearToDate' | 'ltm' | 'pointInTime';
  value: DecStr;
  ccy: CurrencyCode;
  unitScale: 1 | 1000 | 1000000;   // source stated "£'000" etc.
  qualifier?: string;              // matches FactRefNode.qualifier
  provenance: Provenance;
  status: 'extracted' | 'reviewed' | 'approved' | 'superseded' | 'rejected';
  supersedes?: string;
}

export interface Provenance {
  documentId: string;
  documentVersionId: string;
  documentType: 'complianceCertificate' | 'managementAccounts' | 'auditedAccounts'
              | 'budget' | 'sideLetter' | 'analystEntry' | 'borrowerPortal';
  page: number;
  bbox?: [number, number, number, number];
  cellRef?: string;                // for spreadsheets
  snippet: string;
  method: 'tableExtract' | 'llmExtract' | 'manual' | 'api' | 'derived';
  /** For 'derived': the derivation is itself a mini-trace. */
  derivation?: { rule: 'ytdDelta' | 'ltmSum' | 'unitRescale' | 'fx'; fromFactIds: string[] };
  extractorVersion?: string;
  confidence?: number;             // 0..1, model-reported; never used to auto-approve
  approvedBy?: UserId; approvedAt?: ISODateTime;
}
```

The `derived` provenance kind matters: management accounts are usually cumulative YTD, so Q3 standalone = YTD_Q3 − YTD_Q2. That subtraction is a real calculation an auditor will ask about, so it gets a fact of its own with a derivation record pointing at its two parents, and it appears as an expandable step in the trace.

---

## 4. Worked example — the bespoke Consolidated EBITDA, as stored JSON

Facility `FAC-1042` (Meridian Packaging Group), GBP term loan, closed 2024-09-30.

### 4.1 The definition document

```json
{
  "definitionId": "def_consolidated_ebitda",
  "facilityId": "FAC-1042",
  "term": "Consolidated EBITDA",
  "kind": "financialMeasure",
  "dim": { "kind": "money", "ccy": "GBP" },
  "params": [],
  "defaultPeriod": { "rel": "ltm" },
  "fxPolicy": {
    "plRate": "averageForPeriod",
    "balanceSheetRate": "testDateSpot",
    "source": "ecbReferenceRate",
    "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
               "clauseRef": "Clause 21.3 (Financial testing – currency)",
               "page": 88, "quote": "amounts shall be converted at the average rate for the Relevant Period" }]
  },
  "dependsOn": [],
  "ast": {
    "type": "adjustedAggregate",
    "id": "ebitda.root",
    "label": "Consolidated EBITDA",
    "traceProminence": "headline",
    "cite": [{
      "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
      "clauseRef": "Clause 1.1 (definition of \"EBITDA\")",
      "page": 23, "bbox": [0.11, 0.34, 0.89, 0.71],
      "quote": "EBITDA means, for any Relevant Period, the consolidated operating profit of the Group before taxation..."
    }],
    "fixedPoint": { "maxIterations": 25, "toleranceDec": "0.01" },

    "base": {
      "type": "periodAggregate",
      "id": "ebitda.base",
      "label": "Consolidated operating profit before taxation (LTM)",
      "op": "sum",
      "over": { "unit": "quarter", "count": 4, "endingAt": { "rel": "testDate" } },
      "insufficientHistory": { "policy": "backfillFromPreClosing", "source": "longFormAccounts" },
      "expr": {
        "type": "factRef",
        "id": "ebitda.base.fact",
        "concept": "qm.pl.operatingProfitBeforeTax",
        "period": { "rel": "quarter", "offset": 0 },
        "entityScope": "group",
        "whenAbsent": "missing"
      }
    },

    "adjustments": [
      {
        "key": "a",
        "label": "Add back: depreciation and amortisation",
        "sign": "add",
        "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                   "clauseRef": "Clause 1.1, para (a)", "page": 23,
                   "bbox": [0.13, 0.44, 0.86, 0.47],
                   "quote": "(a) depreciation and amortisation;" }],
        "confidence": "high",
        "value": {
          "type": "periodAggregate",
          "id": "ebitda.adj.a",
          "op": "sum",
          "over": { "unit": "quarter", "count": 4, "endingAt": { "rel": "testDate" } },
          "insufficientHistory": { "policy": "backfillFromPreClosing", "source": "longFormAccounts" },
          "expr": {
            "type": "sum",
            "id": "ebitda.adj.a.sum",
            "terms": [
              { "sign": 1, "label": "Depreciation", "expr": {
                  "type": "factRef", "id": "ebitda.adj.a.dep",
                  "concept": "qm.pl.depreciation",
                  "period": { "rel": "quarter", "offset": 0 },
                  "signConvention": "positiveIsAddback", "whenAbsent": "zero" } },
              { "sign": 1, "label": "Amortisation", "expr": {
                  "type": "factRef", "id": "ebitda.adj.a.amort",
                  "concept": "qm.pl.amortisation",
                  "period": { "rel": "quarter", "offset": 0 },
                  "signConvention": "positiveIsAddback", "whenAbsent": "zero" } }
            ]
          }
        }
      },

      {
        "key": "b",
        "label": "Add back: exceptional or non-recurring items (capped £500,000 p.a. in aggregate)",
        "sign": "add",
        "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                   "clauseRef": "Clause 1.1, para (b)", "page": 23,
                   "bbox": [0.13, 0.47, 0.86, 0.52],
                   "quote": "(b) exceptional or non-recurring items not exceeding £500,000 in aggregate per annum;" }],
        "confidence": "high",
        "interpretation": {
          "question": "The Relevant Period is a trailing twelve months which does not align to the financial year. Is the £500,000 'per annum' cap applied to the Relevant Period, or to the financial year?",
          "chosen": "Applied to the twelve-month Relevant Period without pro-ration",
          "alternatives": ["Applied per financial year with pro-ration across a straddling period",
                           "Applied per financial year, charged wholly to the later year"],
          "rationale": "Clause 21.1 defines Relevant Period as the twelve months ending on the test date; the fund's credit committee reads 'per annum' as coterminous with that period.",
          "decidedBy": "usr_jvaria", "decidedAt": "2024-11-04T10:22:00Z"
        },
        "cap": {
          "limit": { "type": "literal", "id": "ebitda.adj.b.cap.limit",
                     "value": "500000", "dim": { "kind": "money", "ccy": "GBP" } },
          "basis": "perRelevantPeriod",
          "scope": { "kind": "group", "groupId": "exceptional_and_nonrecurring" },
          "straddleTreatment": "noProRata",
          "label": "£500,000 per annum, in aggregate"
        },
        "value": {
          "type": "periodAggregate",
          "id": "ebitda.adj.b",
          "op": "sum",
          "over": { "unit": "quarter", "count": 4, "endingAt": { "rel": "testDate" } },
          "insufficientHistory": { "policy": "backfillFromPreClosing", "source": "longFormAccounts" },
          "expr": {
            "type": "factRef", "id": "ebitda.adj.b.fact",
            "concept": "qm.pl.exceptionalItems",
            "period": { "rel": "quarter", "offset": 0 },
            "signConvention": "positiveIsAddback",
            "whenAbsent": "zero"
          }
        }
      },

      {
        "key": "c",
        "label": "Add back: transaction costs of Permitted Acquisitions",
        "sign": "add",
        "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                   "clauseRef": "Clause 1.1, para (c)", "page": 23,
                   "bbox": [0.13, 0.52, 0.86, 0.56],
                   "quote": "(c) transaction costs relating to Permitted Acquisitions;" }],
        "confidence": "medium",
        "note": "The P&L does not break out acquisition-related transaction costs. Sourced from Schedule 2 of the Compliance Certificate and requires borrower attestation.",
        "value": {
          "type": "attestedInput",
          "id": "ebitda.adj.c",
          "key": "transactionCosts.permittedAcquisitions",
          "dim": { "kind": "money", "ccy": "GBP" },
          "period": { "rel": "ltm" },
          "requires": "borrowerCertificate",
          "approvalRequired": true,
          "whenAbsent": "zero"
        }
      },

      {
        "key": "d",
        "label": "Add back: run-rate cost savings from Permitted Acquisitions (capped at 20% of EBITDA)",
        "sign": "add",
        "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                   "clauseRef": "Clause 1.1, para (d)", "page": 23,
                   "bbox": [0.13, 0.56, 0.86, 0.63],
                   "quote": "(d) run-rate cost savings from any Permitted Acquisition, capped at 20% of EBITDA and only to the extent realisable within 12 months;" }],
        "confidence": "low",
        "interpretation": {
          "question": "Is the 20% cap measured on EBITDA before or after giving effect to this add-back?",
          "chosen": "Before giving effect to this add-back (i.e. on EBITDA inclusive of (a),(b),(c),(e) only)",
          "alternatives": ["On fully adjusted EBITDA including the synergy add-back (requires fixed-point solve)",
                           "On unadjusted consolidated operating profit"],
          "rationale": "The clause is silent. Fund reads the cap conservatively; flagged to counsel 2024-11-04, no response as at publication. Materiality computed below.",
          "decidedBy": "usr_jvaria", "decidedAt": "2024-11-04T10:31:00Z",
          "escalatedToCounsel": true
        },
        "condition": {
          "type": "attestedInput",
          "id": "ebitda.adj.d.cond",
          "key": "synergies.realisableWithin12Months",
          "dim": { "kind": "boolean" },
          "period": { "rel": "ltm" },
          "requires": "either",
          "approvalRequired": true,
          "whenAbsent": "missing",
          "label": "Analyst confirms savings are realisable within 12 months"
        },
        "cap": {
          "limit": {
            "type": "product",
            "id": "ebitda.adj.d.cap.limit",
            "label": "20% of EBITDA (before this add-back)",
            "factors": [
              { "type": "literal", "id": "ebitda.adj.d.cap.pct", "value": "0.20",
                "dim": { "kind": "scalar", "display": "percent" } },
              { "type": "selfRef", "id": "ebitda.adj.d.cap.self", "stage": "beforeThisAdjustment" }
            ]
          },
          "basis": "perRelevantPeriod",
          "scope": { "kind": "thisAdjustment" },
          "circularity": "beforeThisAdjustment",
          "label": "20% of EBITDA"
        },
        "value": {
          "type": "attestedInput",
          "id": "ebitda.adj.d",
          "key": "synergies.runRate.permittedAcquisitions",
          "dim": { "kind": "money", "ccy": "GBP" },
          "period": { "rel": "ltm" },
          "requires": "borrowerCertificate",
          "approvalRequired": true,
          "whenAbsent": "zero"
        }
      },

      {
        "key": "e",
        "label": "Deduct: gain on disposal of assets",
        "sign": "deduct",
        "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                   "clauseRef": "Clause 1.1, para (e)", "page": 24,
                   "bbox": [0.13, 0.11, 0.86, 0.15],
                   "quote": "and deducting: (e) any gain on disposal of assets." }],
        "confidence": "high",
        "value": {
          "type": "periodAggregate",
          "id": "ebitda.adj.e",
          "op": "sum",
          "over": { "unit": "quarter", "count": 4, "endingAt": { "rel": "testDate" } },
          "insufficientHistory": { "policy": "backfillFromPreClosing", "source": "longFormAccounts" },
          "expr": {
            "type": "factRef", "id": "ebitda.adj.e.fact",
            "concept": "qm.pl.gainOnDisposalOfAssets",
            "period": { "rel": "quarter", "offset": 0 },
            "whenAbsent": "zero"
          }
        }
      }
    ]
  }
}
```

### 4.2 The leverage measure and covenant that consume it

```json
{
  "definitionId": "def_leverage_ratio",
  "facilityId": "FAC-1042",
  "term": "Leverage",
  "kind": "financialMeasure",
  "dim": { "kind": "scalar", "display": "multiple" },
  "defaultPeriod": { "rel": "ltm" },
  "dependsOn": ["def_total_net_debt", "def_consolidated_ebitda"],
  "ast": {
    "type": "divide",
    "id": "lev.root",
    "label": "Leverage = Total Net Debt / Consolidated EBITDA",
    "traceProminence": "headline",
    "onZeroDenominator": "error",
    "onNegativeDenominator": "treatAsBreach",
    "numerator": {
      "type": "defRef", "id": "lev.num",
      "definitionId": "def_total_net_debt",
      "periodOverride": { "rel": "testDate" }
    },
    "denominator": {
      "type": "proForma",
      "id": "lev.den.pf",
      "label": "Consolidated EBITDA, pro forma for Material Acquisitions",
      "events": ["acquisitions", "disposals"],
      "method": "targetActualsForStub",
      "disposalTreatment": "removeFullPeriod",
      "materialityThreshold": { "type": "literal", "id": "lev.den.pf.mat",
                                "value": "5000000", "dim": { "kind": "money", "ccy": "GBP" } },
      "expr": { "type": "defRef", "id": "lev.den", "definitionId": "def_consolidated_ebitda" }
    }
  }
}
```

```json
{
  "covenantId": "cov_1042_leverage",
  "facilityId": "FAC-1042",
  "name": "Leverage",
  "measure": "def_leverage_ratio",
  "operator": "lte",
  "thresholdSchedule": "sched_1042_leverage",
  "comparisonRounding": { "dp": 2, "mode": "halfUp" },
  "testingSchedule": "sched_1042_testdates",
  "cureRights": "cure_1042",
  "headroomPresentation": ["ratioDelta", "ebitdaDeclinePct"],
  "gracePeriodDays": 0
}
```

---

## 5. The evaluation engine

### 5.1 Values and inputs

```ts
export type Value =
  | { s: 'num'; dec: Dec; dim: Dim }
  | { s: 'bool'; b: boolean }
  | { s: 'date'; d: ISODate }
  | { s: 'missing'; causes: MissingCause[] }
  | { s: 'error'; code: ErrorCode; message: string; nodeId: NodeId };

export interface MissingCause {
  kind: 'fact' | 'attestation' | 'fxRate' | 'schedule' | 'period';
  concept?: ConceptId; key?: string; periodId?: string; entityId?: string;
  nodeId: NodeId;
  /** Renders in the UI as an actionable task: "Request Q2 depreciation from borrower". */
  remediation: string;
}
```

Missing **accumulates rather than short-circuits**. If eight inputs are absent, the analyst sees eight tasks, not one. Propagation rules:

| Node | Behaviour on missing child |
|---|---|
| `sum`, `product`, `divide` | propagate, union the causes |
| `min`/`max`/`greaterOf` | propagate (a missing operand could be the extremum) |
| `coalesce` | skip missing, take first present |
| `if` | missing cond → propagate; present cond → only the taken branch's missingness matters |
| `adjustedAggregate` | an adjustment whose `value` is missing propagates; an adjustment whose `condition` is missing propagates |
| `capped` | missing limit → propagate; missing value → propagate |
| `periodAggregate` | governed by `insufficientHistory` |
| `isPresent` | never propagates — returns `false` |

`error` always dominates `missing`.

```ts
export interface EvalInputs {
  readonly facilityId: string;
  readonly testDate: ISODate;
  readonly calendar: FiscalCalendar;
  readonly periods: ReadonlyArray<Period>;
  readonly definitions: ReadonlyMap<DefinitionId, CovenantDefinition>;   // already version-resolved
  readonly facts: FactIndex;                  // frozen snapshot
  readonly attestations: ReadonlyMap<string, Attestation>;
  readonly fx: FxSnapshot;
  readonly schedules: ReadonlyMap<string, ThresholdSchedule>;
  readonly ledgers: { acquisitions: Event[]; disposals: Event[]; equityCures: CureEvent[]; baskets: BasketState[] };
  readonly mappings: ReadonlyArray<LineItemMapping>;
  readonly concepts: ReadonlyMap<ConceptId, ConceptDef>;
  readonly snapshotHash: string;              // sha256 of the canonical JSON of everything above
}

export interface EvalResult {
  value: Value;
  trace: TraceNode;
  flags: TraceFlag[];                          // flattened, for fast querying
  missing: MissingCause[];
  engineVersion: string;                       // "cek-engine@1.4.0"
  traceSchemaVersion: 2;
  resultHash: string;                          // sha256 of canonical(trace)
}

export function evaluate(root: Expr, inputs: EvalInputs): EvalResult;   // pure
```

### 5.2 Reference resolution

`factRef` resolution order:

1. Resolve `PeriodSelector` → concrete `periodId` via the fiscal calendar.
2. Look up `(entityScope, conceptId, periodId, qualifier)` in the `FactIndex`.
3. If no fact with `reportingBasis: 'period'` exists but YTD facts do, derive: `Q(n) = YTD(n) − YTD(n−1)`, emitting a `derived` fact with a `derivation` record and a `TraceFlag{kind:'derivedInput'}`.
4. Apply `unitScale` (a `£'000` statement multiplied to units) — flagged.
5. Apply `signConvention` — flagged if it flipped a sign.
6. If the fact's `ccy` differs from the required dimension, apply the `fxPolicy` — flagged with the rate and rate source.
7. If still nothing: consult `whenAbsent` / `ConceptDef.defaultWhenAbsent`. `'zero'` yields zero plus `TraceFlag{kind:'assumedZero'}`; `'missing'` yields a `MissingCause`.
8. Facts with `status: 'extracted'` (not yet human-approved) are usable but stamp the whole calculation `provisional`, which blocks publication to investor reporting.

`defRef` resolution walks the definition graph. Cycles are rejected at authoring time by `cek-validate` (Tarjan SCC over `dependsOn`) and again at runtime by an evaluation stack check → `E_CYCLIC_DEFINITION`. Results are memoised on `(definitionId, versionId, periodId, entityScope, proFormaContextHash)`.

### 5.3 Evaluating `adjustedAggregate`

```ts
function evalAdjustedAggregate(n: AdjustedAggregateNode, ctx: Ctx): [Value, TraceNode] {
  const [baseV, baseT] = ev(n.base, ctx);
  let running = asDec(baseV);
  const groupConsumed = new Map<string, Dec>();     // shared "in aggregate" caps
  const childTraces: TraceNode[] = [baseT];

  for (const adj of n.adjustments) {
    // 1. gate
    if (adj.condition) {
      const [c, ct] = ev(adj.condition, ctx);
      if (c.s !== 'bool') { /* propagate missing/error */ }
      if (c.s === 'bool' && !c.b) {
        childTraces.push(skippedTrace(adj, ct, 'condition not satisfied'));
        continue;                                   // contributes zero, visibly
      }
    }
    // 2. raw value
    const [rawV, rawT] = ev(adj.value, ctx);
    let contribution = asDec(rawV);

    // 3. cap
    let capTrace: TraceNode | undefined;
    if (adj.cap) {
      // selfRef inside the limit resolves against a snapshot of `running`
      const capCtx = ctx.withSelf({
        base: asDec(baseV),
        beforeThisAdjustment: running,
        final: ctx.fixedPointIterate?.currentFinal   // set only during iteration
      });
      const [limitV, limitT] = ev(adj.cap.limit, capCtx);
      let headroom = asDec(limitV);

      if (adj.cap.scope.kind === 'group') {
        const used = groupConsumed.get(adj.cap.scope.groupId) ?? ZERO;
        headroom = headroom.minus(used);
      }
      if (adj.cap.basis === 'aggregateSinceClosing' && adj.cap.ledgerKey) {
        headroom = headroom.minus(ctx.basketConsumed(adj.cap.ledgerKey));
      }

      const allowed = Decimal.min(contribution, Decimal.max(headroom, ZERO));
      capTrace = capTraceNode(adj, contribution, headroom, allowed, limitT);
      if (allowed.lt(contribution)) {
        ctx.flag({ kind: 'capBinding', nodeId: adj.value.id,
                   detail: `Cap reduced this add-back by ${fmt(contribution.minus(allowed))}`,
                   impact: contribution.minus(allowed).toString() });
      }
      contribution = allowed;
      if (adj.cap.scope.kind === 'group')
        groupConsumed.set(adj.cap.scope.groupId, (groupConsumed.get(adj.cap.scope.groupId) ?? ZERO).plus(allowed));
    }

    running = adj.sign === 'add' ? running.plus(contribution) : running.minus(contribution);
    childTraces.push(adjustmentTrace(adj, rawT, capTrace, contribution, running));
  }
  return [num(running, dimOf(n)), aggregateTrace(n, childTraces, running)];
}
```

When any cap declares `circularity: 'final'`, the whole aggregate is wrapped in a fixed-point loop: seed `currentFinal` with the value computed under `beforeThisAdjustment` semantics, re-evaluate, repeat until `|x_{k+1} − x_k| < tolerance` or `maxIterations` is exceeded (→ `E_FIXED_POINT_DIVERGED`). Every iterate is recorded in the trace as a collapsed `fixedPointIteration` group, so an auditor can see the convergence.

### 5.4 The trace

```ts
export interface TraceNode {
  nodeId: NodeId;
  type: Expr['type'] | 'adjustment' | 'cap' | 'skipped' | 'fixedPointIteration' | 'derivation';
  label?: string;
  /** Symbolic: "Total Net Debt / Consolidated EBITDA" */
  expression: string;
  /** Substituted: "142,296,400 / 30,934,000" */
  substituted: string;
  /** The answer: "4.6000x" */
  display: string;
  value: SerialisedValue;
  cite?: ClauseCitation[];
  inputs?: FactBinding[];        // present on leaves
  flags: TraceFlag[];
  children: TraceNode[];
  /** Contribution to the parent, signed — lets the UI draw a waterfall directly from the trace. */
  contribution?: { sign: 1 | -1; dec: DecStr };
  collapsedByDefault?: boolean;
}

export interface FactBinding {
  factId: string;
  conceptId: ConceptId;
  conceptLabel: string;
  periodId: string; periodLabel: string;
  entityId: string;
  value: DecStr; ccy?: CurrencyCode;
  provenance: Provenance;
  status: FinancialFact['status'];
}

export type TraceFlag =
  | { kind: 'assumedZero'; nodeId: NodeId; concept: ConceptId; periodId: string }
  | { kind: 'capBinding'; nodeId: NodeId; detail: string; impact: DecStr }
  | { kind: 'floorBinding'; nodeId: NodeId; detail: string; impact: DecStr }
  | { kind: 'fxApplied'; nodeId: NodeId; pair: string; rate: DecStr; basis: FxRateBasis; source: string }
  | { kind: 'derivedInput'; nodeId: NodeId; rule: string; fromFactIds: string[] }
  | { kind: 'unitRescaled'; nodeId: NodeId; from: number }
  | { kind: 'signFlipped'; nodeId: NodeId }
  | { kind: 'provisionalInput'; nodeId: NodeId; factId: string }
  | { kind: 'interpretationApplied'; nodeId: NodeId; question: string; chosen: string; materiality?: DecStr }
  | { kind: 'proFormaApplied'; nodeId: NodeId; eventId: string; method: string; amount: DecStr }
  | { kind: 'insufficientHistory'; nodeId: NodeId; policy: string; periodsAvailable: number }
  | { kind: 'conditionFailed'; nodeId: NodeId; detail: string }
  | { kind: 'fixedPointConverged'; nodeId: NodeId; iterations: number };

export type SerialisedValue =
  | { s: 'num'; dec: DecStr; dim: Dim }
  | { s: 'bool'; b: boolean }
  | { s: 'missing'; causes: MissingCause[] }
  | { s: 'error'; code: string; message: string };
```

### 5.5 Trace for the worked example — Q4 2025, how 4.60x arose

Reported by borrower: **4.29x**. Recalculated by QuarterMark: **4.60x**. Covenant limit: **4.50x**. Variance **0.31x**, wholly attributable to the £500,000 cap on paragraph (b).

```json
{
  "nodeId": "lev.root",
  "type": "divide",
  "label": "Leverage = Total Net Debt / Consolidated EBITDA",
  "expression": "Total Net Debt / Consolidated EBITDA",
  "substituted": "142,296,400 / 30,934,000",
  "display": "4.60x",
  "value": { "s": "num", "dec": "4.60000000", "dim": { "kind": "scalar", "display": "multiple" } },
  "flags": [],
  "children": [
    {
      "nodeId": "lev.num",
      "type": "defRef",
      "label": "Total Net Debt (at 31 Dec 2025)",
      "expression": "Senior Debt + Finance Leases − Cash and Cash Equivalents",
      "substituted": "148,000,000 + 2,410,000 − 8,113,600",
      "display": "£142,296,400",
      "value": { "s": "num", "dec": "142296400", "dim": { "kind": "money", "ccy": "GBP" } },
      "flags": [
        { "kind": "fxApplied", "nodeId": "tnd.eur_tranche", "pair": "EUR/GBP",
          "rate": "0.8412", "basis": "testDateSpot", "source": "ecbReferenceRate 2025-12-31" }
      ],
      "collapsedByDefault": true,
      "children": ["…elided in this excerpt…"]
    },
    {
      "nodeId": "lev.den.pf",
      "type": "proForma",
      "label": "Consolidated EBITDA, pro forma for Material Acquisitions",
      "expression": "EBITDA + pro forma contribution of Ashwell Cartons Ltd (stub 1 Apr – 12 Aug 2025)",
      "substituted": "29,772,000 + 1,162,000",
      "display": "£30,934,000",
      "value": { "s": "num", "dec": "30934000", "dim": { "kind": "money", "ccy": "GBP" } },
      "flags": [
        { "kind": "proFormaApplied", "nodeId": "lev.den.pf", "eventId": "evt_acq_ashwell",
          "method": "targetActualsForStub", "amount": "1162000" }
      ],
      "children": [
        {
          "nodeId": "ebitda.root",
          "type": "adjustedAggregate",
          "label": "Consolidated EBITDA (LTM to 31 Dec 2025)",
          "expression": "Operating profit + (a) D&A + (b) Exceptionals + (c) Transaction costs + (d) Synergies − (e) Gain on disposal",
          "substituted": "18,400,000 + 9,850,000 + 500,000 + 340,000 + 2,000,000 − 156,000",
          "display": "£29,772,000 (£30,934,000 pro forma)",
          "value": { "s": "num", "dec": "29772000", "dim": { "kind": "money", "ccy": "GBP" } },
          "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                     "clauseRef": "Clause 1.1 (definition of \"EBITDA\")", "page": 23,
                     "bbox": [0.11, 0.34, 0.89, 0.71],
                     "quote": "EBITDA means, for any Relevant Period, the consolidated operating profit of the Group before taxation..." }],
          "flags": [
            { "kind": "capBinding", "nodeId": "ebitda.adj.b",
              "detail": "The £500,000 per annum cap on exceptional and non-recurring items reduced the add-back by £2,220,000.",
              "impact": "2220000" },
            { "kind": "interpretationApplied", "nodeId": "ebitda.adj.d",
              "question": "Is the 20% cap measured on EBITDA before or after giving effect to this add-back?",
              "chosen": "Before giving effect to this add-back",
              "materiality": "0" }
          ],
          "children": [
            {
              "nodeId": "ebitda.base",
              "type": "periodAggregate",
              "label": "Consolidated operating profit before taxation (LTM)",
              "expression": "Q1-25 + Q2-25 + Q3-25 + Q4-25",
              "substituted": "4,120,000 + 4,690,000 + 4,880,000 + 4,710,000",
              "display": "£18,400,000",
              "value": { "s": "num", "dec": "18400000", "dim": { "kind": "money", "ccy": "GBP" } },
              "contribution": { "sign": 1, "dec": "18400000" },
              "flags": [
                { "kind": "derivedInput", "nodeId": "ebitda.base.fact",
                  "rule": "ytdDelta", "fromFactIds": ["fact_9a12", "fact_9a08"] }
              ],
              "children": [
                {
                  "nodeId": "ebitda.base.fact@FY25Q4",
                  "type": "factRef",
                  "label": "Operating profit before taxation — Q4 2025",
                  "expression": "qm.pl.operatingProfitBeforeTax [FY25Q4, Group]",
                  "substituted": "18,610,000 (YTD Dec) − 13,900,000 (YTD Sep)",
                  "display": "£4,710,000",
                  "value": { "s": "num", "dec": "4710000", "dim": { "kind": "money", "ccy": "GBP" } },
                  "flags": [{ "kind": "derivedInput", "nodeId": "ebitda.base.fact@FY25Q4",
                              "rule": "ytdDelta", "fromFactIds": ["fact_9a12", "fact_9a08"] }],
                  "inputs": [
                    {
                      "factId": "fact_9a12",
                      "conceptId": "qm.pl.operatingProfitBeforeTax",
                      "conceptLabel": "Operating profit before taxation",
                      "periodId": "FY25YTD_Dec", "periodLabel": "12 months to 31 Dec 2025",
                      "entityId": "ent_meridian_group",
                      "value": "18610000", "ccy": "GBP",
                      "status": "approved",
                      "provenance": {
                        "documentId": "doc_mgmt_1042_2025Q4",
                        "documentVersionId": "docv_88",
                        "documentType": "managementAccounts",
                        "page": 4,
                        "bbox": [0.62, 0.418, 0.78, 0.436],
                        "snippet": "Operating profit before taxation   18,610",
                        "method": "tableExtract",
                        "extractorVersion": "qm-extract@3.2.1",
                        "confidence": 0.97,
                        "approvedBy": "usr_jvaria",
                        "approvedAt": "2026-01-21T14:03:11Z"
                      }
                    },
                    {
                      "factId": "fact_9a08",
                      "conceptId": "qm.pl.operatingProfitBeforeTax",
                      "conceptLabel": "Operating profit before taxation",
                      "periodId": "FY25YTD_Sep", "periodLabel": "9 months to 30 Sep 2025",
                      "entityId": "ent_meridian_group",
                      "value": "13900000", "ccy": "GBP",
                      "status": "approved",
                      "provenance": {
                        "documentId": "doc_mgmt_1042_2025Q3", "documentVersionId": "docv_71",
                        "documentType": "managementAccounts", "page": 4,
                        "bbox": [0.62, 0.418, 0.78, 0.436],
                        "snippet": "Operating profit before taxation   13,900",
                        "method": "tableExtract", "extractorVersion": "qm-extract@3.1.0",
                        "confidence": 0.96,
                        "approvedBy": "usr_jvaria", "approvedAt": "2025-10-19T09:44:02Z"
                      }
                    }
                  ],
                  "children": []
                }
              ]
            },
            {
              "nodeId": "ebitda.adj.a",
              "type": "adjustment",
              "label": "(a) Add back: depreciation and amortisation",
              "expression": "Σ quarterly (Depreciation + Amortisation)",
              "substituted": "7,240,000 + 2,610,000",
              "display": "+ £9,850,000",
              "value": { "s": "num", "dec": "9850000", "dim": { "kind": "money", "ccy": "GBP" } },
              "contribution": { "sign": 1, "dec": "9850000" },
              "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                         "clauseRef": "Clause 1.1, para (a)", "page": 23,
                         "bbox": [0.13, 0.44, 0.86, 0.47],
                         "quote": "(a) depreciation and amortisation;" }],
              "flags": [],
              "collapsedByDefault": true,
              "children": ["…four quarterly leaves with full provenance…"]
            },
            {
              "nodeId": "ebitda.adj.b",
              "type": "adjustment",
              "label": "(b) Add back: exceptional or non-recurring items",
              "expression": "min(Σ quarterly exceptional items, £500,000 per annum cap)",
              "substituted": "min(2,720,000, 500,000)",
              "display": "+ £500,000  (capped — £2,220,000 disallowed)",
              "value": { "s": "num", "dec": "500000", "dim": { "kind": "money", "ccy": "GBP" } },
              "contribution": { "sign": 1, "dec": "500000" },
              "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                         "clauseRef": "Clause 1.1, para (b)", "page": 23,
                         "bbox": [0.13, 0.47, 0.86, 0.52],
                         "quote": "(b) exceptional or non-recurring items not exceeding £500,000 in aggregate per annum;" }],
              "flags": [
                { "kind": "capBinding", "nodeId": "ebitda.adj.b",
                  "detail": "Claimed £2,720,000; contractual cap £500,000 in aggregate per annum.",
                  "impact": "2220000" },
                { "kind": "interpretationApplied", "nodeId": "ebitda.adj.b",
                  "question": "Is the £500,000 'per annum' cap applied to the Relevant Period or the financial year?",
                  "chosen": "Applied to the twelve-month Relevant Period without pro-ration",
                  "materiality": "0" }
              ],
              "children": [
                {
                  "nodeId": "ebitda.adj.b.raw",
                  "type": "periodAggregate",
                  "label": "Exceptional items claimed (LTM)",
                  "expression": "Q1 + Q2 + Q3 + Q4",
                  "substituted": "180,000 + 1,940,000 + 300,000 + 300,000",
                  "display": "£2,720,000",
                  "value": { "s": "num", "dec": "2720000", "dim": { "kind": "money", "ccy": "GBP" } },
                  "flags": [],
                  "children": [
                    {
                      "nodeId": "ebitda.adj.b.fact@FY25Q2",
                      "type": "factRef",
                      "label": "Exceptional items — Q2 2025 (site closure, Wolverhampton)",
                      "expression": "qm.pl.exceptionalItems [FY25Q2, Group]",
                      "substituted": "1,940,000",
                      "display": "£1,940,000",
                      "value": { "s": "num", "dec": "1940000", "dim": { "kind": "money", "ccy": "GBP" } },
                      "flags": [{ "kind": "unitRescaled", "nodeId": "ebitda.adj.b.fact@FY25Q2", "from": 1000 }],
                      "inputs": [{
                        "factId": "fact_7c31",
                        "conceptId": "qm.pl.exceptionalItems",
                        "conceptLabel": "Exceptional and non-recurring items",
                        "periodId": "FY25Q2", "periodLabel": "Quarter ended 30 Jun 2025",
                        "entityId": "ent_meridian_group",
                        "value": "1940000", "ccy": "GBP",
                        "status": "approved",
                        "provenance": {
                          "documentId": "doc_mgmt_1042_2025Q2", "documentVersionId": "docv_54",
                          "documentType": "managementAccounts", "page": 11,
                          "bbox": [0.55, 0.271, 0.74, 0.289],
                          "snippet": "Exceptional items – site closure    1,940",
                          "method": "llmExtract", "extractorVersion": "qm-extract@3.1.0",
                          "confidence": 0.91,
                          "approvedBy": "usr_apatel", "approvedAt": "2025-07-24T11:15:40Z"
                        }
                      }],
                      "children": []
                    }
                  ]
                },
                {
                  "nodeId": "ebitda.adj.b.cap",
                  "type": "cap",
                  "label": "Cap: £500,000 in aggregate per annum",
                  "expression": "cap limit − group consumption to date",
                  "substituted": "500,000 − 0",
                  "display": "£500,000 available",
                  "value": { "s": "num", "dec": "500000", "dim": { "kind": "money", "ccy": "GBP" } },
                  "flags": [],
                  "children": []
                }
              ]
            },
            {
              "nodeId": "ebitda.adj.c",
              "type": "adjustment",
              "label": "(c) Add back: transaction costs of Permitted Acquisitions",
              "expression": "Attested: transactionCosts.permittedAcquisitions",
              "substituted": "340,000",
              "display": "+ £340,000",
              "value": { "s": "num", "dec": "340000", "dim": { "kind": "money", "ccy": "GBP" } },
              "contribution": { "sign": 1, "dec": "340000" },
              "flags": [],
              "inputs": [{
                "factId": "att_c_2025q4",
                "conceptId": "qm.attested.transactionCosts",
                "conceptLabel": "Transaction costs — Permitted Acquisitions (attested)",
                "periodId": "FY25LTM", "periodLabel": "12 months to 31 Dec 2025",
                "entityId": "ent_meridian_group",
                "value": "340000", "ccy": "GBP",
                "status": "approved",
                "provenance": {
                  "documentId": "doc_cc_1042_2025Q4", "documentVersionId": "docv_91",
                  "documentType": "complianceCertificate", "page": 3,
                  "bbox": [0.20, 0.55, 0.80, 0.58],
                  "snippet": "Schedule 2, item 4: Transaction costs (Ashwell Cartons acquisition)   340",
                  "method": "llmExtract", "extractorVersion": "qm-extract@3.2.1", "confidence": 0.88,
                  "approvedBy": "usr_jvaria", "approvedAt": "2026-01-21T14:07:55Z"
                }
              }],
              "children": []
            },
            {
              "nodeId": "ebitda.adj.d",
              "type": "adjustment",
              "label": "(d) Add back: run-rate cost savings from Permitted Acquisitions",
              "expression": "min(attested run-rate savings, 20% × EBITDA before this add-back)",
              "substituted": "min(2,000,000, 0.20 × 28,934,000 = 5,786,800)",
              "display": "+ £2,000,000  (cap not binding)",
              "value": { "s": "num", "dec": "2000000", "dim": { "kind": "money", "ccy": "GBP" } },
              "contribution": { "sign": 1, "dec": "2000000" },
              "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                         "clauseRef": "Clause 1.1, para (d)", "page": 23,
                         "bbox": [0.13, 0.56, 0.86, 0.63],
                         "quote": "(d) run-rate cost savings from any Permitted Acquisition, capped at 20% of EBITDA and only to the extent realisable within 12 months;" }],
              "flags": [
                { "kind": "interpretationApplied", "nodeId": "ebitda.adj.d",
                  "question": "Is the 20% cap measured on EBITDA before or after giving effect to this add-back?",
                  "chosen": "Before giving effect to this add-back",
                  "materiality": "0" }
              ],
              "children": [
                { "nodeId": "ebitda.adj.d.cond", "type": "attestedInput",
                  "label": "Condition: savings realisable within 12 months",
                  "expression": "Attested: synergies.realisableWithin12Months",
                  "substituted": "true", "display": "Satisfied",
                  "value": { "s": "bool", "b": true }, "flags": [], "children": [] },
                { "nodeId": "ebitda.adj.d.cap", "type": "cap",
                  "label": "Cap: 20% of EBITDA (before this add-back)",
                  "expression": "0.20 × EBITDA[beforeThisAdjustment]",
                  "substituted": "0.20 × 28,934,000",
                  "display": "£5,786,800 available",
                  "value": { "s": "num", "dec": "5786800", "dim": { "kind": "money", "ccy": "GBP" } },
                  "flags": [], "children": [] }
              ]
            },
            {
              "nodeId": "ebitda.adj.e",
              "type": "adjustment",
              "label": "(e) Deduct: gain on disposal of assets",
              "expression": "Σ quarterly gain on disposal",
              "substituted": "156,000",
              "display": "− £156,000",
              "value": { "s": "num", "dec": "156000", "dim": { "kind": "money", "ccy": "GBP" } },
              "contribution": { "sign": -1, "dec": "156000" },
              "flags": [], "collapsedByDefault": true, "children": ["…"]
            }
          ]
        }
      ]
    }
  ]
}
```

### 5.6 The variance record — the differentiator, made explicit

Every calculation run is paired with the borrower's self-reported figures from the compliance certificate:

```ts
export interface VarianceFinding {
  covenantId: string;
  testDate: ISODate;
  reported: { value: DecStr; provenance: Provenance };   // 4.29x, page 2 of the cert
  recalculated: { value: DecStr; runId: string };        // 4.60x
  deltaAbs: DecStr;                                       // 0.31
  deltaPct: DecStr;
  /** Automatic attribution: re-run the calculation swapping in the borrower's stated
   *  component figures one at a time, and rank components by the size of the swing. */
  attribution: Array<{
    nodeId: NodeId; label: string; ourValue: DecStr; theirValue: DecStr;
    ratioImpact: DecStr; explanation: string;
  }>;
  severity: 'informational' | 'material' | 'crossesThreshold';
  status: 'open' | 'queriedWithBorrower' | 'borrowerAccepted' | 'fundAccepted' | 'escalated';
}
```

Attribution for this example:

```json
{
  "covenantId": "cov_1042_leverage",
  "testDate": "2025-12-31",
  "reported": { "value": "4.29", "provenance": { "documentId": "doc_cc_1042_2025Q4", "page": 2,
                "bbox": [0.62, 0.33, 0.78, 0.35], "snippet": "Leverage:  4.29:1",
                "documentType": "complianceCertificate", "documentVersionId": "docv_91",
                "method": "llmExtract" } },
  "recalculated": { "value": "4.60", "runId": "run_01JX8K3M2QVZ" },
  "deltaAbs": "0.31",
  "deltaPct": "0.0723",
  "attribution": [
    {
      "nodeId": "ebitda.adj.b",
      "label": "(b) Exceptional and non-recurring items",
      "ourValue": "500000",
      "theirValue": "2720000",
      "ratioImpact": "0.3080",
      "explanation": "The borrower added back the full £2,720,000 of exceptional items. Clause 1.1 para (b) caps this add-back at £500,000 in aggregate per annum. Applying the cap reduces Consolidated EBITDA by £2,220,000 and increases Leverage from 4.29x to 4.60x, taking it above the 4.50x covenant level."
    }
  ],
  "severity": "crossesThreshold",
  "status": "queriedWithBorrower"
}
```

That last object is the product. A £200m fund with 40 loans finds one of these per quarter and the platform has paid for itself.

---

## 6. Periods, LTM, and pro forma

### 6.1 Calendar

```ts
export interface FiscalCalendar {
  calendarId: string;
  yearEndMonth: 1..12; yearEndDay: number;
  convention: 'calendarMonthEnd' | 'fourFourFive' | 'lastFridayOfMonth' | 'fiveFourFour';
  weekStart?: 'monday' | 'sunday';
  /** 53-week years under 4-4-5 need explicit period boundaries; generated once and stored. */
  overrides?: Array<{ periodId: string; start: ISODate; end: ISODate }>;
}

export interface Period {
  periodId: string;              // "FY25Q4"
  facilityId: string;
  kind: 'month' | 'quarter' | 'halfYear' | 'year' | 'ltm' | 'ytd' | 'stub';
  start: ISODate; end: ISODate; days: number;
  fiscalYear: number; fiscalQuarter?: 1|2|3|4;
  label: string;                 // "Quarter ended 31 December 2025"
  isStub?: boolean;
}
```

Periods are **materialised rows**, not computed on the fly, because 4-4-5 and 53-week years make date arithmetic non-obvious and because a stored period table is auditable and can be corrected once.

### 6.2 LTM

`periodAggregate{ unit:'quarter', count:4, op:'sum' }` over a flow concept. Stock concepts (`temporality: 'stock'`) inside a `periodAggregate` are a **validation error** — you cannot sum four quarters of Total Net Debt. The validator forces `pointInTime` instead. This single rule eliminates the most common category of spreadsheet covenant error I have seen described.

Post-closing stub handling is explicit in `insufficientHistory`. For FAC-1042 (closed 30 Sep 2024, first test 31 Dec 2024) only one post-closing quarter exists; the agreement points to the long-form accounts, so `backfillFromPreClosing` pulls pre-closing quarters from a separately-tagged document set. The trace flags each backfilled quarter with `insufficientHistory` so a reader knows three of the four quarters predate the fund's ownership of the credit.

### 6.3 Pro forma

```ts
export interface AcquisitionEvent {
  eventId: string; facilityId: string;
  kind: 'acquisition';
  targetName: string; targetEntityId: string;
  completionDate: ISODate;
  consideration: { amount: DecStr; ccy: CurrencyCode };
  isPermittedAcquisition: boolean;
  isMaterial: boolean;                        // engine can also derive from materialityThreshold
  /** Target's standalone results for the pre-acquisition stub, as facts under targetEntityId. */
  stubFinancialsSource: { documentId: string; basis: 'auditedTarget' | 'vendorDD' | 'management' };
  cite?: ClauseCitation[];
  approvedBy: UserId;
}
```

Evaluation of `proForma`:

1. Evaluate the inner expression normally over the Relevant Period → `actual`.
2. For each qualifying event with `completionDate` inside the Relevant Period, compute the **stub window** = [periodStart, completionDate).
3. Re-evaluate the *same definition AST* with `entityScope` rebound to the target entity and the period bound to the stub window. **The target's EBITDA is computed using the borrower's bespoke definition**, not a generic one — this is what agreements almost always require and what spreadsheets almost never do.
4. Add (acquisitions) or subtract (disposals, per `disposalTreatment`) the stub contribution.
5. Emit `proFormaApplied` flags with the event id, method, and amount.

Synergies are *not* handled here: they are add-back (d) inside the EBITDA definition. Keeping them separate prevents double-counting, which is a real risk when both a pro-forma module and an add-back reference the same acquisition.

---

## 7. Schedules and step-downs

```ts
export interface ThresholdSchedule {
  scheduleId: string;
  facilityId: string;
  name: string;                  // "Leverage covenant levels"
  dim: Dim;
  /** Steps are resolved by finding the LAST step whose `from` is <= the test date. */
  steps: ScheduleStep[];
  cite?: ClauseCitation[];
}

export type ScheduleStep = {
  stepId: string;
  from: StepAnchor;
  /** Expr, not literal — some ratchets are "the greater of 3.00x and last year's level less 0.25x". */
  value: Expr;
  tested: boolean;               // false => covenant holiday
  cite?: ClauseCitation[];
};

export type StepAnchor =
  | { kind: 'testDateOnOrAfter'; date: ISODate }
  | { kind: 'quarterIndexSinceClosing'; index: number }     // 0 = first test date
  | { kind: 'fiscalPeriod'; periodId: string };
```

```json
{
  "scheduleId": "sched_1042_leverage",
  "facilityId": "FAC-1042",
  "name": "Leverage covenant levels",
  "dim": { "kind": "scalar", "display": "multiple" },
  "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
             "clauseRef": "Schedule 9 (Financial Covenants), Part A",
             "page": 174, "bbox": [0.14, 0.22, 0.86, 0.58],
             "quote": "Total Net Debt to EBITDA shall not exceed the ratio set out below opposite the relevant Quarter Date..." }],
  "steps": [
    { "stepId": "s0", "from": { "kind": "quarterIndexSinceClosing", "index": 0 },
      "tested": false,
      "value": { "type": "literal", "id": "s0.v", "value": "0", "dim": { "kind": "scalar", "display": "multiple" } },
      "cite": [{ "documentId": "doc_ca_1042", "documentVersionId": "docv_1",
                 "clauseRef": "Clause 21.2(c)", "page": 86,
                 "quote": "no Financial Covenant shall be tested on the first Quarter Date following the Closing Date" }] },
    { "stepId": "s1", "from": { "kind": "quarterIndexSinceClosing", "index": 1 }, "tested": true,
      "value": { "type": "literal", "id": "s1.v", "value": "4.50", "dim": { "kind": "scalar", "display": "multiple" } } },
    { "stepId": "s2", "from": { "kind": "testDateOnOrAfter", "date": "2026-09-30" }, "tested": true,
      "value": { "type": "literal", "id": "s2.v", "value": "4.00", "dim": { "kind": "scalar", "display": "multiple" } } },
    { "stepId": "s3", "from": { "kind": "testDateOnOrAfter", "date": "2027-09-30" }, "tested": true,
      "value": { "type": "literal", "id": "s3.v", "value": "3.50", "dim": { "kind": "scalar", "display": "multiple" } } }
  ]
}
```

`cek-validate` enforces **totality and monotonicity of anchors**: every test date from closing to final maturity must resolve to exactly one step, and anchors must be strictly increasing after normalisation to dates. A gap or an overlap is a hard error at authoring time — this is the class of bug where a fund tests Q3-2026 against 4.50x when the contract stepped down to 4.00x, which is exactly the failure the product exists to prevent.

Testing schedules (which dates are live) use the same structure with `tested` carrying the meaning, so covenant holidays, amend-and-extend holidays, and springing suspensions are all one mechanism.

---

## 8. Equity cures

Cures are **not** part of the definition AST. They are an append-only ledger applied at test time, producing paired results. This matters legally: a cured breach is still a breach that occurred, and the audit trail must show both states.

```ts
export interface CureRights {
  cureRightsId: string;
  facilityId: string;
  cite: ClauseCitation[];
  /** How the injected cash affects the calculation. */
  mechanics: {
    type: 'ebitdaCure' | 'debtPrepaymentCure' | 'borrowerElects';
    /** For ebitdaCure: how many test dates the cure amount is deemed to increase EBITDA for. */
    ebitdaCarryForwardPeriods: number;              // typically 4 (this test + next three)
    /** Whether cure proceeds sitting as cash reduce Total Net Debt. Market practice varies;
     *  the majority position I have seen described is that cure proceeds are excluded from
     *  cash for Net Debt purposes to prevent double-counting, but this is drafting-specific
     *  and MUST be read off the clause, not assumed. */
    proceedsCountAsCashForNetDebt: boolean;
    /** Whether a cure applied to one covenant is deemed to cure all covenants that quarter. */
    curesAllCovenants: boolean;
    overcurePermitted: boolean;
    /** Some agreements require the cure amount to be applied in mandatory prepayment. */
    mandatoryPrepaymentRequired: boolean;
  };
  limits: {
    maxOverLife: number;                             // 5
    window: { count: number; ofPeriods: number };    // 2 in any 4 consecutive test periods
    noConsecutiveTestDates: boolean;
    maxAmountPerCure?: Expr;                         // often "no more than needed to remedy"
    minAmountPerCure?: Expr;
    deadlineDaysAfterCertificate: number;            // cure period, e.g. 20 business days
  };
}

export interface CureEvent {
  cureId: string;
  facilityId: string;
  appliedToTestDate: ISODate;
  /** For carry-forward, the test dates this cure is deemed to benefit. */
  benefitsTestDates: ISODate[];
  amount: DecStr; ccy: CurrencyCode;
  fundsReceivedOn: ISODate;
  form: 'newEquity' | 'subordinatedShareholderLoan' | 'deepDiscountBond';
  electedCovenantIds: string[];
  evidence: Provenance[];                            // sponsor letter, bank statement
  status: 'proposed' | 'notified' | 'fundsReceived' | 'accepted' | 'rejected' | 'expired';
  recordedAt: ISODateTime; recordedBy: UserId;
}
```

Application algorithm at test time:

```ts
function applyCure(base: CovenantResult, cures: CureEvent[], rights: CureRights, ctx: Ctx): CovenantResult {
  const eligible = cures.filter(c =>
    c.status === 'accepted' &&
    c.benefitsTestDates.includes(ctx.testDate) &&
    withinDeadline(c, rights) );

  // Counting limits, evaluated against the ledger state as of this test date only.
  const usedInWindow = countCuresInWindow(ctx.testDate, rights.limits.window, ctx.ledgers.equityCures);
  const usedOverLife = countCuresOverLife(ctx.ledgers.equityCures);
  const consecutive  = rights.limits.noConsecutiveTestDates && curedPreviousTestDate(ctx);

  const violations: CureLimitViolation[] = [];
  if (usedInWindow + eligible.length > rights.limits.window.count) violations.push({...});
  if (usedOverLife + eligible.length > rights.limits.maxOverLife)  violations.push({...});
  if (consecutive) violations.push({ kind: 'consecutiveTestDates', ... });
  if (violations.length) return { ...base, cureOutcome: { applied: false, violations } };

  // Re-run the SAME AST with an injected cure adjustment. The cure enters as a synthetic
  // adjustment appended to the EBITDA aggregate (ebitdaCure) or as a synthetic reduction of
  // Total Net Debt (debtPrepaymentCure) — so it appears in the trace like any other step.
  const curedInputs = ctx.inputs.withCureInjection(eligible, rights.mechanics);
  const cured = evaluate(ctx.rootExpr, curedInputs);

  return {
    ...base,
    postCure: { value: cured.value, trace: cured.trace, runId: cured.resultHash },
    status: passes(cured, ctx) ? 'breachCured' : 'breachNotCured',
    cureOutcome: {
      applied: true,
      cureIds: eligible.map(c => c.cureId),
      amount: sum(eligible),
      remaining: { inWindow: rights.limits.window.count - usedInWindow - eligible.length,
                   overLife: rights.limits.maxOverLife - usedOverLife - eligible.length }
    }
  };
}
```

The engine also computes, before any cure is made, the **minimum cure amount** by solving the covenant test for the injected amount (a one-dimensional monotone root-find, or closed form for a simple ratio). For FAC-1042 Q4-2025: leverage 4.60x against a 4.50x limit, Total Net Debt £142,296,400, so required EBITDA = 142,296,400 / 4.50 = £31,621,422.22, against actual £30,934,000 → minimum cure **£687,422.22**, which the UI presents rounded up to a sensible £700,000 and shows the resulting 4.4982x → **4.50x after the 2dp comparison rounding — a pass, but with literally zero headroom**. Surfacing that razor-thin margin is exactly the kind of thing a spreadsheet hides.

The covenant result record:

```ts
export type ComplianceStatus =
  | 'pass' | 'breach' | 'breachCured' | 'breachNotCured'
  | 'notTested' | 'pendingData' | 'pendingApproval' | 'disputed';

export interface CovenantResult {
  runId: string; covenantId: string; testDate: ISODate;
  threshold: { value: DecStr; stepId: string; scheduleVersionId: string };
  computed: { value: DecStr; roundedForComparison: DecStr; trace: TraceNode };
  status: ComplianceStatus;
  headroom: { ratioDelta: DecStr; ebitdaDeclineTolerancePct: DecStr; debtIncreaseTolerance: DecStr };
  postCure?: { value: DecStr; trace: TraceNode; runId: string };
  cureOutcome?: CureOutcome;
  variance?: VarianceFinding;
  provisional: boolean;                 // any unapproved input anywhere in the trace
  missing: MissingCause[];
}
```

---

## 9. Currency and FX

```ts
export type FxRateBasis =
  | 'testDateSpot'
  | 'averageForPeriod'
  | 'periodEndClose'
  | 'ratesUsedInOriginalFinancialStatements'   // "frozen GAAP" style
  | 'fixedAtClosing'
  | 'agreedFixed';

export interface FxPolicy {
  plRate: FxRateBasis;                // flows
  balanceSheetRate: FxRateBasis;      // stocks
  source: 'ecbReferenceRate' | 'boeDailySpot' | 'borrowerAccounts' | 'agreedFixed';
  fixedRates?: Record<string, DecStr>;   // "EUR/GBP": "0.8412"
  cite?: ClauseCitation[];
}

export interface FxSnapshot {
  snapshotId: string;
  asOf: ISODateTime;
  rates: Array<{ pair: string; basis: FxRateBasis; periodId?: string; date?: ISODate;
                 rate: DecStr; source: string; retrievedAt: ISODateTime }>;
  hash: string;
}
```

Rules the engine enforces:

- A `sum` whose terms resolve to different currencies **errors** unless `resultCcy` is declared. This is deliberate friction: a silent conversion is the bug we are selling protection against.
- Once `resultCcy` is declared, conversion uses `fxPolicy.plRate` for `flow` concepts and `fxPolicy.balanceSheetRate` for `stock` concepts, chosen per leaf, not per node. A leverage ratio therefore correctly uses average rates for the EBITDA leg and closing rates for the debt leg without the author writing anything.
- Every conversion emits `fxApplied` with pair, rate, basis, and source. The trace shows `€14,500,000 × 0.8412 = £12,197,400`.
- `ratesUsedInOriginalFinancialStatements` and `fixedAtClosing` read from `fxPolicy.fixedRates` or from a facility-level frozen snapshot; the engine never silently substitutes a live rate. If the pinned rate is absent, the result is `missing`, not a guess.
- Multi-currency revolving facilities: each drawing is a fact with its own `ccy`; `def_total_net_debt` sums them with `resultCcy: 'GBP'`.
- `money/money → scalar` requires identical currencies **after** any declared conversion, so ratios are dimensionally safe by construction.

---

## 10. Versioning, amendments, and exact reproducibility

### 10.1 Bitemporality

Two independent time axes, both required for institutional credibility:

- **Effective time** — from which *test date* does this wording apply (contract reality).
- **Recorded time** — when did QuarterMark learn of it (knowledge reality).

```ts
export interface DefinitionVersion {
  versionId: string;                   // ULID
  definitionId: DefinitionId;
  facilityId: string;
  contentHash: string;                 // sha256 of canonical(ast + params + fxPolicy)
  ast: Expr;
  /** Contract time. */
  effectiveFrom: ISODate;              // first test date governed by this wording
  effectiveTo?: ISODate;               // null = current
  /** Knowledge time. */
  recordedAt: ISODateTime;
  recordedBy: UserId;
  supersedesVersionId?: string;
  sourceDocumentId: string;            // original agreement or amendment deed
  sourceAmendmentId?: string;
  changeSummary?: string;              // human-written, appears in the audit log
  /** Machine diff against the predecessor, computed at publication. */
  astDiff?: AstDiff;
  approval: {
    state: 'draft' | 'inReview' | 'approved' | 'published' | 'retired';
    preparedBy: UserId; preparedAt: ISODateTime;
    approvedBy?: UserId; approvedAt?: ISODateTime;   // must differ from preparedBy
  };
}

export interface AstDiff {
  added: Array<{ path: string; node: unknown }>;
  removed: Array<{ path: string; node: unknown }>;
  changed: Array<{ path: string; before: unknown; after: unknown; humanSummary: string }>;
  /** e.g. "Leverage cap in add-back (d) raised from 20% to 25% of EBITDA". */
  narrative: string[];
}
```

### 10.2 Canonicalisation and hashing

```ts
/** Deterministic JSON: keys sorted, no whitespace, decimals in canonical string form,
 *  undefined dropped, arrays order-preserved (order is semantic for adjustments). */
export function canonicalise(v: unknown): string;
export function contentHash(v: unknown): string;   // "sha256:" + hex
```

`contentHash` gives free de-duplication (identical definitions across facilities share a hash, which also powers a "definitions like this one" precedent library across the fund's portfolio — a genuinely useful secondary feature) and gives tamper evidence.

### 10.3 The calculation run — the reproducibility contract

```ts
export interface CalculationRun {
  runId: string;                        // ULID, sortable by time
  facilityId: string; covenantId: string; testDate: ISODate;
  runType: 'scheduled' | 'adHoc' | 'restatement' | 'reproduction' | 'scenario';
  /** EVERY input pinned by id + hash. This is the whole reproducibility story. */
  pins: {
    definitionVersions: Record<DefinitionId, string>;
    scheduleVersions: Record<string, string>;
    cureRightsVersionId?: string;
    factSnapshotId: string; factSnapshotHash: string;
    attestationSnapshotId: string;
    fxSnapshotId: string; fxSnapshotHash: string;
    ledgerAsOf: ISODateTime;
    calendarVersionId: string;
    conceptRegistryVersionId: string;
    mappingSnapshotId: string;
  };
  engineVersion: string;                // "cek-engine@1.4.0" — exact npm version
  traceSchemaVersion: number;
  result: CovenantResult;
  resultHash: string;                   // sha256 of canonical(trace)
  computedAt: ISODateTime; computedBy: UserId | 'system';
  supersedesRunId?: string;
  supersededByRunId?: string;
  /** Set when a reproduction run was executed and compared. */
  reproduction?: { at: ISODateTime; by: UserId; matched: boolean; diff?: TraceDiff };
}
```

**Reproduction procedure.** The "Reproduce this calculation" button:

1. Loads the run's `pins`.
2. Dynamically imports the engine at `run.engineVersion` from the vendored `packages/cek-engine-v*` directory (engines are pure, dependency-free, and a few thousand lines; keeping every version forever costs nothing and is the only honest way to promise bit-exact reproduction).
3. Re-evaluates.
4. Asserts `resultHash` matches. Mismatch is a **P1 incident**, surfaced in the UI and written to the audit log, not silently swallowed.

A nightly job reproduces a random 5% sample of published runs. If the engine ever drifts, we learn from our own monitoring rather than from an investor's auditor.

**Amendments.** An amendment deed is ingested like any document, extracted into an `Amendment` record, and produces new `DefinitionVersion` / `ThresholdSchedule` versions with `effectiveFrom` set to the first affected test date. Historical runs are **never mutated**. A retroactive amendment (effective from a past test date) triggers `runType: 'restatement'` runs for affected test dates, each linked to the superseded run via `supersedesRunId`; the UI shows both, labelled "as originally reported" and "as restated", with the amendment cited as the cause. Regulatory and investor reports pin the `runId` they were built from, so a report issued in January still reproduces even after a March restatement.

### 10.4 Postgres schema sketch

```sql
-- All in eu-west-2 (London) or eu-central-1. Row-level security by fund_id on every table.
create table definition_version (
  version_id        text primary key,
  definition_id     text not null,
  facility_id       text not null references facility(facility_id),
  content_hash      text not null,
  ast               jsonb not null,
  fx_policy         jsonb not null,
  effective_from    date not null,
  effective_to      date,
  recorded_at       timestamptz not null default now(),
  recorded_by       text not null,
  supersedes        text references definition_version(version_id),
  source_document_id text not null,
  source_amendment_id text,
  approval          jsonb not null,
  ast_diff          jsonb,
  constraint no_overlap exclude using gist (
    definition_id with =,
    daterange(effective_from, effective_to, '[)') with &&
  )
);
create index on definition_version (facility_id, definition_id, effective_from desc);
create index on definition_version using gin (ast jsonb_path_ops);

create table calculation_run (
  run_id text primary key,
  facility_id text not null, covenant_id text not null, test_date date not null,
  run_type text not null,
  pins jsonb not null,
  engine_version text not null,
  trace jsonb not null,              -- compressed by TOAST; typical trace 40-300 KB
  result jsonb not null,
  result_hash text not null,
  computed_at timestamptz not null default now(),
  supersedes_run_id text references calculation_run(run_id)
);
create unique index on calculation_run (covenant_id, test_date)
  where run_type in ('scheduled','restatement') and supersededdby_run_id is null;

-- Append-only audit. No UPDATE, no DELETE grants for the application role.
create table audit_event (
  event_id bigserial primary key,
  fund_id text not null, actor text not null, at timestamptz not null default now(),
  action text not null,              -- 'definition.published', 'fact.approved', 'cure.accepted'
  subject_type text not null, subject_id text not null,
  before jsonb, after jsonb,
  prev_hash text, hash text not null -- hash chain: sha256(prev_hash || canonical(row))
);
```

The `EXCLUDE USING gist` constraint on overlapping effective ranges is worth highlighting: it makes "two versions of the same definition claim the same test date" structurally impossible at the database level rather than a validation we hope runs.

The audit hash chain is cheap and makes tampering detectable, which pre-empts the diligence question institutional buyers always ask.

---

## 11. AI extraction, and what the analyst actually sees

### 11.1 Pipeline

**Stage 0 — ingest.** PDF → layout-aware parse producing text with page, bbox, and reading order; tables detected as structured cells. This is a replaceable adapter; candidates are Azure Document Intelligence, AWS Textract, or Reducto. I have not benchmarked these on 200-page English credit agreements and would not claim one is best without doing so; the adapter interface exists precisely so the choice can change.

**Stage 1 — clause segmentation.** Deterministic first (numbered-clause regex, "Schedule N" headers, defined-term index), LLM second for the residue. Output: `ClauseSpan[]` with type in `{definition, financialCovenant, thresholdSchedule, cureRight, testingDates, reportingUndertaking, other}`.

**Stage 2 — defined-term graph.** Extract every capitalised defined term and its definition span; build the dependency DAG (`Leverage` → `Total Net Debt`, `EBITDA` → `Permitted Acquisition`). Topologically sort. Extract leaves first so that when the model encodes `EBITDA` it already has the encoded `Permitted Acquisition` in context.

**Stage 3 — constrained synthesis.** One Claude call per definition, structured output bound to the AST JSON Schema (generated from the TypeScript types via `ts-json-schema-generator`, so the schema can never drift from the interpreter). Temperature 0. The prompt carries: the clause text with bboxes, already-encoded dependency definitions, the concept registry as an enum the model must choose from, and a curated few-shot library of ~30 encoded clauses covering the common patterns (simple add-back, capped add-back, grower basket, group cap, gated add-back, deduction, pro-forma reference).

Two design choices that matter more than prompt wording:
- **The model chooses concepts from a closed enum.** It cannot invent `qm.pl.ebitdaish`. Unmappable line items must be emitted as `attestedInput`, which routes to a human. Forcing "I don't know" into a typed, actionable shape is worth more than squeezing out extra accuracy.
- **Self-consistency as the confidence signal.** Sample n=3 at temperature 0.3, canonicalise each AST (strip ids and labels, sort commutative operands), and compare hashes. 3/3 agreement → `confidence: 'high'`; 2/3 → `'medium'` with the disagreeing region highlighted; 3 distinct → `'low'` and the clause is queued for mandatory human encoding. This gives a *calibrated* signal grounded in model behaviour rather than a self-reported probability, which language models are known to be poorly calibrated on.

**Stage 4 — deterministic validation.** Non-negotiable gates, all pure code:
- dimensional typecheck of the whole tree;
- every `factRef.concept` exists in the registry and is mapped for this facility;
- `stock` concepts never inside `periodAggregate{op:'sum'}`;
- every `defRef` resolves; no cycles;
- schedule totality and monotonicity;
- every self-referential cap declares `circularity` **and** carries an `Interpretation`;
- every `attestedInput` has an owner and a due date;
- every node with `confidence !== 'high'` is unapproved.

Validation failures are not "warnings the analyst can dismiss". They block publication.

**Stage 5 — back-translation.** `cek-print` renders the AST into English deterministically (no LLM — it must be a faithful function of the AST, not a paraphrase of the source):

> **Consolidated EBITDA** means, for the twelve months ending on the test date, the sum of consolidated operating profit before taxation, **plus** (a) depreciation and amortisation, **plus** (b) exceptional or non-recurring items, limited to £500,000 in aggregate across all items in this paragraph per twelve-month Relevant Period, **plus** (c) transaction costs relating to Permitted Acquisitions (attested by the borrower), **plus** (d) run-rate cost savings from Permitted Acquisitions, but only if an authorised person confirms they are realisable within twelve months, and limited to 20% of Consolidated EBITDA measured before this add-back, **less** (e) any gain on disposal of assets.

The analyst reads this beside the contract text. Reviewing a paraphrase is a task an analyst can do in ninety seconds and do correctly; reviewing JSON is a task they will do badly.

**Stage 6 — back-test against history.** The strongest validation available: run the newly-encoded definition against the borrower's own historical compliance certificates. If our recomputation reproduces the borrower's stated EBITDA and ratio for three past quarters to 2dp, the encoding is almost certainly right. If it does not, either the encoding is wrong or the borrower has been mis-reporting — and both are findings worth surfacing on day one of onboarding. This turns diligence backfile into a free test suite, and it is the single feature most likely to close a sceptical credit-committee buyer.

### 11.2 The review UI

Three panes.

**Left — Source.** The PDF at the cited page, the clause highlighted, the specific `bbox` for the focused adjustment outlined in accent colour. Scrolling the middle pane moves this pane. Clicking any number anywhere in the product — including inside a published trace six quarters later — lands here.

**Middle — Definition editor.** Not a code editor. A header block (term, dimension, period basis, FX policy) above a table of adjustments, one row each:

| | Key | Label | Sign | Source | Cap | Condition | Conf | Cite |
|---|---|---|---|---|---|---|---|---|
| ⠿ | a | Depreciation and amortisation | `+` | `qm.pl.depreciation` + `qm.pl.amortisation` | — | — | 🟢 | p23 |
| ⠿ | b | Exceptional / non-recurring items | `+` | `qm.pl.exceptionalItems` | `£500,000 / yr, group "exceptional"` | — | 🟢 | p23 |
| ⠿ | c | Transaction costs — Permitted Acquisitions | `+` | ⚑ Attested (borrower cert) | — | — | 🟡 | p23 |
| ⠿ | d | Run-rate cost savings | `+` | ⚑ Attested (borrower cert) | `20% of EBITDA (pre)` ⚠ | Realisable ≤12m | 🔴 | p23 |
| ⠿ | e | Gain on disposal of assets | `−` | `qm.pl.gainOnDisposalOfAssets` | — | — | 🟢 | p24 |

Rows are drag-reorderable (order is semantic for `beforeThisAdjustment` caps, and the UI warns when reordering changes a computed value). Every cell is a typed control, never free text: sign is a toggle, source is a searchable concept picker with the extracted source label shown as a hint, the cap chip opens a popover with limit expression, basis, scope group, and — when self-referential — a **mandatory radio group** rendering the three circularity readings with the clause quoted above them and **the live £ and turns impact of each choice computed on the spot**. The analyst is not asked an abstract legal question; they are asked "this choice is worth 0.31x of headroom, which reading is right?".

An "Advanced" affordance exposes the raw AST for the ~5% of clauses the table cannot express (nested conditionals, unusual basket mechanics), with schema-aware autocomplete and live validation.

**Right — Live proof.** The definition evaluated against a chosen historical quarter, showing:
- the computed value and, beside it, the borrower's reported figure with the delta;
- the collapsible trace, each row expanding to formula → substituted numbers → provenance chips;
- amber chips for every assumption (`assumedZero`, `provisionalInput`, `derivedInput`);
- a red chip on every binding cap with its £ impact;
- the back-test strip: ✓ Q1-25 ✓ Q2-25 ✗ Q3-25, where clicking ✗ opens the attribution;
- a "Materiality of open interpretations" tile summing the counterfactual swings.

**Publication.** `Propose` → dual-control `Approve` (approver ≠ preparer, enforced in the database) → `Publish`, which mints an immutable `DefinitionVersion`, computes the `AstDiff` against its predecessor, renders the narrative ("Add-back (d) cap basis changed from 20% to 25% of EBITDA, effective from the test date falling on 30 June 2026"), and enqueues recalculation of affected test dates as `restatement` runs.

---

## 12. What this buys architecturally

The same kernel, unchanged, expresses: valuation multiples and DCFs with provenanced comparables; management fee and carried-interest hurdle calculations with the same trace and the same audit chain; margin ratchets in loan servicing (a leverage-grid `scheduleRef` over the covenant measure already computed); and borrowing-base tests in ABL. The provenance and trace machinery — the expensive part — is written once. For a solo founder that is the difference between shipping five modules and shipping one.

The maintenance profile is deliberately boring: the interpreter is a few thousand lines of pure, dependency-light TypeScript with exhaustive switch statements the compiler checks; the test suite is golden traces (canonical JSON snapshots) plus property tests (dimensional soundness; cap monotonicity — raising a cap never decreases the aggregate; period-aggregation associativity) plus differential tests replaying every historical run under the current engine to detect unintended semantic change. Adding a node type is a compile error in every switch until handled, which is the property you want when the codebase outlives your memory of it.


### Key decisions
- Definitions are stored as a dimension-typed JSON AST, not formula strings or code — so they can be validated, diffed, versioned, hashed, generated by an LLM against a JSON Schema, and edited in a table UI rather than a code editor.
- All numbers are decimal strings in JSON and decimal128 at runtime; no IEEE floats anywhere in the calculation path, and no implicit rounding except at an explicit roundTo node or the covenant's declared comparison policy.
- Dimensions (money-with-currency vs scalar vs boolean) are part of the type system: money/money yields a scalar multiple, cross-currency addition is a compile-time error unless the node declares resultCcy, and stock concepts cannot be summed across quarters. These rules eliminate the most common spreadsheet covenant errors structurally.
- A first-class `adjustedAggregate` node with lettered, ordered adjustments mirrors how credit agreements are actually drafted — making the LLM generation target structured, the analyst UI a table, the trace readable, and amendment diffs meaningful.
- Self-referential caps ("20% of EBITDA") must declare their circularity basis explicitly and carry a recorded human Interpretation; the engine refuses to evaluate otherwise, and computes the £ materiality of each alternative reading so the analyst decides with numbers in front of them.
- Caps are ledgers, not Math.min: per-period, per-financial-year, group-shared ("in aggregate"), and life-of-loan depleting baskets are all modelled, with a capBinding trace flag quantifying exactly how much was disallowed.
- Missing inputs accumulate rather than short-circuit, and each carries a remediation string that becomes an actionable task; absence-as-zero is permitted but always flagged as an assumption in the audit trail.
- Equity cures live outside the definition as an append-only ledger applied at test time, producing paired pre-cure and post-cure results so a cured breach is still recorded as a breach that occurred.
- Reproducibility is a property of pure code plus pinned inputs: every calculation run pins definition versions, fact/FX/ledger snapshots and the exact engine version; old engine versions are vendored forever and a nightly job reproduces a 5% sample and alerts on hash mismatch.
- Bitemporal versioning (effective time vs recorded time) with a Postgres GiST exclusion constraint making overlapping effective ranges structurally impossible; historical runs are never mutated, retroactive amendments create linked restatement runs.
- Self-consistency sampling (n=3, canonicalised AST hash comparison) is the extraction confidence signal, in preference to model-reported probabilities, which are poorly calibrated.
- Deterministic AST-to-English back-translation shown beside the contract text is the primary human review surface — analysts review prose accurately and JSON badly.
- Back-testing a newly-encoded definition against the borrower's own historical compliance certificates is the strongest available correctness evidence, and doubles as an onboarding feature that finds mis-reporting on day one.
- The kernel is deliberately covenant-agnostic so Valuation, Fund Accounting and Loan Servicing reuse the same provenance and trace machinery — the only tractable path for a solo founder to ship five modules.

### Trade-offs
- The `adjustedAggregate` node is redundant with generic sum/min nodes and adds interpreter complexity, but generic trees are unreadable in a trace, undiffable across amendments, and a much worse LLM generation target. Accepting the redundancy for reviewability is the right trade for this product.
- Requiring explicit `resultCcy` for cross-currency addition creates authoring friction on every multi-currency facility. That friction is the product: a silent 1.00 FX conversion is precisely the failure mode being sold against.
- Storing full traces as JSONB (40-300 KB each) costs storage that grows as loans x quarters x reruns. At 80 loans x 4 covenants x 40 quarters this is single-digit GB — trivially affordable, and cheaper than any scheme for regenerating traces on demand, which would break the reproducibility guarantee.
- Vendoring every engine version forever means dead code in the repo. The alternative — semantic versioning with a compatibility promise — is a promise that cannot honestly be kept once a genuine bug fix changes a historical answer.
- Materialising periods as database rows rather than computing them costs a migration whenever a fiscal calendar is corrected, but 4-4-5 and 53-week calendars make on-the-fly date arithmetic subtly wrong in ways nobody notices until a covenant test lands on the wrong date.
- Forcing an explicit Interpretation on every ambiguous cap slows onboarding of each new facility, and analysts will resist it. Mitigated by computing the materiality of each choice so the question is concrete, and by allowing low-materiality ambiguities to be batch-accepted with a recorded default.
- Concept-registry-as-closed-enum constrains extraction: genuinely novel line items must be encoded as attestedInput and routed to a human, so coverage is lower than free-form extraction would give. But an unmappable item surfaced as a task is strictly better than a hallucinated concept that silently computes a wrong ratio.
- Dual-control approval (preparer != approver) is a real obstacle for a fund with two people in the credit team, and will need a documented single-user override with a stronger audit record — but shipping without it makes the product unsellable to any institutional buyer's operational-due-diligence process.
- Fixed-point iteration for `circularity: 'final'` caps is more machinery than the linear closed-form solution strictly requires, but generalises to interacting caps where no closed form exists, and produces an auditable iteration record.
- Modelling cures outside the AST means the covenant test logic is not purely a function of the expression tree, splitting the evaluation story across two components. The alternative — cures as AST nodes — would make the pre-cure result unrepresentable, which is legally unacceptable.

### Failure modes
- Clauses that are genuinely not expressible in the DSL: 'materially adverse', 'in the reasonable opinion of the Agent', 'consistent with past practice'. The escape hatch is attestedInput plus a human, but if a facility's covenants are qualitative-heavy the automation value collapses and the product degrades to a workflow tool.
- Definitions that reference other agreements (intercreditor, hedging schedules) or incorporate terms by reference to documents QuarterMark has not ingested. defRef cannot resolve outside the facility's document set, and the failure is a hard missing rather than a wrong answer — correct, but it blocks the calculation entirely.
- Frozen-GAAP clauses ('calculated on a basis consistent with the Original Financial Statements') mean that a borrower's change in accounting policy must be reversed out before the covenant is computed. Nothing in this design detects an undisclosed accounting-policy change; that requires comparative-analytics on the statements themselves and is a genuine gap.
- Concept-mapping drift: the borrower restructures its management accounts and 'Operating profit' becomes 'Trading profit' with a different perimeter. The extraction will map it by synonym and quietly compute a wrong LTM. Mitigation is period-over-period anomaly detection on every mapped concept, which is not part of this design.
- Attribution in the variance finding assumes the borrower's certificate breaks out components. Many certificates state only the final ratio. Then the platform can say 'we get 4.60x, you say 4.29x' but not why, which is far less persuasive in a conversation with a sponsor.
- Fixed-point divergence with multiple interacting `final`-basis caps (e.g. a synergy cap and an exceptional cap both measured on fully-adjusted EBITDA with an aggregate overlay). The engine errors rather than guessing, but the analyst is left with a clause the product cannot compute.
- Pro-forma evaluation re-runs the borrower's bespoke EBITDA definition against target-entity facts. If the target reports under a different GAAP or a different chart of accounts, the concept mapping for that entity may not exist and the pro-forma contribution silently becomes zero unless whenAbsent is set to 'missing' — an easy misconfiguration with a material effect.
- Trace size explosion on definitions with deep period aggregation across many entities (a group with 30 obligors x 4 quarters x 40 concepts). Nothing here bounds trace growth; it will need lazy sub-tree materialisation, which complicates the hash-based reproducibility guarantee.
- Bitemporal correctness is easy to state and hard to keep: a single query that filters on effective time but forgets recorded time will produce a subtly wrong historical view. This needs to be enforced by a repository layer that makes the unqualified query impossible to write, not by developer discipline.
- The equity-cure mechanics defaults (whether cure proceeds count as cash for Net Debt, whether a cure benefits four test dates) are drafting-specific and I have flagged them as configurable rather than asserted market practice. If defaults are set once and reused across facilities without reading each clause, the platform will confidently produce wrong cure outcomes — the exact error class it exists to prevent.
- Back-testing against historical compliance certificates validates the encoding only against the borrower's own interpretation. If the borrower has been consistently applying a wrong reading, a matching back-test is confirming the error, not the encoding. The back-test is strong evidence, not proof, and the UI must not present it as certification.


---

## Cell-Graph Covenant Kernel: a versioned, provenance-carrying DAG of named cells over a (cell × period) instance lattice

### Summary
Every covenant is compiled from its credit agreement into an immutable, versioned graph of named cells — sources bound to extracted financial line items, parameters bound to schedule rows, and formulas expressed as a small serialisable AST. The true DAG is not over cells but over *cell instances* `(cellId, periodKey)`, which is what makes LTM aggregation, lagged references and equity-cure carry-forward well-founded rather than circular. Caps, carve-outs and classifications are first-class node kinds rather than hidden inside arithmetic, so that every disallowed pound has its own auditable cell (`exceptionals.disallowed = £280,000`) and every excluded balance has a visible zeroed cell (IFRS 16 leases under frozen GAAP) instead of silently not existing. Values are decimal strings with an attached `Unit`, and the unit checker refuses to add GBP to EUR without an explicit `fx` node whose basis (`period_average` / `closing_spot` / `agreed_rate`) is itself a cited term of the agreement. Nulls never become zero: a missing or low-confidence input propagates a `nullReason` and the test resolves `INDETERMINATE`, never `PASS`. Reproducibility comes from freezing, per `calc_run`, a copy (not a reference) of every input value plus `covenant_version_id` and a pinned pure `engine_version`, hashed into a `input_fingerprint`; replaying an old quarter three years later is a pure function call against an archived kernel. Amendments produce a new `covenant_version` with a reviewed cell-level *diff*, guarded by a Postgres exclusion constraint so two versions can never govern the same test date. AI extraction proposes the graph as constrained JSON AST — never code — which is then unit-checked, cycle-checked, rendered back to English, and accepted cell-by-cell by a human before the version can leave `draft`. The honest limits are that the spreadsheet metaphor breaks on qualitative judgements ("is this item exceptional?"), on set-valued caps where admission order matters, on genuinely circular drafting like the 20%-of-EBITDA synergy cap, and on restatements — and that a confidently wrong definition graph produces a confidently wrong contradiction of the borrower, which is the single most dangerous product failure.

### Design
# QuarterMark — Covenant Definition & Recalculation Engine

Target repo is empty (`C:\Users\Jai Varia\Documents\Quatermark` has no tracked files), so this is a greenfield design. Package layout assumed:

```
packages/
  calc-kernel/        # pure, no I/O, no Date.now(), versioned semver — the thing that must be replayable in 2033
    src/ast.ts  src/units.ts  src/decimal.ts  src/eval.ts  src/validate.ts  src/render.ts
    kernels/1.0.0/ 1.1.0/ 2.0.0/   # archived published semantics
  covenant-model/     # Cell kinds, covenant-specific helpers, schedule resolution
  extraction/         # PDF → facts, agreement → proposed graph
  db/                 # SQL, repositories, RLS policies
apps/web/             # Next.js 15 App Router
```

The kernel is deliberately generic: a covenant is one `GraphKind`. Valuation (DCF / comparable-multiple marks), fund-accounting waterfalls, and underwriting base cases are the same primitive — a DAG of named, provenance-carrying cells over a period lattice. Nothing covenant-specific goes in `calc-kernel`.

---

## 1. The cell / node model

### 1.1 Primitives

```ts
// packages/calc-kernel/src/units.ts
export type Iso = string;                 // 'YYYY-MM-DD', no time, no timezone. Ever.
export type CurrencyCode = 'GBP'|'EUR'|'USD'|'SEK'|'NOK'|'DKK'|'CHF'|'PLN';
export type Dec = string;                 // canonical decimal, e.g. '-12700000.00'. NEVER `number`.

export type Unit =
  | { kind: 'money';   currency: CurrencyCode }
  | { kind: 'ratio' }                     // dimensionless; presented '3.60x'
  | { kind: 'percent' }                   // stored 0.20, presented '20.0%'
  | { kind: 'count' }
  | { kind: 'days' }
  | { kind: 'bool' };

export type NullReason =
  | 'not_yet_extracted' | 'not_applicable' | 'covenant_holiday'
  | 'divide_by_zero'    | 'upstream_null'  | 'blocked_pending_review'
  | 'insufficient_history' | 'fx_rate_missing' | 'non_convergent';

export type Quantity =
  | { unit: Unit; value: Dec;  isNull?: false }
  | { unit: Unit; value: null; isNull: true; nullReason: NullReason };
```

**Hard invariant #1 — no silent zeros.** `null` is a value, not an absence. `add(null, 5)` → `null` with `upstream_null`. A test whose LHS or RHS is null yields `INDETERMINATE`. This is the difference between a monitoring tool and a liability.

**Hard invariant #2 — decimal only.** All arithmetic via `decimal.js` at 28 significant digits, with an explicit `RoundingPolicy` applied only where the agreement says to round (usually the final ratio, "rounded to two decimal places"). Intermediate rounding is a bug and the validator warns on it.

### 1.2 Periods

```ts
export type PeriodKind = 'Q'|'H'|'FY'|'PIT'|'LTM'|'FYTD'|'STATIC';
export type PeriodKey = string;  // 'Q:2025-06-30' | 'PIT:2025-06-30' | 'LTM:2025-06-30' | 'STATIC'

export type PeriodRef =
  | { rel: 'current' }
  | { rel: 'lag'; n: number }            // n quarters back, n >= 1
  | { rel: 'closing' }                   // balance sheet at test date
  | { rel: 'fy_start' }
  | { rel: 'at'; period: PeriodKey };    // pinned (e.g. Original Financial Statements)
```

### 1.3 Cell base and kinds

```ts
export type CellId = string;   // stable slug, dot-namespaced: 'ebitda.exceptionals.allowed'

export interface ClauseRef {
  documentId: string; page: number;
  clauseNumber?: string;                  // '1.1 "Consolidated EBITDA" (d)'
  bbox?: [number, number, number, number];// PDF user-space, origin bottom-left
  snippet: string;                        // exact quoted text, max ~600 chars
}

export interface CellBase {
  id: CellId;
  label: string;                          // 'Synergy add-back (capped)'
  unit: Unit;
  periodicity: 'point_in_time'|'flow_quarter'|'flow_ltm'|'flow_annual'|'static';
  clauseRef?: ClauseRef;                  // REQUIRED for parameters and caps (validator enforces)
  note?: string;                          // analyst-facing plain English
  displayGroup?: string;                  // 'Add-backs' — drives UI ladder grouping
  visibility: 'primary'|'detail'|'internal';
  rounding?: { dp: number; mode: 'half_up'|'half_even'|'down'|'up' };
  ordinal: number;                        // stable display order
}

export type Cell =
  | SourceCell | ConstantCell | ScheduleCell | FormulaCell | AggregateCell
  | ItemSetCell | ClassifiedCell | FxCell | ReportedCell | TestCell
  | CureCell | FixedPointCell;
```

#### SourceCell — bound to an extracted line item

```ts
export interface SourceCell extends CellBase {
  kind: 'source';
  concept: string;                        // canonical: 'is.operating_profit_before_tax'
  binding: {
    statement: 'income_statement'|'balance_sheet'|'cash_flow'
             | 'compliance_certificate'|'covenant_schedule'|'other';
    captions: string[];                   // fuzzy-match candidates the extractor tries
    entityScope: 'group'|'obligor_group'|'restricted_group'|'borrower';
    polarityHint?: 'positive'|'negative';
  };
  sign: 'as_reported' | 'negate';         // accounts show 'Depreciation (1,050)' → negate
  required: boolean;                      // false ⇒ absence means 0, not null
  fallback?: { cellId: CellId } | { literal: Dec };
  minConfidence: number;                  // default 0.90; below ⇒ blocked_pending_review
}
```

#### ConstantCell / ScheduleCell — terms of the agreement

```ts
export interface ConstantCell extends CellBase {
  kind: 'constant';
  quantity: Quantity;                     // clauseRef mandatory
}

export interface ScheduleCell extends CellBase {
  kind: 'schedule';
  scheduleName: string;                   // resolved against parameter_schedule_row at testDate
  keyBy: 'test_date' | 'period_index' | 'financial_year';
  onNoMatch: 'error' | 'null' | 'use_last';
}
```

#### FormulaCell and the expression AST

```ts
export type Expr =
  | { op: 'ref';   cell: CellId; period?: PeriodRef }
  | { op: 'lit';   q: Quantity }
  | { op: 'add'|'sub'|'mul'|'div'; args: [Expr, Expr] }
  | { op: 'sum'|'min'|'max'; args: Expr[] }
  | { op: 'neg'|'abs'; args: [Expr] }
  | { op: 'cap';   value: Expr; cap: Expr }              // = min, but records `capBound`
  | { op: 'floor'; value: Expr; floor: Expr }
  | { op: 'clamp'; value: Expr; lo: Expr; hi: Expr }
  | { op: 'if';    cond: Cond; then: Expr; else: Expr }
  | { op: 'round'; value: Expr; dp: number; mode: 'half_up'|'half_even'|'down'|'up' }
  | { op: 'fx';    value: Expr; to: CurrencyCode; basis: FxBasis }
  | { op: 'coalesce'; args: Expr[] }
  | { op: 'pct';   of: Expr; rate: Expr };               // sugar: mul, unit-aware

export type Cond =
  | { c: 'gt'|'gte'|'lt'|'lte'|'eq'; args: [Expr, Expr] }
  | { c: 'and'|'or'; args: Cond[] }
  | { c: 'not'; arg: Cond }
  | { c: 'flag'; name: string }                          // 'permitted_acquisition_in_period'
  | { c: 'periodIndexGte'; n: number }
  | { c: 'lit'; v: boolean };

export interface FormulaCell extends CellBase {
  kind: 'formula';
  expr: Expr;
  /** If this cell is a `cap`, the engine auto-creates a sibling `<id>.disallowed`. */
  emitDisallowedSibling?: boolean;
}
```

**Why an AST and not `eval()` of a formula string.** (a) It is diffable — an amendment shows as a structural diff, not a text diff. (b) It is unit-checkable before it runs. (c) It renders back to English deterministically for the review flow and the audit pack. (d) It cannot execute arbitrary code inside a system that institutional buyers will security-review. The cost is that the authoring UI must build ASTs; mitigated by a formula bar that parses a restricted infix syntax (`MIN(a, b)`, `a + b`) into the AST and rejects anything it cannot represent.

#### AggregateCell — the period-axis operator

```ts
export interface AggregateCell extends CellBase {
  kind: 'aggregate';
  fn: 'ltm_sum'|'ltm_avg'|'closing'|'opening'|'max_over'|'min_over'|'fytd_sum'|'annualise';
  source: CellId;
  window: number;                          // quarters, e.g. 4
  partialWindowPolicy:
    | 'annualise'                          // n quarters × (4/n)
    | 'use_opening_statements'             // splice in pre-closing historicals
    | 'use_agreed_schedule'                // agreement fixes EBITDA for early periods
    | 'indeterminate';                     // default, safest
}
```

`partialWindowPolicy` is not decoration. In the first year after closing you usually do not have four quarters of the borrower's own management accounts under your reporting package. LMA-style agreements handle this explicitly ("for any Relevant Period ending on or before the first anniversary of the Closing Date, EBITDA shall be…"). Most tools quietly annualise; that is a real source of wrong answers.

#### ItemSetCell — where caps actually live

A scalar cap (`min(claimed, £500k)`) is a lie when the underlying is a *list*. "Exceptional or non-recurring items not exceeding £500,000 in aggregate per annum" operates on a schedule of individual items, each of which may or may not qualify, and when the cap binds you must decide *which items* are admitted.

```ts
export interface SetItem {
  itemId: string;
  description: string;                     // 'Restructuring — Leeds site closure'
  amount: Dec; currency: CurrencyCode;
  periodKey: PeriodKey;
  classification?: string;                 // 'exceptional' | 'ordinary' | 'unclear'
  classifiedBy?: 'ai'|'analyst'|'borrower';
  classificationConfidence?: number;
  provenance: Provenance;
  admitted: boolean; admittedAmount: Dec;  // computed by admissionRule
  admissionReason: 'qualified'|'failed_filter'|'cap_exhausted'|'analyst_excluded';
}

export interface ItemSetCell extends CellBase {
  kind: 'item_set';
  itemSource: { statement: 'compliance_certificate'|'covenant_schedule'|'notes_to_accounts';
                scheduleName: string };
  admissionRule: {
    filter: Cond;                          // evaluated per item over item attributes
    cap?: Expr;                            // aggregate cap across admitted items
    allocation: 'chronological'|'largest_first'|'pro_rata'|'analyst_ordered';
  };
  output: 'admitted_total';                // the scalar this cell exposes
}
```

`allocation` matters and agreements are almost always silent on it. Default `chronological` (first-in wins), record the choice as an `Interpretation` requiring analyst sign-off. *Uncertain:* I am not aware of standard LMA drafting that specifies admission order for a capped basket; treating it as an open interpretation is the honest position.

#### ClassifiedCell — the qualitative gate

```ts
export interface ClassifiedCell extends CellBase {
  kind: 'classified';
  underlying: CellId;                      // gross amount claimed
  question: string;                        // 'Does this relate to a Permitted Acquisition?'
  mode: 'proportion'|'boolean';
  aiProposal?: { value: Dec; rationale: string; confidence: number };
  decision?: { value: Dec; decidedBy: string; decidedAt: string; rationale: string };
  requiresDecision: true;                  // no decision ⇒ blocked_pending_review
}
```

This is the node kind that admits, in the data model, that some of the covenant is not arithmetic. Spreadsheets have no way to say "this number is contested".

#### FxCell, ReportedCell, TestCell, CureCell, FixedPointCell

```ts
export type FxBasis =
  | 'closing_spot' | 'period_average' | 'agreed_rate'
  | 'rate_at_utilisation' | 'original_financial_statements';

export interface FxCell extends CellBase {
  kind: 'fx';
  source: CellId; to: CurrencyCode; basis: FxBasis;
  provider: 'ecb'|'boe'|'agreed';          // rate itself is a provenance-carrying fact
}

/** The borrower's own stated figure — never an input to our calc, only to variance. */
export interface ReportedCell extends CellBase {
  kind: 'reported';
  concept: string;                         // 'cert.reported_leverage_ratio'
  mirrors: CellId;                         // 'leverage.ratio'
  varianceMaterialityBps?: number;         // default 100 bps for ratios
}

export interface TestCell extends CellBase {
  kind: 'test';
  lhs: CellId; comparator: 'lte'|'gte'|'lt'|'gt'; rhs: CellId;
  headroomModes: Array<'absolute'|'relative'|'ebitda_equivalent'|'debt_equivalent'>;
  appliesWhen?: Cond;                      // covenant holiday, springing RCF tests etc.
}

export interface CureCell extends CellBase {
  kind: 'cure';
  cureType: 'ebitda_cure'|'debt_prepayment_cure'|'liquidity_cure';
  maxPer4Quarters: number;                 // 2
  maxOverLife: number;                     // 5
  consecutiveCuresAllowed: boolean;
  deemedEffectQuarters: number;            // 4 — an EBITDA cure persists through the LTM window
  overcurePermitted: boolean;              // false ⇒ cure limited to minimum needed to remedy
}

/** Opt-in, for genuinely circular drafting only. Excluded from the acyclicity check. */
export interface FixedPointCell extends CellBase {
  kind: 'fixed_point';
  seed: Expr;
  body: Expr;                              // may { op:'ref', cell:<self> }
  maxIterations: number;                   // 25
  tolerance: Dec;                          // '0.01'
  onNonConvergence: 'indeterminate';       // never 'last_value'
}
```

### 1.4 The DAG is over cell *instances*, not cells

This is the central modelling decision.

`ebitda.ltm` depends on `ebitda.quarterly@lag1..lag3`. At the *cell* level that looks like it could form loops (equity cures reference prior cure counts, which reference prior tests, which reference EBITDA, which references cures). At the *instance* level `(cellId, periodKey)` it is strictly acyclic, because every backward reference has `lag ≥ 1` and periods are finite and bounded below by the closing date.

**Acyclicity rule (exact, and cheap):**

> Build the edge set over `CellId`. Retain only edges with `lag = 0`. Run Tarjan's SCC on that subgraph. Any SCC of size > 1, or any self-loop, is an illegal cycle — reject at authoring time with the full cycle path. Edges with `lag ≥ 1` are unconditionally legal. `FixedPointCell` bodies are excised before the check.

```ts
// packages/calc-kernel/src/validate.ts
export interface Edge { from: CellId; to: CellId; lag: number }

export function checkAcyclic(cells: Cell[], edges: Edge[]): ValidationError[] {
  const zeroLag = edges.filter(e => e.lag === 0);
  const sccs = tarjan(cells.map(c => c.id), zeroLag);
  return sccs
    .filter(s => s.length > 1 || zeroLag.some(e => e.from === s[0] && e.to === s[0]))
    .map(s => ({ code: 'CYCLE', cells: s, message: `Same-period cycle: ${s.join(' → ')} → ${s[0]}` }));
}
```

### 1.5 Evaluation — demand-driven with memoisation and a precise cycle trace

```ts
export interface EvalContext {
  facilityId: string; covenantVersionId: string;
  testDate: Iso; periodIndex: number;              // quarters since first test date
  calendar: PeriodCalendar;                        // resolves 'lag 3' → 'Q:2024-09-30'
  facts: (concept: string, period: PeriodKey) => FactRow | undefined;
  schedules: (name: string, testDate: Iso, periodIndex: number) => Quantity | undefined;
  fx: (pair: string, basis: FxBasis, period: PeriodKey) => FxRateRow | undefined;
  overrides: Map<InstanceKey, Override>;
  flags: Map<string, boolean>;
  cures: CureEvent[];
  engineVersion: string;                           // '1.3.0'
  precision: { sigDigits: 28 };
}
export type InstanceKey = `${CellId}@${PeriodKey}`;

export interface CellValue {
  cell: CellId; period: PeriodKey;
  q: Quantity;
  status: 'computed'|'overridden'|'blocked'|'not_applicable';
  provenance: Provenance;
  inputs: InstanceKey[];
  trace: TraceNote[];
}
export type TraceNote =
  | { t: 'cap_bound'; capValue: Dec; rawValue: Dec; disallowed: Dec }
  | { t: 'floor_bound'; floorValue: Dec; rawValue: Dec }
  | { t: 'fallback_used'; from: string }
  | { t: 'null_propagated'; from: InstanceKey; reason: NullReason }
  | { t: 'branch_taken'; cond: string; taken: 'then'|'else' }
  | { t: 'fx_applied'; pair: string; rate: Dec; basis: FxBasis; rateId: string }
  | { t: 'rounded'; from: Dec; to: Dec; dp: number }
  | { t: 'fixed_point'; iterations: number; residual: Dec }
  | { t: 'partial_window'; available: number; required: number; policy: string };

export function evaluate(graph: CovenantGraph, ctx: EvalContext, root: CellId): RunResult {
  const memo = new Map<InstanceKey, CellValue>();
  const visiting = new Set<InstanceKey>();
  const stack: InstanceKey[] = [];

  const get = (id: CellId, period: PeriodKey): CellValue => {
    const key: InstanceKey = `${id}@${period}`;
    const hit = memo.get(key);
    if (hit) return hit;
    if (visiting.has(key)) throw new CycleError([...stack, key]);   // exact path for the error UI
    visiting.add(key); stack.push(key);
    try {
      const ov = ctx.overrides.get(key);
      const computed = computeCell(graph.byId[id], period, get, ctx);
      const v: CellValue = ov
        ? { ...computed, q: ov.newQuantity, status: 'overridden',
            provenance: { kind: 'override', overrideId: ov.id, originalComputed: computed.q },
            trace: [...computed.trace] }
        : computed;
      memo.set(key, v);
      return v;
    } finally { visiting.delete(key); stack.pop(); }
  };

  const rootValue = get(root, ctx.calendar.keyFor(root, { rel: 'current' }));
  return { root: rootValue, values: [...memo.values()], engineVersion: ctx.engineVersion };
}
```

Note the override semantics: the engine **always computes the underlying value first** and keeps it in `provenance.originalComputed`. An override is an overlay, never a replacement. This is what lets you later ask "what would this covenant have said without analyst intervention?" — a question every IC and every auditor eventually asks.

`memo` keys must be salted by the override-set hash if you cache across requests; in practice caching is per-run only, and the run's `input_fingerprint` already covers it.

### 1.6 Static validation performed before a version can be approved

| Check | Failure |
|---|---|
| Acyclicity (lag-0 SCC) | `CYCLE` |
| All `ref` targets exist in this version | `UNBOUND_REF` |
| Unit soundness (`money + money` same currency; `money / money → ratio`; `ratio + money` illegal) | `UNIT_MISMATCH` |
| Every `constant` and `schedule` cell has a `clauseRef` | `MISSING_CITATION` |
| Every `cap` in the clause text has a corresponding `cap` node (from extraction coverage check) | `UNMODELLED_CAP` (warning) |
| No intermediate `round` unless clause-cited | `SPURIOUS_ROUNDING` (warning) |
| `test` cell reachable from at least one `source` cell | `DISCONNECTED_TEST` |
| Every `classified` / `item_set` cell has an accepted decision | `PENDING_JUDGEMENT` |
| Schedule covers the full facility life with no gaps/overlaps | `SCHEDULE_GAP` |

---

## 2. The bespoke EBITDA definition as a cell graph

Definition being modelled (from the product context):

> **EBITDA** means, for any Relevant Period, the consolidated operating profit of the Group before taxation… adjusted by adding back: (a) depreciation and amortisation; (b) exceptional or non-recurring items not exceeding £500,000 in aggregate per annum; (c) transaction costs relating to Permitted Acquisitions; (d) run-rate cost savings from any Permitted Acquisition, capped at 20% of EBITDA and only to the extent realisable within 12 months; and deducting: (e) any gain on disposal of assets.

### 2.1 The five modelling problems this clause poses

1. **(b) is a capped basket over a list** → `ItemSetCell`, not `min()`.
2. **(c) has a qualitative gate** ("relating to Permitted Acquisitions") → `ClassifiedCell`.
3. **(d) has a qualitative gate AND a self-referential cap** → `ClassifiedCell` + an explicit cap-base policy.
4. **"per annum" vs "Relevant Period"** — the cap is annual, the Relevant Period is 12 months rolling. Here they coincide. If the covenant tested on a 6-month Relevant Period they would not, and the cap would need pro-rating. Modelled as `exceptionals.cap` = `schedule` with a `capBasis` note.
5. **The 20% cap base is ambiguous.** *Marked uncertain:* I believe the more common market reading is 20% of EBITDA *before* giving effect to the synergy add-back, but drafting genuinely varies and some agreements say "after giving effect to such add-back", which is circular and requires iteration. QuarterMark models this as an explicit, cited, analyst-confirmed `Interpretation`.

### 2.2 The graph (real code)

```ts
// covenant: LEVERAGE, facility F-0031 'Northgate Care Group Ltd'
// Definitions module — reused by leverage, ICR and DSCR via cross-covenant refs.

const GBP: Unit = { kind: 'money', currency: 'GBP' };
const RATIO: Unit = { kind: 'ratio' };
const PCT: Unit = { kind: 'percent' };

export const EBITDA_CELLS: Cell[] = [

// ── (root) operating profit ───────────────────────────────────────────────
{ kind:'source', id:'ebitda.op_profit.q', label:'Operating profit before tax (quarter)',
  unit:GBP, periodicity:'flow_quarter', ordinal:10, visibility:'detail',
  displayGroup:'Starting point',
  concept:'is.operating_profit_before_tax', sign:'as_reported', required:true, minConfidence:0.90,
  binding:{ statement:'income_statement', entityScope:'group',
            captions:['Operating profit','Operating profit/(loss)','Operating profit before taxation','EBIT'] },
  clauseRef:{ documentId:'doc_ca_f0031', page:34, clauseNumber:'1.1 "Consolidated EBITDA"',
              snippet:'the consolidated operating profit of the Group before taxation' } },

{ kind:'aggregate', id:'ebitda.op_profit.ltm', label:'Operating profit (LTM)',
  unit:GBP, periodicity:'flow_ltm', ordinal:11, visibility:'primary', displayGroup:'Starting point',
  fn:'ltm_sum', source:'ebitda.op_profit.q', window:4, partialWindowPolicy:'use_opening_statements' },

// ── (a) depreciation & amortisation ───────────────────────────────────────
{ kind:'source', id:'ebitda.depreciation.q', label:'Depreciation (quarter)',
  unit:GBP, periodicity:'flow_quarter', ordinal:20, visibility:'internal',
  concept:'is.depreciation', sign:'negate', required:true, minConfidence:0.90,
  binding:{ statement:'income_statement', entityScope:'group',
            captions:['Depreciation','Depreciation of tangible fixed assets','Depreciation of PPE'],
            polarityHint:'negative' } },

{ kind:'source', id:'ebitda.amortisation.q', label:'Amortisation (quarter)',
  unit:GBP, periodicity:'flow_quarter', ordinal:21, visibility:'internal',
  concept:'is.amortisation', sign:'negate', required:true, minConfidence:0.90,
  binding:{ statement:'income_statement', entityScope:'group',
            captions:['Amortisation','Amortisation of intangibles','Amortisation of goodwill'],
            polarityHint:'negative' } },

{ kind:'formula', id:'ebitda.da.q', label:'D&A (quarter)', unit:GBP,
  periodicity:'flow_quarter', ordinal:22, visibility:'internal',
  expr:{ op:'add', args:[ {op:'ref',cell:'ebitda.depreciation.q'},
                          {op:'ref',cell:'ebitda.amortisation.q'} ] } },

{ kind:'aggregate', id:'ebitda.da.ltm', label:'Add back: depreciation & amortisation',
  unit:GBP, periodicity:'flow_ltm', ordinal:23, visibility:'primary', displayGroup:'Add-backs',
  fn:'ltm_sum', source:'ebitda.da.q', window:4, partialWindowPolicy:'use_opening_statements',
  clauseRef:{ documentId:'doc_ca_f0031', page:34, clauseNumber:'1.1 (a)',
              snippet:'(a) depreciation and amortisation' } },

// ── (b) exceptional items — capped basket over a LIST ─────────────────────
{ kind:'item_set', id:'ebitda.exceptionals.items', label:'Exceptional / non-recurring items',
  unit:GBP, periodicity:'flow_ltm', ordinal:30, visibility:'primary', displayGroup:'Add-backs',
  itemSource:{ statement:'compliance_certificate', scheduleName:'Schedule 2 — Exceptional Items' },
  admissionRule:{
    filter:{ c:'eq', args:[ {op:'ref',cell:'__item.classification'}, {op:'lit',q:{unit:{kind:'count'},value:'exceptional'} as any} ] },
    cap:{ op:'ref', cell:'ebitda.exceptionals.cap' },
    allocation:'chronological' },
  output:'admitted_total',
  clauseRef:{ documentId:'doc_ca_f0031', page:34, clauseNumber:'1.1 (b)',
              snippet:'(b) exceptional or non-recurring items not exceeding £500,000 in aggregate per annum' },
  note:'Cap is annual and the Relevant Period is 12 months, so no pro-rating is applied. Admission order is chronological — the agreement is silent; interpretation INT-004.' },

{ kind:'constant', id:'ebitda.exceptionals.cap', label:'Exceptional items cap (per annum)',
  unit:GBP, periodicity:'static', ordinal:31, visibility:'detail', displayGroup:'Add-backs',
  quantity:{ unit:GBP, value:'500000.00' },
  clauseRef:{ documentId:'doc_ca_f0031', page:34, clauseNumber:'1.1 (b)',
              snippet:'not exceeding £500,000 in aggregate per annum' } },

{ kind:'formula', id:'ebitda.exceptionals.allowed', label:'Add back: exceptional items (allowed)',
  unit:GBP, periodicity:'flow_ltm', ordinal:32, visibility:'primary', displayGroup:'Add-backs',
  emitDisallowedSibling:true,
  expr:{ op:'cap', value:{op:'ref',cell:'ebitda.exceptionals.items'},
                   cap:  {op:'ref',cell:'ebitda.exceptionals.cap'} } },
// engine auto-emits: ebitda.exceptionals.allowed.disallowed

// ── (c) transaction costs — qualitative gate ──────────────────────────────
{ kind:'source', id:'ebitda.txn_costs.claimed.ltm', label:'Transaction costs claimed (LTM)',
  unit:GBP, periodicity:'flow_ltm', ordinal:40, visibility:'detail', displayGroup:'Add-backs',
  concept:'cert.transaction_costs', sign:'as_reported', required:false, minConfidence:0.85,
  binding:{ statement:'compliance_certificate', entityScope:'group',
            captions:['Transaction costs','Acquisition-related costs','Deal costs'] } },

{ kind:'classified', id:'ebitda.txn_costs.allowed', label:'Add back: Permitted Acquisition costs',
  unit:GBP, periodicity:'flow_ltm', ordinal:41, visibility:'primary', displayGroup:'Add-backs',
  underlying:'ebitda.txn_costs.claimed.ltm', mode:'proportion', requiresDecision:true,
  question:'Which portion of claimed transaction costs relates to a Permitted Acquisition (cl. 1.1 "Permitted Acquisition", p.61)?',
  clauseRef:{ documentId:'doc_ca_f0031', page:34, clauseNumber:'1.1 (c)',
              snippet:'(c) transaction costs relating to Permitted Acquisitions' } },

// ── (e) gain on disposal — DEDUCTED ───────────────────────────────────────
{ kind:'source', id:'ebitda.gain_on_disposal.q', label:'Gain on disposal of assets (quarter)',
  unit:GBP, periodicity:'flow_quarter', ordinal:50, visibility:'internal',
  concept:'is.gain_on_disposal', sign:'as_reported', required:false, minConfidence:0.85,
  binding:{ statement:'income_statement', entityScope:'group',
            captions:['Profit on disposal of fixed assets','Gain on disposal','Profit on sale of assets'] } },

{ kind:'aggregate', id:'ebitda.gain_on_disposal.ltm', label:'Deduct: gain on disposal',
  unit:GBP, periodicity:'flow_ltm', ordinal:51, visibility:'primary', displayGroup:'Deductions',
  fn:'ltm_sum', source:'ebitda.gain_on_disposal.q', window:4, partialWindowPolicy:'indeterminate',
  clauseRef:{ documentId:'doc_ca_f0031', page:35, clauseNumber:'1.1 (e)',
              snippet:'and deducting: (e) any gain on disposal of assets' } },

// ── SUBTOTAL: EBITDA before synergy add-back ──────────────────────────────
{ kind:'formula', id:'ebitda.pre_synergy', label:'EBITDA before synergy add-back',
  unit:GBP, periodicity:'flow_ltm', ordinal:60, visibility:'primary', displayGroup:'Subtotal',
  note:'This subtotal exists solely because it is the cap base for add-back (d) under interpretation INT-007.',
  expr:{ op:'sub', args:[
    { op:'sum', args:[
      {op:'ref',cell:'ebitda.op_profit.ltm'},
      {op:'ref',cell:'ebitda.da.ltm'},
      {op:'ref',cell:'ebitda.exceptionals.allowed'},
      {op:'ref',cell:'ebitda.txn_costs.allowed'} ]},
    {op:'ref',cell:'ebitda.gain_on_disposal.ltm'} ]} },

// ── (d) synergies — qualitative gate + self-referential cap ───────────────
{ kind:'source', id:'ebitda.synergies.claimed', label:'Run-rate cost savings claimed',
  unit:GBP, periodicity:'flow_ltm', ordinal:70, visibility:'detail', displayGroup:'Add-backs',
  concept:'cert.synergies_claimed', sign:'as_reported', required:false, minConfidence:0.85,
  binding:{ statement:'covenant_schedule', entityScope:'group',
            captions:['Run-rate synergies','Cost savings','Synergy add-back','Run-rate cost savings'] } },

{ kind:'classified', id:'ebitda.synergies.realisable_12m', label:'Synergies realisable within 12 months',
  unit:GBP, periodicity:'flow_ltm', ordinal:71, visibility:'primary', displayGroup:'Add-backs',
  underlying:'ebitda.synergies.claimed', mode:'proportion', requiresDecision:true,
  question:'Which portion is (i) attributable to a Permitted Acquisition and (ii) realisable within 12 months, per the synergy plan?',
  clauseRef:{ documentId:'doc_ca_f0031', page:35, clauseNumber:'1.1 (d)',
              snippet:'only to the extent realisable within 12 months' } },

{ kind:'constant', id:'ebitda.synergies.cap_rate', label:'Synergy cap rate',
  unit:PCT, periodicity:'static', ordinal:72, visibility:'detail', displayGroup:'Add-backs',
  quantity:{ unit:PCT, value:'0.20' },
  clauseRef:{ documentId:'doc_ca_f0031', page:35, clauseNumber:'1.1 (d)',
              snippet:'capped at 20% of EBITDA' } },

{ kind:'formula', id:'ebitda.synergies.cap_base', label:'Synergy cap base',
  unit:GBP, periodicity:'flow_ltm', ordinal:73, visibility:'detail', displayGroup:'Add-backs',
  note:'INTERPRETATION INT-007: "20% of EBITDA" read as 20% of EBITDA BEFORE giving effect to this add-back. '
     + 'The agreement does not say. Alternative reading (after giving effect) is circular and is available as '
     + 'a fixed-point variant; switching requires a new covenant version.',
  expr:{ op:'ref', cell:'ebitda.pre_synergy' } },

{ kind:'formula', id:'ebitda.synergies.cap', label:'Synergy cap (20%)',
  unit:GBP, periodicity:'flow_ltm', ordinal:74, visibility:'detail', displayGroup:'Add-backs',
  expr:{ op:'pct', of:{op:'ref',cell:'ebitda.synergies.cap_base'},
                   rate:{op:'ref',cell:'ebitda.synergies.cap_rate'} } },

{ kind:'formula', id:'ebitda.synergies.allowed', label:'Add back: synergies (capped)',
  unit:GBP, periodicity:'flow_ltm', ordinal:75, visibility:'primary', displayGroup:'Add-backs',
  emitDisallowedSibling:true,
  expr:{ op:'cap', value:{op:'ref',cell:'ebitda.synergies.realisable_12m'},
                   cap:  {op:'ref',cell:'ebitda.synergies.cap'} } },

// ── CONSOLIDATED EBITDA ───────────────────────────────────────────────────
{ kind:'formula', id:'ebitda.consolidated', label:'Consolidated EBITDA',
  unit:GBP, periodicity:'flow_ltm', ordinal:80, visibility:'primary', displayGroup:'Result',
  expr:{ op:'add', args:[ {op:'ref',cell:'ebitda.pre_synergy'},
                          {op:'ref',cell:'ebitda.synergies.allowed'} ] } },

// ── Pro forma ─────────────────────────────────────────────────────────────
{ kind:'source', id:'pf.acq_willowbrook.stub_ebitda', label:'Willowbrook — pre-ownership stub EBITDA',
  unit:GBP, periodicity:'flow_ltm', ordinal:90, visibility:'primary', displayGroup:'Pro forma',
  concept:'pf.target_ebitda_stub', sign:'as_reported', required:false, minConfidence:0.80,
  binding:{ statement:'covenant_schedule', entityScope:'group',
            captions:['Pro forma EBITDA','Acquired EBITDA','Pre-acquisition EBITDA'] },
  note:'Borrower-supplied, NOT independently verified — target statutory accounts not yet obtained. '
     + 'Stub period 2024-07-01 to 2025-02-09 (224 days).',
  clauseRef:{ documentId:'doc_ca_f0031', page:36, clauseNumber:'1.1 "Pro Forma Basis"',
              snippet:'as if such acquisition had occurred on the first day of the Relevant Period' } },

{ kind:'formula', id:'ebitda.consolidated_pf', label:'Consolidated EBITDA (pro forma)',
  unit:GBP, periodicity:'flow_ltm', ordinal:91, visibility:'primary', displayGroup:'Result',
  expr:{ op:'add', args:[ {op:'ref',cell:'ebitda.consolidated'},
                          {op:'coalesce', args:[ {op:'ref',cell:'pf.acq_willowbrook.stub_ebitda'},
                                                 {op:'lit', q:{unit:GBP, value:'0'}} ]} ]} },
];
```

### 2.3 Net debt cells — showing carve-outs as *visible zeroed cells*

```ts
export const NETDEBT_CELLS: Cell[] = [
{ kind:'source', id:'debt.term_loan_a', label:'Senior Term Loan A', unit:GBP,
  periodicity:'point_in_time', ordinal:110, visibility:'detail', displayGroup:'Financial Indebtedness',
  concept:'bs.bank_loans_tla', sign:'as_reported', required:true, minConfidence:0.90,
  binding:{ statement:'balance_sheet', entityScope:'obligor_group', captions:['Term Loan A','Senior facility'] } },

{ kind:'source', id:'debt.acq_facility', label:'Acquisition Facility', unit:GBP, /* … */ } as SourceCell,
{ kind:'source', id:'debt.rcf_drawn',    label:'RCF drawn',           unit:GBP, /* … */ } as SourceCell,

// EUR tranche → explicit FX node. Unit checker would REJECT summing EUR into a GBP sum.
{ kind:'source', id:'debt.eur_tranche.eur', label:'EUR Term Facility (EUR)',
  unit:{kind:'money',currency:'EUR'}, periodicity:'point_in_time', ordinal:113,
  visibility:'internal', concept:'bs.bank_loans_eur', sign:'as_reported', required:true,
  minConfidence:0.90, binding:{ statement:'balance_sheet', entityScope:'obligor_group', captions:['EUR Facility'] } },

{ kind:'fx', id:'debt.eur_tranche.gbp', label:'EUR Term Facility (GBP equivalent)',
  unit:GBP, periodicity:'point_in_time', ordinal:114, visibility:'detail',
  displayGroup:'Financial Indebtedness',
  source:'debt.eur_tranche.eur', to:'GBP', basis:'period_average', provider:'ecb',
  clauseRef:{ documentId:'doc_ca_f0031', page:38, clauseNumber:'1.3 (Currency)',
              snippet:'amounts denominated in a currency other than the Base Currency shall be translated at the average rate for the Relevant Period' },
  note:'UNCERTAIN AND MATERIAL: agreements vary between average-rate, closing-spot and frozen-at-utilisation. Cited clause supports average. Confirmed by analyst 2025-07-14.' },

// Carve-out: present, valued, and explicitly excluded — NOT omitted.
{ kind:'source', id:'debt.ifrs16_leases', label:'IFRS 16 lease liabilities (excluded)',
  unit:GBP, periodicity:'point_in_time', ordinal:115, visibility:'primary',
  displayGroup:'Excluded from Financial Indebtedness',
  concept:'bs.lease_liabilities', sign:'as_reported', required:false, minConfidence:0.85,
  binding:{ statement:'balance_sheet', entityScope:'obligor_group', captions:['Lease liabilities','Right-of-use lease liabilities'] },
  note:'Excluded — frozen GAAP provision (cl. 20.2). Shown so the exclusion is visible and testable.',
  clauseRef:{ documentId:'doc_ca_f0031', page:88, clauseNumber:'20.2 (Accounting Basis)',
              snippet:'GAAP as applied in the Original Financial Statements, and IFRS 16 shall be disregarded' } },

{ kind:'source', id:'debt.shareholder_notes', label:'Shareholder loan notes (excluded)', /* … same pattern … */ } as SourceCell,

{ kind:'formula', id:'debt.gross', label:'Gross Financial Indebtedness',
  unit:GBP, periodicity:'point_in_time', ordinal:120, visibility:'primary', displayGroup:'Result',
  expr:{ op:'sum', args:[ {op:'ref',cell:'debt.term_loan_a'}, {op:'ref',cell:'debt.acq_facility'},
                          {op:'ref',cell:'debt.rcf_drawn'},   {op:'ref',cell:'debt.eur_tranche.gbp'} ] } },

{ kind:'source',   id:'debt.cash.reported', label:'Cash and cash equivalents', unit:GBP,
  periodicity:'point_in_time', ordinal:130, visibility:'detail', displayGroup:'Cash netting',
  concept:'bs.cash', sign:'as_reported', required:true, minConfidence:0.95,
  binding:{ statement:'balance_sheet', entityScope:'obligor_group', captions:['Cash at bank and in hand','Cash and cash equivalents'] } },

{ kind:'constant', id:'debt.cash.cap', label:'Cash netting cap', unit:GBP, periodicity:'static',
  ordinal:131, visibility:'detail', displayGroup:'Cash netting',
  quantity:{ unit:GBP, value:'5000000.00' },
  clauseRef:{ documentId:'doc_ca_f0031', page:37, clauseNumber:'1.1 "Total Net Debt"',
              snippet:'less freely available cash and cash equivalents of the Obligors, in an aggregate amount not exceeding £5,000,000' } },

{ kind:'formula', id:'debt.cash.allowed', label:'Cash netted (capped)', unit:GBP,
  periodicity:'point_in_time', ordinal:132, visibility:'primary', displayGroup:'Cash netting',
  emitDisallowedSibling:true,
  expr:{ op:'cap', value:{op:'ref',cell:'debt.cash.reported'}, cap:{op:'ref',cell:'debt.cash.cap'} } },

{ kind:'formula', id:'debt.net', label:'Total Net Debt', unit:GBP,
  periodicity:'point_in_time', ordinal:140, visibility:'primary', displayGroup:'Result',
  expr:{ op:'sub', args:[ {op:'ref',cell:'debt.gross'}, {op:'ref',cell:'debt.cash.allowed'} ] } },
];

export const LEVERAGE_CELLS: Cell[] = [
{ kind:'formula', id:'leverage.ratio', label:'Leverage Ratio', unit:RATIO,
  periodicity:'flow_ltm', ordinal:200, visibility:'primary', displayGroup:'Test',
  rounding:{ dp:2, mode:'half_up' },
  expr:{ op:'round', dp:2, mode:'half_up',
         value:{ op:'div', args:[ {op:'ref',cell:'debt.net'},
                                  {op:'ref',cell:'ebitda.consolidated_pf'} ] } },
  clauseRef:{ documentId:'doc_ca_f0031', page:90, clauseNumber:'21.2(a)',
              snippet:'Total Net Debt to Consolidated EBITDA shall not exceed the ratio set out in column 2 below, rounded to two decimal places' } },

{ kind:'schedule', id:'leverage.threshold', label:'Permitted Leverage', unit:RATIO,
  periodicity:'static', ordinal:201, visibility:'primary', displayGroup:'Test',
  scheduleName:'leverage_threshold', keyBy:'test_date', onNoMatch:'error',
  clauseRef:{ documentId:'doc_ca_f0031', page:90, clauseNumber:'21.2(a) table' } },

{ kind:'test', id:'leverage.test', label:'Leverage covenant', unit:{kind:'bool'},
  periodicity:'static', ordinal:210, visibility:'primary', displayGroup:'Test',
  lhs:'leverage.ratio', comparator:'lte', rhs:'leverage.threshold',
  headroomModes:['absolute','relative','ebitda_equivalent','debt_equivalent'],
  appliesWhen:{ c:'periodIndexGte', n:0 } },

{ kind:'reported', id:'cert.leverage.reported', label:'Borrower-reported Leverage', unit:RATIO,
  periodicity:'static', ordinal:220, visibility:'primary', displayGroup:'Reconciliation',
  concept:'cert.reported_leverage', mirrors:'leverage.ratio', varianceMaterialityBps:100 },
];
```

### 2.4 Worked example — Facility F-0031, test date 2025-06-30

Borrower: Northgate Care Group Ltd. FYE 31 Dec. Closing 2024-03-15. Two-quarter covenant holiday; first test date 2024-09-30. Test date 2025-06-30 is `periodIndex = 3`. LTM window = `Q:2024-09-30, Q:2024-12-31, Q:2025-03-31, Q:2025-06-30`.

**EBITDA ladder as the analyst sees it:**

| Cell | Label | Value | Badge |
|---|---|---|---|
| `ebitda.op_profit.q@Q:2024-09-30` | Operating profit Q3'24 | £3,100,000 | source · MA p.4 |
| `…@Q:2024-12-31` | Operating profit Q4'24 | £3,450,000 | source · MA p.4 |
| `…@Q:2025-03-31` | Operating profit Q1'25 | £2,900,000 | source · MA p.4 |
| `…@Q:2025-06-30` | Operating profit Q2'25 | £3,250,000 | source · MA p.4 |
| **`ebitda.op_profit.ltm`** | **Operating profit (LTM)** | **£12,700,000** | Σ 4 quarters |
| `ebitda.da.ltm` | Add back: D&A | £4,400,000 | 1,050 + 1,120 + 1,100 + 1,130 (£k) |
| `ebitda.exceptionals.items` | Exceptional items claimed | £780,000 | item set · 3 items |
| `ebitda.exceptionals.cap` | Cap (per annum) | £500,000 | constant · cl. 1.1(b) p.34 |
| **`ebitda.exceptionals.allowed`** | **Add back: exceptionals** | **£500,000** | ⚠ **CAP BOUND** |
| `…allowed.disallowed` | *Disallowed* | *£280,000* | auto-emitted |
| `ebitda.txn_costs.claimed.ltm` | Transaction costs claimed | £420,000 | source · cert Sch.2 |
| **`ebitda.txn_costs.allowed`** | **Add back: PA transaction costs** | **£350,000** | ⚠ **JUDGEMENT** (£70,000 reclassified as ordinary advisory — J. Varia, 2025-07-14) |
| `ebitda.gain_on_disposal.ltm` | Deduct: gain on disposal | (£150,000) | Σ 4 quarters |
| **`ebitda.pre_synergy`** | **EBITDA before synergies** | **£17,800,000** | subtotal |
| `ebitda.synergies.claimed` | Run-rate savings claimed | £3,900,000 | source · cert Sch.3 |
| `ebitda.synergies.realisable_12m` | Realisable within 12m | £3,700,000 | ⚠ JUDGEMENT (£200k plan shows month 15) |
| `ebitda.synergies.cap_base` | Cap base | £17,800,000 | ⚠ **INTERPRETATION INT-007** |
| `ebitda.synergies.cap` | Cap (20%) | £3,560,000 | 20% × cap base |
| **`ebitda.synergies.allowed`** | **Add back: synergies** | **£3,560,000** | ⚠ **CAP BOUND** |
| `…allowed.disallowed` | *Disallowed* | *£140,000* | auto-emitted |
| **`ebitda.consolidated`** | **Consolidated EBITDA** | **£21,360,000** | |
| `pf.acq_willowbrook.stub_ebitda` | Willowbrook stub (224d) | £1,470,000 | ⚠ **UNVERIFIED** — borrower schedule |
| **`ebitda.consolidated_pf`** | **Consolidated EBITDA (PF)** | **£22,830,000** | |

**Net debt ladder:**

| Cell | Value | Badge |
|---|---|---|
| `debt.term_loan_a` | £62,000,000 | source · BS p.7 |
| `debt.acq_facility` | £14,000,000 | source · BS p.7 |
| `debt.rcf_drawn` | £3,500,000 | source · BS p.7 |
| `debt.eur_tranche.eur` | €9,000,000 | source · BS p.7 |
| `debt.eur_tranche.gbp` | £7,650,000 | fx · ECB avg 0.8500 GBP/EUR, Relevant Period |
| `debt.ifrs16_leases` | £8,200,000 → **£0 included** | ⛔ EXCLUDED · frozen GAAP cl. 20.2 p.88 |
| `debt.shareholder_notes` | £22,000,000 → **£0 included** | ⛔ EXCLUDED · subordinated carve-out |
| **`debt.gross`** | **£87,150,000** | |
| `debt.cash.reported` | £6,300,000 | source · BS p.6 |
| `debt.cash.cap` | £5,000,000 | constant · cl. 1.1 p.37 |
| **`debt.cash.allowed`** | **£5,000,000** | ⚠ **CAP BOUND** (£1,300,000 disallowed) |
| **`debt.net`** | **£82,150,000** | |

**Test:**

```
leverage.ratio    = round(82,150,000 / 22,830,000, 2, half_up) = 3.5983… → 3.60x
leverage.threshold @ 2025-06-30                                          = 4.50x
leverage.test     = 3.60x <= 4.50x                                       = PASS

headroom.absolute            = 0.90x
headroom.relative            = 20.0% of the threshold
headroom.ebitda_equivalent   = 22,830,000 − (82,150,000 / 4.50) = £4,574,444
                               (EBITDA may fall 20.0% before breach)
headroom.debt_equivalent     = (22,830,000 × 4.50) − 82,150,000 = £20,585,000 additional debt capacity
```

**The differentiator — variance vs the borrower.** The borrower's compliance certificate reports **3.47x**. QuarterMark says **3.60x**. Variance **+0.13x**, above the 100 bps materiality threshold → flagged.

Delta attribution walks both graphs and produces a bridge over the differing cells. For a ratio this is non-additive (division), so with ≤ 12 differing cells the engine computes **exact Shapley values** over the 2^n counterfactual subsets (here n = 4 → 16 evaluations, sub-millisecond); above 12 it degrades to a sequential bridge in a fixed declared order and labels the output `attribution_method: 'sequential'`.

| Differing cell | Borrower | QuarterMark | Clause | Shapley Δ ratio |
|---|---|---|---|---|
| `debt.cash.allowed` | £6,300,000 | £5,000,000 | 1.1 "Total Net Debt", p.37 | +0.0566x |
| `ebitda.exceptionals.allowed` | £780,000 | £500,000 | 1.1(b), p.34 | +0.0438x |
| `ebitda.synergies.allowed` | £3,700,000 | £3,560,000 | 1.1(d), p.35 | +0.0219x |
| `ebitda.txn_costs.allowed` | £420,000 | £350,000 | 1.1(c), p.34 | +0.0110x |
| | | | **Total** | **+0.133x → 0.13x** |

(Check: borrower EBITDA = 22,830,000 + 280,000 + 140,000 + 70,000 = 23,320,000; borrower net debt = 82,150,000 − 1,300,000 = 80,850,000; 80,850,000 / 23,320,000 = 3.4670 → 3.47x. ✓)

**This table is the product.** No other tool in this segment can produce it, because no other tool holds the definition as a graph with per-cell clause citations.

---

## 3. Auditability and the analyst UI

### 3.1 Why the cell graph is the right substrate for audit

1. **Every number has exactly one derivation.** `CellValue.inputs` is a complete list of instance keys. The transitive closure from `leverage.ratio` down to source cells is the audit trail, generated, not written.
2. **Rejections are first-class.** The £280,000 disallowed exceptional and the £8,200,000 excluded IFRS 16 balance are *cells with values*, not absences. An auditor's first question is "what did you leave out?" — this model answers it structurally.
3. **Judgements are separated from arithmetic.** `ClassifiedCell` and `Interpretation` records isolate the parts a human decided from the parts a machine computed. You can produce a report listing "every number in this quarter that depended on human judgement".
4. **The graph renders to English deterministically**, so the audit pack contains both the arithmetic and its prose form:

```ts
// packages/calc-kernel/src/render.ts
export function renderEnglish(cell: Cell, g: CovenantGraph): string;
// ebitda.consolidated_pf →
// "Consolidated EBITDA (pro forma) = Consolidated EBITDA + Willowbrook pre-ownership stub EBITDA,
//  where Consolidated EBITDA = EBITDA before synergy add-back + Add back: synergies (capped),
//  and Add back: synergies (capped) = the lesser of (Synergies realisable within 12 months) and
//  (20% × EBITDA before synergy add-back)."
```
The reviewer diffs that sentence against the clause snippet. This is the cheapest high-value correctness check in the system.

5. **Tamper evidence.** `audit_event` is append-only with a hash chain (`row_hash = sha256(prev_hash || canonical_json(payload))`). *Honest limitation:* a hash chain inside the same database is only tamper-*evident* against an attacker who does not also rewrite the chain. To make it meaningful, the daily head hash is written to an object store with immutability/object-lock enabled and emailed to the fund's designated contact. State that plainly in the security pack rather than overclaiming "immutable".

### 3.2 What the analyst actually sees

**Primary view is a ladder, not a node-link diagram.** Finance professionals read indented calculation ladders and bridge waterfalls. A force-directed graph of 60 nodes is a demo, not a tool. Node-link is available as a secondary "Map" tab for tracing an unfamiliar covenant.

```
Leverage — Q2 2025 · Northgate Care Group                    ✅ PASS
┌───────────────────────────────────────────────────────────────────┐
│  3.60x        vs 4.50x        headroom 0.90x (20.0%)              │
│  EBITDA could fall £4.57m before breach                           │
│  ⚠ Borrower reported 3.47x — 0.13x variance   [ Reconcile → ]     │
└───────────────────────────────────────────────────────────────────┘

  Total Net Debt / Consolidated EBITDA (pro forma)
  ▼ Total Net Debt                                    £82,150,000
      ▼ Gross Financial Indebtedness                  £87,150,000
          Senior Term Loan A                          £62,000,000  📄 p.7
          Acquisition Facility                        £14,000,000  📄 p.7
          RCF drawn                                    £3,500,000  📄 p.7
          ▼ EUR Term Facility (GBP)                    £7,650,000  💱
              EUR Term Facility               €9,000,000           📄 p.7
              ECB average rate, Relevant Period   0.8500           🔗 rate_2025q2_eurgbp
        ⛔ IFRS 16 lease liabilities   £8,200,000 → excluded        📖 cl.20.2 p.88
        ⛔ Shareholder loan notes     £22,000,000 → excluded        📖 cl.1.1 p.37
      ▼ Cash netted (capped)                           £5,000,000  🔒 CAP BOUND
          Cash and cash equivalents                    £6,300,000  📄 p.6
          Cash netting cap                             £5,000,000  📖 cl.1.1 p.37
          Disallowed                                   £1,300,000
  ▼ Consolidated EBITDA (pro forma)                   £22,830,000
      … [expand]
```

Badge vocabulary (consistent everywhere): `📄 source` (click → document at page, bbox highlighted) · `📖 clause` (click → agreement at clause) · `🔒 cap bound` · `⛔ excluded by carve-out` · `⚖️ judgement` · `✏️ overridden` · `💱 FX applied` · `❓ unverified / borrower-supplied` · `⏳ blocked pending review`.

### 3.3 Tracing a number to a source document page

`CellValue.provenance` is a discriminated union carrying everything needed:

```ts
export type Provenance =
  | { kind:'document'; documentId:string; page:number;
      bbox:[number,number,number,number]; snippet:string;
      extractorVersion:string; confidence:number; factId:string }
  | { kind:'derived'; expr:Expr; inputs:InstanceKey[] }
  | { kind:'aggregate'; fn:string; inputs:InstanceKey[] }
  | { kind:'parameter'; scheduleId:string; rowSeq:number; clauseRef:ClauseRef }
  | { kind:'constant'; clauseRef:ClauseRef }
  | { kind:'fx'; rateId:string; provider:string; pair:string; basis:FxBasis; fixingDate:Iso }
  | { kind:'override'; overrideId:string; originalComputed:Quantity }
  | { kind:'classification'; decidedBy:string; decidedAt:string; rationale:string;
      aiProposal?:{ value:Dec; confidence:number } }
  | { kind:'manual_entry'; userId:string; at:string; rationale:string };
```

Click `£62,000,000` → right pane opens `pdf.js` at `doc_ma_2025q2`, page 7, scrolls to the bbox, draws a highlight rect. The extracted snippet (`"Bank loans — Term Loan A    62,000"`) is shown above the viewer alongside the unit scaling applied (`£'000 → £`). Unit scaling is itself recorded on the fact row, because "the accounts are in thousands" is a top-3 real-world error source.

### 3.4 Overriding a cell

```ts
export interface Override {
  id: string;
  facilityId: string; covenantId: string;
  cellId: CellId; periodKey: PeriodKey;
  scope: 'this_period_only' | 'this_period_forward' | 'all_periods';
  newQuantity: Quantity;
  originalComputed: Quantity;                 // snapshot at creation
  reasonCode:
    | 'extraction_error' | 'definition_interpretation' | 'borrower_restatement'
    | 'agreed_with_borrower' | 'data_not_available' | 'timing_difference' | 'other';
  narrative: string;                          // required, min 40 chars, enforced
  supportingDocumentId?: string;
  createdBy: string; createdAt: string;
  requiresApproval: boolean;                  // true iff cell is an ancestor of a `test` cell
  approvedBy?: string; approvedAt?: string;   // four-eyes; MUST differ from createdBy
  supersededByOverrideId?: string;
  revokedBy?: string; revokedAt?: string; revokeReason?: string;
}
```

Rules:
- **Overrides never mutate.** Superseding creates a new row and points the old one at it. Nothing is deleted.
- **Impact preview before commit.** The UI runs the evaluation twice (with and without the pending override) — pure function, ~5 ms — and shows: `leverage.ratio 3.60x → 3.44x`, `leverage.test PASS → PASS`, `12 downstream cells affected`. The analyst approves a *consequence*, not a keystroke.
- **Four-eyes where it matters.** `requiresApproval` is computed from the reverse-dependency closure: if the cell can reach a `test` cell, a second user must approve before the run is published. Until then the run status is `pending_approval` and cannot be included in an investor or regulatory report.
- **Overrides on source cells prefer fact correction.** If the reason is `extraction_error`, the UI offers "correct the extracted fact instead" — which fixes it for every covenant using that concept, rather than papering over it in one graph. Silently allowing per-graph overrides for extraction errors is how these systems rot.
- **Every override appears in the audit pack** with narrative, both values, both users and timestamps.

### 3.5 Headroom trending and forecasting

Because the same graph is evaluated for every test date, trending is free — `leverage.ratio` across `periodIndex 0..n` is a single query on `cell_value`. And it can trend *any* cell: analysts care about the trajectory of `ebitda.exceptionals.allowed.disallowed` (rising add-back aggression) at least as much as the headline ratio.

Forecasting a breach 60–90 days ahead is a projection *of source cells*, then re-running the identical graph:
```ts
interface ForecastScenario {
  id: string; label: string;                      // 'Base', 'Flat EBITDA', 'Sponsor plan'
  method: 'last_quarter_annualised'|'trailing_4q_trend'|'analyst_input'|'borrower_forecast';
  overlays: Array<{ cellId: CellId; periodKey: PeriodKey; q: Quantity; rationale: string }>;
}
```
The forecast is a `calc_run` with `mode: 'forecast'` and the overlays recorded exactly like overrides. Crucially the *same kernel and same definition version* produce the forecast, so a forecast breach and an actual breach are computed identically — you never get the "our model said one thing, the system said another" problem.

---

## 4. Period handling

### 4.1 The period calendar

```ts
export interface PeriodCalendar {
  fiscalYearEnd: { month: number; day: number } | { kind:'week_4_4_5'; anchorWeekday: number };
  closingDate: Iso;
  firstTestDate: Iso;                 // after covenant holiday
  frequency: 'quarterly'|'semi_annual'|'annual';
  testDates: Iso[];                   // materialised through facility maturity
  quarterEnds: Iso[];                 // may differ from test dates
  relevantPeriodMonths: number;       // 12
}

export function keyFor(cell: Cell, ref: PeriodRef, cal: PeriodCalendar, testDate: Iso): PeriodKey;
```

Rules:
- `periodicity: 'point_in_time'` → `PIT:<testDate>` regardless of `PeriodRef` (balance sheet at the test date).
- `periodicity: 'flow_quarter'` with `{rel:'lag',n}` → `Q:<quarterEnds[idx − n]>`.
- `periodicity: 'flow_ltm'` → `LTM:<testDate>`.
- `periodicity: 'static'` → `STATIC`.

*Honest complication:* 4-4-5 / 52-53-week fiscal calendars (common in retail and healthcare) mean quarter-ends drift and one year in five or six has a 53rd week, so "LTM" is 53 weeks. The `week_4_4_5` calendar variant handles the date arithmetic, but the *covenant* usually just says "Financial Quarter", so the 53-week LTM is arguably over-stated. QuarterMark emits a `TraceNote` (`partial_window` with `available: 53 weeks`) and flags it; it does not silently normalise.

### 4.2 LTM aggregation

`ltm_sum` over `window: 4` collects `Q:` instances for the current and three prior quarter-ends, sums them, and records all four `inputs`. Behaviours:

- **Full window available** → straight sum, `trace: []`.
- **Partial window** (early in facility life) → `partialWindowPolicy`:
  - `use_opening_statements`: splices in pre-closing historical quarters from the Original Financial Statements, marked with `provenance.documentId = <OFS>` so the analyst can see the pre-ownership quarters. This is the right default for opex/EBITDA lines where the agreement contemplates it.
  - `annualise`: `sum(n) × 4/n`, trace `partial_window`. Only when the agreement says so.
  - `use_agreed_schedule`: the agreement fixes EBITDA for early Relevant Periods; resolves to a `ScheduleCell`.
  - `indeterminate`: result null with `insufficient_history`. Default — safest.
- **Mixed frequency**: a borrower reporting semi-annually gives `H:` periods. The calendar declares the reporting frequency per facility; `ltm_sum` accepts `H:` instances with `window: 2`. Reporting quarterly management accounts alongside audited annuals is the norm; where only the annuals are reliable, the analyst can mark quarterly facts `indicative` and the run flags `mixed_reliability`.
- **Restatement**: a corrected prior-quarter fact makes every later LTM instance dirty. See §9.

### 4.3 Pro-forma adjustments

Model each acquisition/disposal as its own namespaced cell cluster, not as a lump adjustment:

```
pf.acq_willowbrook.completion_date          2025-02-10      (constant, from SPA)
pf.acq_willowbrook.stub_days                224             (formula: LTM start → completion − 1)
pf.acq_willowbrook.target_ltm_ebitda        £2,400,000      (source: target accounts, if obtained)
pf.acq_willowbrook.stub_ebitda              £1,470,000      (source OR pro-rata formula)
pf.acq_willowbrook.acquisition_debt         £14,000,000     (source — cross-check vs debt.acq_facility)
pf.acq_willowbrook.consistency_check        BOOL            (formula/test)
```

`consistency_check` catches the classic asymmetry: the acquisition debt sits in closing net debt (a point-in-time figure, fully reflected), so if the target's EBITDA is *not* pro-formed into the denominator, leverage is artificially inflated — and conversely, borrowers sometimes pro-forma a full year of target EBITDA while the debt was drawn for two months. A dedicated `test` cell asserting "if `acquisition_debt > 0` at this test date then `stub_ebitda` is non-null" and vice versa. This is the kind of check funds do by memory and lose.

Sourcing preference for `stub_ebitda`, in order: (1) target's own statutory or management accounts, extracted with full provenance; (2) borrower's pro-forma schedule, marked `❓ UNVERIFIED`; (3) pro-rata of target LTM by `stub_days / 365`, marked `estimated`. The provenance kind differs in each case and the badge differs in the UI. Never let (2) or (3) look like (1).

---

## 5. Step-downs, equity cures, multi-currency

### 5.1 Step-down schedules

```sql
create table parameter_schedule (
  id                  uuid primary key,
  covenant_version_id uuid not null references covenant_version(id) on delete cascade,
  name                text not null,                 -- 'leverage_threshold'
  unit                jsonb not null,
  key_by              text not null check (key_by in ('test_date','period_index','financial_year')),
  clause_ref          jsonb not null,
  unique (covenant_version_id, name)
);

create table parameter_schedule_row (
  schedule_id       uuid not null references parameter_schedule(id) on delete cascade,
  seq               int  not null,
  from_test_date    date,        to_test_date    date,      -- key_by='test_date'   [from, to)
  from_period_index int,         to_period_index int,       -- key_by='period_index'
  financial_year    int,                                    -- key_by='financial_year'
  value             numeric(28,10) not null,
  currency          text,
  note              text,
  primary key (schedule_id, seq),
  check (
    (from_test_date is not null)::int + (from_period_index is not null)::int
    + (financial_year is not null)::int = 1
  )
);
```

Both keying modes are needed because agreements draft it both ways: "each Test Date falling on or before 31 December 2025" (date) vs "each of the first four Test Dates" (index). A gap/overlap validator runs at version approval; `onNoMatch: 'error'` prevents a silently missing step-down.

For F-0031:

| seq | from | to | value | note |
|---|---|---|---|---|
| 1 | 2024-09-30 | 2026-01-01 | 4.50 | cl. 21.2(a) row 1 |
| 2 | 2026-01-01 | 2027-01-01 | 4.00 | cl. 21.2(a) row 2 |
| 3 | 2027-01-01 | *(null)* | 3.50 | cl. 21.2(a) row 3 |

Because the threshold is a resolved cell with its own provenance (`{ kind:'parameter', scheduleId, rowSeq, clauseRef }`), the analyst clicking `4.50x` lands on the exact table row in the PDF. Step-downs are also what make forecasting non-trivial: the "60–90 day" breach forecast must apply the *forward* threshold, and a step-down crossing is itself an alert (`⚠ Leverage steps down to 4.00x at Q4 2025; current 3.60x implies 0.40x headroom at the new level`).

### 5.2 Equity cures

```ts
export interface CureEvent {
  id: string; facilityId: string;
  forTestDate: Iso;                            // the test date being cured
  injectedOn: Iso;                             // must be within the cure period (e.g. 20 BD of cert delivery)
  amount: Dec; currency: CurrencyCode;
  instrument: 'ordinary_equity'|'subordinated_shareholder_loan'|'deeply_subordinated_notes';
  cureType: 'ebitda_cure'|'debt_prepayment_cure'|'liquidity_cure';
  documents: string[];                         // subscription agreement, board minute, bank statement
  acceptedBy?: string; acceptedAt?: string;
}
```

Cure cells (all `flow_ltm` or `static`, all reachable in the ladder):

```
cure.window_count            = COUNT(cures with forTestDate in [t-3 .. t])
cure.life_count              = COUNT(cures over facility life to t)
cure.max_per_4q              = 2                       (constant, cl. 21.4(b))
cure.max_life                = 5                       (constant, cl. 21.4(b))
cure.consecutive_ok          = false                   (constant, cl. 21.4(c))
cure.eligible                = window_count <= max_per_4q AND life_count <= max_life
                               AND (consecutive_ok OR no cure at t-1)
cure.minimum_required        = the smallest amount that makes leverage.test pass   (solved, see below)
cure.overcure_permitted      = false                   (constant, cl. 21.4(d))
cure.amount_applied          = eligible ? (overcure_permitted ? injected
                                                              : MIN(injected, minimum_required))
                                        : £0
cure.deemed_ebitda_add@t     = Σ cure.amount_applied for forTestDate in [t-3 .. t]   ← 4-quarter carry
```

Two points that are routinely modelled wrong:

1. **The carry-forward.** An EBITDA cure inflates the LTM EBITDA for the quarter of injection *and the following three quarters*, because it is deemed added to EBITDA for that Relevant Period and the Relevant Period rolls. `cure.deemed_ebitda_add` therefore sums a 4-quarter window of cure events, with `deemedEffectQuarters` configurable per agreement. Modelling it as a one-quarter bump understates leverage in the three following quarters — in the borrower's favour.
2. **Breach then cure ≠ never breached.** The engine always evaluates **two test cells**:
   ```
   leverage.test_pre_cure   = 4.62x <= 4.50x  → FAIL
   leverage.test_post_cure  = 4.41x <= 4.50x  → PASS
   calc_run.result_status   = 'breach_cured'
   ```
   Both are persisted, both appear in the audit pack, and portfolio reporting counts `breach_cured` separately from `pass`. A cured breach is material information for an IC and for AIFMD reporting; collapsing it to "pass" is a misrepresentation.

`cure.minimum_required` is solved, not iterated ad hoc: for an EBITDA cure on a leverage test, `min_ebitda = net_debt / threshold`, so `minimum_required = max(0, min_ebitda − ebitda_pre_cure)`. For a debt-prepayment cure, `minimum_required = max(0, net_debt − threshold × ebitda)`. These are closed-form per covenant type; where a covenant has no closed form (a cure feeding both numerator and denominator, as with some DSCR drafting) the engine falls back to bisection over 40 iterations of the pure graph — still microseconds — and records `trace: {t:'fixed_point', iterations, residual}`.

*Uncertain:* the "no over-cure" limitation and the 4-quarter deemed effect are common in European sponsor-backed drafting but not universal; both are per-covenant configuration, not hard-coded.

### 5.3 Multi-currency

Three currencies coexist: the **base currency** of the agreement, the borrower's **reporting currency**, and the currency of individual **tranches**.

```sql
create table fx_rate (
  id           uuid primary key,
  pair         text not null,                    -- 'EUR/GBP'
  rate_type    text not null check (rate_type in ('closing_spot','period_average','agreed','utilisation')),
  period_key   text not null,                    -- 'PIT:2025-06-30' or 'LTM:2025-06-30'
  rate         numeric(28,12) not null,
  provider     text not null,                    -- 'ecb' | 'boe' | 'agreed'
  fixing_date  date not null,
  source_uri   text,
  ingested_at  timestamptz not null default now(),
  unique (pair, rate_type, period_key, provider)
);
```

Rules enforced by the unit checker:
- `add`/`sub` of two `money` values with different `currency` → **compile error** `UNIT_MISMATCH`. There is no implicit conversion, ever. This single rule eliminates an entire class of silent errors.
- Default bases: P&L flows → `period_average`; balance sheet → `closing_spot`. **But** the agreement overrides, and it frequently does — many European agreements translate Financial Indebtedness at the *average* rate for the Relevant Period precisely so that FX movement does not create a spurious leverage breach against an EBITDA denominator translated at average. F-0031 does this (cl. 1.3, cited above). *Marked uncertain:* practice varies materially; some agreements freeze at the rate on the date of utilisation. `FxBasis` covers all four and the choice is a cited, analyst-confirmed cell, not a system default.
- Missing rate → `nullReason: 'fx_rate_missing'` → `INDETERMINATE`. Never fall back to a stale rate silently.
- FX rates are facts with provenance (`provider`, `fixingDate`, `source_uri`), frozen into the run snapshot like everything else.

---

## 6. Versioning under amendments, with exact historical reproducibility

### 6.1 Version model

```sql
create extension if not exists btree_gist;

create table covenant_version (
  id                       uuid primary key,
  covenant_id              uuid not null references covenant(id) on delete cascade,
  version_no               int  not null,
  source_document_id       uuid not null references agreement_document(id),
  effective_from_test_date date not null,
  effective_to_test_date   date,                       -- null = current
  retroactive              boolean not null default false,
  supersedes_id            uuid references covenant_version(id),
  graph_hash               bytea not null,             -- sha256 of canonical JSON of all cells+schedules
  status                   text not null check (status in ('draft','in_review','approved','superseded')),
  interpretations          jsonb not null default '[]',
  created_by uuid not null, created_at timestamptz not null default now(),
  approved_by uuid, approved_at timestamptz,
  second_approver_id uuid,                             -- four-eyes on publish
  unique (covenant_id, version_no),
  constraint no_overlapping_versions exclude using gist (
    covenant_id with =,
    daterange(effective_from_test_date, effective_to_test_date, '[)') with &&
  ) where (status = 'approved')
);
```

The exclusion constraint is the load-bearing guarantee: **two approved versions can never govern the same test date.** Ambiguity about which terms applied in Q3 2024 is exactly the failure that loses institutional trust, and it is enforced by the database rather than by application discipline.

### 6.2 Amendment flow

1. Amendment PDF ingested → `agreement_document(doc_type='amendment')`.
2. Extractor produces an **amendment diff proposal**, not a fresh graph:

```ts
export interface GraphDiff {
  baseVersionId: string;
  effectiveFromTestDate: Iso;
  retroactive: boolean;
  changes: Array<
    | { t:'add_cell';    cell: Cell; clauseRef: ClauseRef }
    | { t:'remove_cell'; cellId: CellId; clauseRef: ClauseRef }
    | { t:'modify_cell'; cellId: CellId; before: Partial<Cell>; after: Partial<Cell>; clauseRef: ClauseRef }
    | { t:'schedule_row'; scheduleName: string; op:'insert'|'update'|'delete';
        row: ParamRow; clauseRef: ClauseRef }
    | { t:'interpretation'; id: string; text: string; affects: CellId[] }
  >;
  unmatchedAmendmentText: Array<{ page:number; snippet:string; reason:'no_calc_effect'|'unmodelled' }>;
}
```

3. The analyst reviews **the diff**, not 60 cells. A typical amendment touches 1–4 cells (a step-down reset, a new basket, an EBITDA add-back extension). `unmatchedAmendmentText` is the coverage check: every substantive paragraph of the amendment must be either matched to a change or explicitly marked "no effect on covenant calculation" by a human. Nothing is allowed to be silently ignored.
4. On approval: new `covenant_version` row (cells copied + diff applied), old row gets `effective_to_test_date` and `status='superseded'`. `graph_hash` recomputed.
5. **Retroactive amendments** (a waiver that resets a prior test date) set `retroactive = true`, require the second approver, and **do not delete prior runs**. They create new runs with `restates_run_id` pointing at the original; the original stays visible and is labelled "superseded by Amendment No. 2, 2025-08-14". The portfolio view shows the current answer; the audit pack shows both.

### 6.3 Exact reproducibility

Reproducing Q3 2024 in 2031 requires four things frozen together:

```sql
create table calc_run (
  id                  uuid primary key,
  facility_id         uuid not null,
  covenant_id         uuid not null,
  covenant_version_id uuid not null references covenant_version(id),
  test_date           date not null,
  engine_version      text not null,                  -- '1.3.0' — pinned kernel
  mode                text not null check (mode in ('actual','forecast','what_if','replay')),
  trigger             text not null check (trigger in
                        ('scheduled','document_ingested','override_applied','amendment_applied',
                         'manual','backfill','replay')),
  input_snapshot      jsonb not null,                 -- FROZEN COPY of every input value
  input_fingerprint   bytea not null,                 -- sha256(canonical(input_snapshot) || graph_hash || engine_version)
  result_status       text check (result_status in ('pass','fail','indeterminate','breach_cured','error')),
  root_value          numeric(28,10),
  published           boolean not null default false,
  restates_run_id     uuid references calc_run(id),
  superseded_by_id    uuid references calc_run(id),
  created_by uuid, created_at timestamptz not null default now(),
  approved_by uuid, approved_at timestamptz
);
create index on calc_run (facility_id, covenant_id, test_date, created_at desc);
create unique index one_published_run on calc_run (covenant_id, test_date) where published;
```

**`input_snapshot` stores values, not references.** This is the single most important reproducibility decision. If it stored `factId` and the fact were later restated, replaying would silently give a different answer. Snapshot shape:

```jsonc
{
  "facts": [ { "concept":"is.operating_profit_before_tax", "period":"Q:2025-06-30",
               "value":"3250000.00", "currency":"GBP", "factId":"f_9a1…",
               "documentId":"doc_ma_2025q2", "page":4,
               "bbox":[72.0,510.2,244.8,522.6], "extractorVersion":"ext-2.4.1" } ],
  "schedules": [ { "name":"leverage_threshold", "rowSeq":1, "value":"4.50" } ],
  "fx":        [ { "pair":"EUR/GBP", "rateType":"period_average",
                   "period":"LTM:2025-06-30", "rate":"0.850000000000", "provider":"ecb" } ],
  "flags":     { "permitted_acquisition_in_period": true },
  "cures":     [],
  "overrides": [ { "id":"ov_31c…", "cell":"ebitda.txn_costs.allowed",
                   "period":"LTM:2025-06-30", "value":"350000.00" } ],
  "calendar":  { "fye":"12-31", "closing":"2024-03-15", "testDates":["2024-09-30", "…"] }
}
```

**Kernel archival.** `packages/calc-kernel/kernels/<semver>/` holds every published semantics version as a pure module:

```ts
export const KERNELS: Record<string, Kernel> = {
  '1.0.0': k100, '1.1.0': k110, '1.2.0': k120, '1.3.0': k130,
};
export function replay(run: CalcRunRow): RunResult {
  const k = KERNELS[run.engine_version];
  if (!k) throw new Error(`Kernel ${run.engine_version} unavailable — cannot replay run ${run.id}`);
  return k.evaluate(loadGraph(run.covenant_version_id), hydrate(run.input_snapshot), 'leverage.test');
}
```

The version bumps **only when semantics change** (rounding, null propagation, aggregate behaviour), never for performance or refactoring. `SEMANTICS.md` documents every bump. CI runs a **replay-drift job**: every published run is replayed against the *current* kernel and any difference is reported as a semantic-drift diff. If drift is intended, the kernel version bumps and old runs stay pinned to their old kernel; if unintended, it is a bug caught before release.

*Honest cost:* maintaining N archived kernels forever is real work for a solo founder. Mitigations: the kernel is small (~1,500 LOC, zero dependencies except `decimal.js`), pure, and has golden-file tests per version. Realistically you carry 3–6 versions over five years. If a kernel must be dropped, the affected runs are marked `replay_unavailable` and the frozen `input_snapshot` plus persisted `cell_value` rows still constitute the audit record — you just cannot re-derive it, and you say so.

---

## 7. AI extraction into the graph, and human review

Two distinct pipelines. Confusing them is a common architectural mistake.

### 7.1 Pipeline A — definition extraction (agreement → graph). Runs once per agreement/amendment.

1. **Ingest.** PDF → layout-aware parse producing text blocks with `(page, bbox)`. Text-native PDFs preferred; scanned documents go through OCR with a lower confidence ceiling and are flagged. *Uncertain:* I am not going to name a specific parser as "correct" — the requirement is per-token bounding boxes and stable page coordinates, and several commercial and open options meet it.
2. **Structure.** Locate the definitions clause (typically cl. 1.1 in LMA-style documents), the financial covenants clause (typically cl. 21–22), and the schedules. *Uncertain:* LMA clause numbering is conventional, not guaranteed; the locator is heuristic with a human confirmation step.
3. **Term graph.** Extract defined terms and their dependency structure ("Total Net Debt" references "Financial Indebtedness" references "Permitted Indebtedness"…). Resolving the *transitive closure of defined terms* is where most covenant tooling stops too early and where the depth advantage lives.
4. **Graph proposal.** An LLM (Claude, with a strict JSON-schema-constrained output) emits `Cell[]` + `ParamRow[]` + `Interpretation[]`. **It emits the AST, never code, never a formula string.** Every `constant`, `schedule` and `cap` cell must carry a `clauseRef` with a verbatim `snippet`, and the snippet is checked to actually occur in the document text at the stated page — a cheap, effective grounding check that kills most hallucinated citations.
5. **Mechanical validation.** Zod schema → unit checker → acyclicity → citation presence → schedule coverage. Failures go back for one repair round, then to a human.
6. **Coverage adversary.** A second pass reads the clause text and the `renderEnglish()` output of the proposed graph side by side, and is asked only: *what does the clause say that the graph does not do?* Every cap, proviso, carve-out, "provided that", and "to the extent" in the clause must map to a node. Unmapped ones become `UNMODELLED_CAP` warnings the human must clear.
7. **Human review UI.** Split view: clause text left with citations highlighted, cell ladder right. Each cell has Accept / Edit / Reject. `covenant_version.status` cannot leave `draft` until every cell has a reviewer, and cannot reach `approved` without a second approver.

*Realistic expectation, stated plainly:* on a 200-page LMA agreement I would expect the proposal to get the *skeleton* right (which covenants, which line items, the step-down table) far more reliably than the *edge conditions* (the ordering of a capped basket, whether a cap is pre- or post-add-back, whether cash netting excludes trapped cash). The review UI is designed around that asymmetry: skim the skeleton, scrutinise the caps. Budget 45–90 minutes of analyst time per new agreement. That is still an order of magnitude better than building the spreadsheet from scratch, and it is an honest number to put in front of a buyer.

### 7.2 Pipeline B — figure extraction (accounts/certificate → facts). Runs every quarter.

```sql
create table financial_fact (
  id                  uuid primary key,
  facility_id         uuid not null references facility(id),
  concept             text not null,
  period_key          text not null,
  value               numeric(28,10),
  currency            text,
  scale_applied       int not null default 1,        -- 1000 if statements are in £'000
  source_document_id  uuid not null references agreement_document(id),
  page                int, bbox numeric[], snippet text,
  caption_matched     text,                          -- 'Operating profit/(loss)'
  extractor_version   text not null,
  confidence          numeric(4,3) not null,
  review_status       text not null default 'unreviewed'
                      check (review_status in ('unreviewed','accepted','corrected','rejected')),
  corrected_value     numeric(28,10),
  reviewed_by uuid, reviewed_at timestamptz,
  restates_fact_id    uuid references financial_fact(id),
  valid_from          timestamptz not null default now(),
  valid_to            timestamptz,                   -- bitemporal: null = current
  unique (facility_id, concept, period_key, source_document_id, valid_from)
);
create index on financial_fact (facility_id, concept, period_key) where valid_to is null;
```

- **Per-borrower caption map.** The first time an analyst confirms `"Operating profit/(loss)" → is.operating_profit_before_tax`, it is stored in `borrower_caption_map` and reused. Extraction accuracy improves per borrower over time, which is the right shape — a fund sees the same 15–80 borrowers every quarter.
- **Drift detection.** If a previously-mapped caption disappears from this quarter's accounts, that is an alert, not a silent zero. Borrowers restructure their chart of accounts, and that is exactly when covenant calculations go wrong.
- **Internal consistency checks** before the graph runs: balance sheet balances; cash flow ties to the movement in cash; the current quarter's opening balances tie to last quarter's closing. Failures block the run.
- **Confidence gate.** `confidence < SourceCell.minConfidence` or `review_status = 'unreviewed'` on a required source → `blocked_pending_review` → `INDETERMINATE`. Never a silent pass. This is Hard Invariant #1 again, at the ingestion boundary.

### 7.3 Review states and permissions

```
document ingested
  → facts extracted (unreviewed)
  → analyst reviews facts (accept / correct)          [role: analyst]
  → classifications & interpretations decided          [role: analyst]
  → calc_run executes                                  [system]
  → variance vs borrower reviewed                      [role: analyst]
  → run approved & published                           [role: senior_analyst ≠ creator]
  → included in investor / regulatory reporting
```

Postgres RLS on `facility_id` via a `user_facility_access` table; roles `viewer | analyst | senior_analyst | admin | auditor` (`auditor` = read-everything-including-history, write-nothing). Single-region deployment (UK or EU) with the database, object store and any LLM inference endpoint all in-region for AIFMD II / UK GDPR comfort. *Note:* using a US-hosted model API on agreement text is a data-residency question a buyer's diligence will ask about — either use an in-region endpoint or get an explicit carve-out; do not hand-wave it.

---

## 8. Postgres storage model

Beyond the tables already given (`covenant_version`, `parameter_schedule*`, `financial_fact`, `calc_run`, `fx_rate`):

```sql
create table cell (
  covenant_version_id uuid not null references covenant_version(id) on delete cascade,
  cell_id             text not null,
  kind                text not null,
  label               text not null,
  unit                jsonb not null,
  periodicity         text not null,
  visibility          text not null,
  display_group       text,
  ordinal             int  not null,
  spec                jsonb not null,        -- kind-specific: Expr AST / binding / aggregate config
  clause_ref          jsonb,
  note                text,
  reviewed_by         uuid, reviewed_at timestamptz,
  primary key (covenant_version_id, cell_id)
);
create index on cell (covenant_version_id, ordinal);
create index cell_concept_idx on cell ((spec->>'concept')) where kind = 'source';

-- Materialised edges: derived from `spec` on write. Enables recursive CTEs for
-- cycle checks and reverse-dependency impact analysis without parsing JSON in SQL.
create table cell_dep (
  covenant_version_id uuid not null,
  from_cell           text not null,          -- dependent
  to_cell             text not null,          -- dependency
  lag_quarters        int  not null default 0,
  primary key (covenant_version_id, from_cell, to_cell, lag_quarters),
  foreign key (covenant_version_id, from_cell) references cell (covenant_version_id, cell_id) on delete cascade
);
create index on cell_dep (covenant_version_id, to_cell);   -- reverse lookup: "what breaks if this changes"

create table cell_value (
  calc_run_id uuid not null references calc_run(id) on delete cascade,
  cell_id     text not null,
  period_key  text not null,
  value       numeric(28,10),
  currency    text,
  is_null     boolean not null default false,
  null_reason text,
  status      text not null,                  -- computed|overridden|blocked|not_applicable
  provenance  jsonb not null,
  trace       jsonb not null default '[]',
  inputs      text[] not null default '{}',
  primary key (calc_run_id, cell_id, period_key)
) partition by range (calc_run_id);           -- see note below

create table cell_override ( /* the Override interface, 1:1 */ );

create table classification_decision (
  id uuid primary key, facility_id uuid not null, covenant_id uuid not null,
  cell_id text not null, period_key text not null,
  mode text not null, value numeric(28,10) not null,
  ai_proposal jsonb, rationale text not null,
  decided_by uuid not null, decided_at timestamptz not null default now(),
  superseded_by uuid references classification_decision(id)
);

create table cure_event ( /* the CureEvent interface, 1:1 */ );

create table audit_event (
  seq        bigserial primary key,
  at         timestamptz not null default now(),
  actor_id   uuid, actor_type text not null,     -- 'user'|'system'|'extractor'
  facility_id uuid, entity_type text not null, entity_id text not null,
  action     text not null,                      -- 'fact.corrected','override.created','version.approved',…
  payload    jsonb not null,
  prev_hash  bytea, row_hash bytea not null      -- sha256(prev_hash || canonical_json(payload))
);
```

**Design choices worth defending:**

- **Normalised `cell` rows, not a JSONB blob per version.** Overrides, comments, review flags and `cell_value` rows all need a stable FK target. A blob would force application-side joins on every screen. The `Expr` AST inside `spec` is JSONB because it is a tree that SQL never needs to traverse.
- **`cell_dep` is derived, never hand-maintained.** Written in the same transaction as `cell` from a single `extractEdges(cell): Edge[]` function. Reverse-dependency queries drive both the impact preview and incremental recompute:
  ```sql
  with recursive downstream(cell_id, lag) as (
    select from_cell, lag_quarters from cell_dep
      where covenant_version_id = $1 and to_cell = $2
    union
    select d.from_cell, ds.lag + d.lag_quarters
      from cell_dep d join downstream ds on d.to_cell = ds.cell_id
      where d.covenant_version_id = $1
  ) select distinct cell_id, min(lag) from downstream group by cell_id;
  ```
- **Partitioning `cell_value`.** Not needed on day one. At 100 facilities × 4 covenants × 8 retained quarters × ~70 cells × ~5 instances each ≈ 1.1M rows per full portfolio recompute, and you keep maybe 20 runs per covenant-quarter → single-digit millions. Postgres does not care. Partitioning by run-creation month is cheap insurance for retention/archival and is worth doing before you have customers rather than after.
- **Selective persistence.** Only runs with `published = true` (or that changed `result_status`, or that carry an override) persist full `cell_value` rows. Exploratory what-ifs persist only the run header, the root value, and the `input_fingerprint` — because evaluation is a pure function of the frozen snapshot, any of them can be reconstructed on demand. This roughly 10×s the storage economics with zero loss of auditability.
- **Memoisation by fingerprint.** Before running, compute `input_fingerprint`; if a run with the same fingerprint and same `engine_version` exists, return it. Re-ingesting an unchanged document costs nothing.
- **`numeric(28,10)` everywhere.** Not `float8`, not `money`. `numeric` maps cleanly to `decimal.js` via string round-trip with no representation loss.

---

## 9. Failure modes, performance, and where the metaphor breaks

### 9.1 Performance — the honest numbers

*These are estimates from the shape of the work, not measurements. Nothing has been benchmarked.*

- One covenant graph ≈ 70 cells; expanded over the period lattice ≈ 200–400 cell instances (LTM pulls four quarterly instances per flow source).
- Each instance is a handful of `decimal.js` ops. Estimate 5–15 µs per instance → **2–6 ms per covenant per test date**, single-threaded Node.
- Full portfolio backfill: 100 facilities × 4 covenants × 8 quarters = 3,200 evaluations ≈ **10–20 seconds of CPU**. Irrelevant.

**CPU is not the problem. The problems are:**

1. **PDF ingestion and LLM cost.** Seconds to minutes per document, and a 200-page agreement is a meaningful token bill. Mitigations: cache aggressively by document SHA-256; do definition extraction *once* per agreement, not per quarter; use prompt caching for the long agreement text when running multiple extraction passes over the same document; run the coverage-adversary pass only on the covenant-relevant clauses, not the whole document. This is the dominant unit cost of the product.
2. **Restatement fan-out.** A corrected Q3 2024 operating profit invalidates the LTM cell at Q3'24, Q4'24, Q1'25 and Q2'25, for every covenant on that facility, for every downstream cell. That is ~4 quarters × 4 covenants × 70 cells ≈ 1,100 dirty instances — still trivial to recompute, but the *notification and re-approval* burden is real: previously published, previously approved, possibly already-reported quarters now have new answers. The system must handle this as a workflow (`restates_run_id`, re-approval required, "this quarter was restated" banners on investor reports already issued), not as a cache invalidation. This is the hardest non-technical part of the design.
3. **UI queries pulling full traces.** `cell_value.provenance` and `trace` are JSONB and can be large. The ladder must load lazily — root and `visibility: 'primary'` cells first, children on expand. A naive "select * from cell_value where calc_run_id = $1" on a big graph is a 2 MB payload.
4. **N+1 on the portfolio dashboard.** Showing 100 facilities × 4 covenants requires one query, not 400. Materialised view `portfolio_current` keyed on `(facility_id, covenant_id)` selecting the published run, refreshed on run publication.

### 9.2 Where the spreadsheet metaphor genuinely breaks down

This is the part worth being unsentimental about, because the metaphor is a UI affordance, not a truth.

1. **Time is a second axis and a spreadsheet cell has only one value.** Analysts say "the EBITDA cell" and mean different things depending on whether they are looking at Q2's LTM or Q2's quarterly contribution. The `(cellId, periodKey)` lattice is correct but it is *not* what the metaphor promises. The UI has to work hard — period selector always visible, period stamped on every value, "compare across quarters" as a first-class view — to keep the user oriented.
2. **Qualitative judgement has no cell.** There is no formula for "is this item exceptional or non-recurring". `ClassifiedCell` models the *decision*, not the reasoning. A spreadsheet cannot represent "this number is contested"; neither, really, can a DAG. What the model gives you is a place to attach the human's rationale and the ability to see how much of the answer rests on judgement — which is genuinely better than a spreadsheet, but is not the same as computing it.
3. **Set-valued data hiding behind scalars.** The £500k exceptional cap operates on a *list* and the admission order is undetermined by the agreement. `ItemSetCell` exposes this, but it is a bulge in the model — a cell that is secretly a table. The same problem recurs for baskets, permitted disposals, and permitted indebtedness. If a fund's covenants are basket-heavy, the model strains and you end up wanting a small relational sub-model per basket rather than a cell.
4. **Genuine circularity.** The 20%-of-EBITDA synergy cap is circular under one reading. Spreadsheets solve this with iterative calculation and a tolerance, which is a numerical answer to a *legal* ambiguity. `FixedPointCell` reproduces that capability but does not resolve the ambiguity; the honest product behaviour is to surface it as an interpretation and make the fund choose, with the choice recorded and versioned.
5. **Conditional graph shape.** "If a Permitted Acquisition occurs during the Relevant Period, then…" implies the graph's *shape* changes per period. Dynamic shape would destroy diffability and versioning. The design uses a static superset graph with `appliesWhen` conditions and `not_applicable` statuses, at the cost of every graph carrying nodes that are dormant most quarters. This is the right trade but it makes graphs bigger and ladders noisier than they need to be; the `visibility` field is doing a lot of work to compensate.
6. **Consolidation perimeter.** "The Group" vs "the Obligors" vs "the Restricted Group" vs "Material Companies" — with minority interests, JV equity accounting, and non-guarantor subsidiaries. A flat cell graph has one implicit entity scope per cell (`binding.entityScope`), which handles the common case and will not handle a genuinely multi-entity consolidation with intercompany eliminations. If a fund lends to structures where that matters, this model needs an entity dimension alongside the period dimension — a real, known limit.
7. **Bitemporality is not free.** "What did we believe on 15 August 2025 about Q2 2025?" versus "what do we now believe about Q2 2025?" are different questions with different answers, and the model answers both only because `financial_fact` is bitemporal and `calc_run` snapshots inputs. The UI mostly hides this and that is correct, but any report has to be explicit about which of the two it is showing. Getting this wrong in an investor report is a serious problem.

### 9.3 Product and correctness failure modes

- **⚠️ The gravest one: a confidently wrong definition graph.** QuarterMark's whole pitch is "we don't trust the borrower's number." If the extracted definition is wrong, the product loudly and precisely contradicts the borrower with full clause citations — and is wrong. Mitigations, all of which must ship: (a) the variance panel is framed as *a question to put to the borrower*, never as an assertion of breach; (b) no automated breach notice, ever — a human sends it; (c) the disputed cell always shows the clause text next to it so the analyst checks the source, not the software; (d) when the borrower's methodology is confirmed correct, that becomes an `Interpretation` on the covenant version so it never re-fires; (e) sustained variance on the same cell across quarters triggers a "re-review this definition" prompt.
- **Extraction quality on scanned or badly formatted accounts.** Small borrowers submit Excel-exported PDFs with merged cells, footnote markers inside numbers, and inconsistent sign conventions. Sign convention is the sleeper bug: `sign: 'as_reported' | 'negate'` per source cell is necessary but not sufficient, because the same borrower can flip conventions between periods. Mitigation: a per-fact sanity band (depreciation should be negative and within ±40% of the prior quarter) and a hard block on sign flips.
- **Unit scale errors (£'000 vs £).** Catastrophic and easy: a leverage ratio of 3.60x becomes 3,600x or 0.0036x. `scale_applied` is stored per fact; the balance-sheet-balances check catches most; a magnitude check against the prior quarter catches the rest.
- **Date arithmetic.** Non-calendar fiscal year ends, 52/53-week calendars, test dates falling on non-business days, amendments effective mid-quarter, "the Test Date falling on or immediately after". All dates are `date` (no timezone) and all arithmetic goes through the calendar module. *This is where I would expect the first production bug.*
- **Equity cure double counting.** Applying a cure to both EBITDA and net debt, or letting a cure's deemed effect persist five quarters instead of four, or counting a cure against the wrong 4-quarter window. Mitigated by the closed-form `minimum_required` and by retaining both pre- and post-cure tests, which makes the arithmetic visible rather than implicit.
- **Amendment drift.** The fund forgets to send you Amendment No. 3. Mitigation: a document-completeness check (amendments are usually sequentially numbered; a gap in the sequence is an alert) and a quarterly "confirm the document set is complete" attestation on the compliance workflow.
- **Solo-founder maintenance.** An expression language, a period calendar, an archived-kernel registry and a bitemporal fact store are each a small system. The discipline that makes this survivable: the kernel is pure and dependency-light; everything I/O-shaped lives outside it; golden-file tests per kernel version; the replay-drift CI job as the regression net. If any of those three slip, the design becomes a liability rather than an asset.
- **Over-modelling.** The temptation is to model every basket and every proviso in the agreement. The discipline is to model only what feeds a test cell, and to mark everything else `no_calc_effect` in the coverage check. A 400-cell graph nobody reviews is worse than a 70-cell graph everybody does.

### Key decisions
- The evaluation DAG is over cell INSTANCES (cellId, periodKey), not over cells. Lagged references (LTM, cure carry-forward, prior-quarter comparisons) are legal at cell level and acyclic at instance level. Acyclicity is checked exactly by running Tarjan SCC on the lag-0 edge subgraph only.
- Formulas are a serialisable Expr AST, never eval'd strings or code. This makes them unit-checkable, diffable across amendments, renderable back to English for review and audit, and safe for a security review.
- Nulls never become zeros. A missing or low-confidence input propagates a typed nullReason and the covenant test resolves INDETERMINATE. There is no path from missing data to PASS.
- Caps, carve-outs and rejections are first-class visible cells, not hidden arithmetic. The engine auto-emits a `.disallowed` sibling for every cap node; excluded balances (IFRS 16 leases, shareholder notes) appear valued and explicitly zeroed rather than omitted.
- Qualitative judgement gets its own node kind (ClassifiedCell) plus a versioned Interpretation record, so 'what part of this answer a human decided' is a queryable property of every quarter.
- calc_run.input_snapshot stores frozen COPIES of every input value, not references to fact rows. Combined with a pinned pure engine_version and covenant_version, replaying any historical quarter is a deterministic pure function call.
- Amendments are reviewed as a cell-level GraphDiff with an unmatched-text coverage list, not as a fresh graph. A Postgres GIST exclusion constraint makes it structurally impossible for two approved covenant versions to govern the same test date.
- Overrides are an overlay, never a mutation: the engine always computes the underlying value and retains it in provenance.originalComputed, with four-eyes approval required for any cell that can reach a test cell.
- Both a pre-cure and a post-cure test result are persisted; a cured breach reports as `breach_cured`, never collapsed into `pass`.
- The unit checker forbids adding money of differing currencies without an explicit, clause-cited fx node with a declared FxBasis. No implicit conversion anywhere.
- Primary analyst UI is an indented calculation ladder (the mental model finance people already have), with node-link graph relegated to a secondary map view.
- Variance vs the borrower is attributed by exact Shapley over the differing cells when there are 12 or fewer (2^n counterfactual re-evaluations of a pure microsecond-scale function), degrading to a declared sequential bridge above that — because ratio deltas are not additive.
- The calc kernel is generic and covenant-agnostic, so Valuation, fund-accounting waterfalls and underwriting base cases can reuse it as other GraphKinds without a rewrite.

### Trade-offs
- AST over embedded formula strings: gains unit checking, diffability, English rendering and security-review safety; costs an authoring UI that must construct ASTs and a restricted infix parser that will reject expressions users can type.
- Static superset graph with appliesWhen conditions, rather than dynamic per-period graph shape: preserves diffability and versioning across amendments, but every graph carries dormant nodes most quarters, making ladders noisier and relying heavily on the visibility field.
- Normalised cell rows in Postgres rather than a JSONB graph blob: enables stable FK targets for overrides, comments, review flags and cell_values, at the cost of more rows and a materialised cell_dep edge table that must be regenerated in the same transaction on every write.
- Freezing input values (not references) in every run snapshot: guarantees exact replay, but duplicates data and means a fact correction does not retroactively change history unless someone explicitly restates the run — which is correct but generates workflow burden.
- Archiving every published kernel version forever: guarantees reproducibility, but is ongoing maintenance for a solo founder. Mitigated by keeping the kernel tiny, pure and dependency-light, and by bumping the version only on genuine semantics changes.
- ItemSetCell for capped baskets: correctly exposes that admission order matters when a cap binds, but is a bulge in the model — a cell that is secretly a table — and does not generalise cleanly to basket-heavy agreements.
- FixedPointCell for circular drafting: reproduces the spreadsheet's iterative-calculation capability, but a numerical fixed point is not a resolution of a legal ambiguity; the honest behaviour is to surface it as an interpretation and make the fund choose.
- Selective persistence of cell_value rows (only published/changed/overridden runs): roughly 10x better storage economics with no audit loss because evaluation is pure, but exploratory runs must be reconstructed on demand rather than read back.
- One implicit entity scope per source cell: handles group/obligor/restricted-group cleanly and cheaply, but cannot represent a genuine multi-entity consolidation with intercompany eliminations and minority interests without adding an entity dimension alongside the period dimension.
- Four-eyes approval on overrides and version publication: essential credibility for institutional buyers, but adds friction that a two-person fund will resent and will ask to disable.

### Failure modes
- A confidently wrong definition graph. The product's entire pitch is independent recalculation; if the extracted definition is wrong, it precisely and citably contradicts the borrower while being wrong. Mitigations must ship: variance framed as a question not an assertion, no automated breach notices, clause text always adjacent to the disputed cell, confirmed borrower methodology promoted to a versioned Interpretation, and repeated same-cell variance triggering a definition re-review.
- Unit-scale errors (£'000 vs £) turning 3.60x into 3,600x or 0.0036x. Caught by per-fact scale_applied, the balance-sheet-balances check, and prior-quarter magnitude bands — but this is the highest-severity silent arithmetic failure in the system.
- Sign-convention flips between reporting periods for the same borrower (depreciation shown positive one quarter, bracketed the next). SourceCell.sign is per-cell and static; a mid-life flip defeats it. Needs a hard block on sign changes plus sanity bands.
- Restatement fan-out as a workflow problem, not a compute problem. Correcting an early quarter invalidates ~1,100 cell instances across four quarters and four covenants — trivially recomputed, but those quarters may already be published, approved, and included in issued investor reports. Requires restates_run_id, re-approval, and restatement banners on already-issued reports.
- Date arithmetic: non-calendar fiscal year ends, 52/53-week and 4-4-5 calendars (a 53-week LTM is arguably overstated), test dates on non-business days, amendments effective mid-quarter, 'the Test Date falling on or immediately after'. This is where I would expect the first production bug.
- Equity cure mis-modelling: applying a cure to both EBITDA and net debt, letting the deemed effect persist the wrong number of quarters, or counting cures against the wrong rolling window. Understating leverage in the borrower's favour is the likely direction of error.
- Amendment drift — the fund never sends Amendment No. 3 and the graph silently governs by stale terms. Needs document-sequence gap detection plus a quarterly completeness attestation, and even then it is a trust boundary outside the system.
- Extraction quality on scanned, Excel-exported or badly formatted small-borrower accounts: merged cells, footnote markers inside figures, inconsistent captions. Per-borrower caption maps improve this over time but the first quarter with any borrower is expensive.
- PDF ingestion and LLM token cost as the dominant unit economics, not CPU. A 200-page agreement with multiple extraction passes is a meaningful bill; mitigated by SHA-256 document caching, one-time definition extraction, prompt caching over the agreement text, and restricting the coverage-adversary pass to covenant-relevant clauses.
- UI payload size: cell_value.provenance and trace are JSONB and a naive full-run fetch is multi-megabyte. The ladder must load root and primary-visibility cells first and expand children lazily; the portfolio dashboard needs a materialised view, not 400 queries.
- Solo-founder maintenance load: an expression language, a period calendar, an archived-kernel registry and a bitemporal fact store are four small systems. If kernel purity, golden-file tests per version, or the replay-drift CI job slips, the design becomes a liability rather than an asset.
- Over-modelling: a 400-cell graph nobody reviews is worse than a 70-cell graph everybody does. Only model what feeds a test cell; everything else must be explicitly marked no_calc_effect in the coverage check.
- Data residency on LLM inference over agreement text. A US-hosted model endpoint processing UK/EU credit agreements is a question institutional diligence will ask; it needs an in-region endpoint or an explicit contractual carve-out, not hand-waving.
- Hash-chained audit_event is only tamper-evident against an attacker who cannot also rewrite the chain. It is meaningful only if the daily head hash is anchored outside the database (object-locked store plus notification to the fund). Overclaiming 'immutable audit log' in a security pack is a credibility risk.
