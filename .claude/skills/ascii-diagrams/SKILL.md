---
name: ascii-diagrams
description: Draw compact text diagrams for code and docs.
when_to_use: Use when the user asks to draw or clarify structure, flow, layout, topology, state, memory, or tables in plain text, code comments, READMEs, ADRs, or technical docs.
---

# ASCII Diagrams

Create compact text diagrams that survive diffs and map to real code or prose.

## Overview

- Use a diagram only when it explains structure or flow faster than linear text.
- Keep the skill focused on plain text diagrams, not full diagramming languages.
- Treat `references/` as the pattern library and `SKILL.md` as the runtime spec.

## Principles

- Pick the closest pattern from `references/` before drafting.
- Reuse real identifiers from the user prompt, surrounding code, or nearby docs.
- Show the minimum structure needed to answer the request.
- Keep alignment stable in monospace text.
- Make a minimal best-effort draft when details are missing.
- State assumptions briefly only when they affect interpretation.

## Output Contract

Respond in this order:

1. Optional one-line title.
2. Diagram in a fenced `text` block.
3. `1-3` short bullets explaining how to read it.

Do not add extra prose before or after that structure unless the user asks for more.

## ASCII vs Unicode

- Default to plain ASCII.
- Use ASCII characters such as `-`, `|`, `+`, `>`, `<`, `/`, and `\` unless a better fit is required.
- Use Unicode only when the user explicitly asks for it, or the destination is clearly rendered Markdown/README and Unicode improves readability.
- Do not use decorative Unicode.

## Comment Formatting

- In code comments, preserve the host comment prefix on every line.
- Keep alignment valid after adding `#`, `//`, `*`, or similar prefixes.
- Prefer ASCII in code comments unless the user explicitly asks for Unicode.

## Exclusions

- Do not output Mermaid, PlantUML, or SVG unless explicitly requested.
- Do not output decorative Unicode unless explicitly requested.
- Do not turn the response into generic ASCII art.

## References

Match the request to the closest pattern in `references/`: flowcharts, state machines, trees, data structures, network topology, sequences/tables, or graphs/annotations.
