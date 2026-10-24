# ascii-diagrams-skill

Create professional ASCII diagrams for code comments, documentation, and technical communication.

Based on the CHI'24 research paper [*"Taking ASCII Drawings Seriously: How Programmers Diagram Code"*](https://hayatpur.dev/papers/ascii.pdf) — analyzing 2,156 real diagrams from Linux, Chromium, LLVM, and TensorFlow.

## Install

```
npx skills add HelioFernandes404/ascii-diagrams-skill
```

Install for Codex only:

```bash
npx skills add HelioFernandes404/ascii-diagrams-skill -a codex
```

Install for Claude Code only:

```bash
npx skills add HelioFernandes404/ascii-diagrams-skill -a claude-code
```

Install globally for Codex without prompts:

```bash
npx skills add HelioFernandes404/ascii-diagrams-skill -a codex -g -y
```

`--skill` is not needed because this repository exposes a single skill from the root `SKILL.md`.

## What it covers

| Category | Reference |
|----------|-----------|
| Flowcharts | `references/flowcharts.md` |
| State machines | `references/state-machines.md` |
| Trees & hierarchies | `references/trees.md` |
| Data structures & memory | `references/data-structures.md` |
| Network & architecture | `references/network-topology.md` |
| Sequences & tables | `references/sequences-tables.md` |
| Graphs, annotations & UI | `references/graphs-annotations.md` |

## Example

```
  +----------+    +----------+    +----------+
  | exporters|--->| vmagent  |--->|  vmtsdb  |
  +----------+    +----+-----+    +----+-----+
                       |               |
                  +----v-----+    +----v-----+
                  | vmalert  |--->|alertmgr  |
                  +----------+    +----------+
```

## License

CC-BY-4.0 — based on research by Hayatpur et al. (UCSD).
