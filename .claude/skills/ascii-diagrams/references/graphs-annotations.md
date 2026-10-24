# Directed Graphs, Code Annotations, and UI Sketches

## Directed Graphs

Use for: dependency graphs, DAGs, compilation pipelines.

**Build dependency graph:**
```
  +-----+     +------+     +--------+
  | lib |<----| app  |---->| config |
  +--+--+     +--+---+     +--------+
     |           |
     v           v
  +--+--+     +--+----+
  |utils|     | tests |
  +-----+     +-------+
```

## Code Annotations

Use for: pointing at specific parts of code to explain them.

**Annotated register layout:**
```
  31            24 23            16 15             8 7             0
  +----------------+----------------+----------------+---------------+
  | flags          | mode           | reserved       | opcode        |
  +----------------+----------------+----------------+---------------+
    |                |                                  |
    +-- N/Z/C/V      +-- rounding mode                  +-- command id
```

**File format annotation (from Chromium):**
```
  // +---------------------+
  // |      Header         |
  // +---------------------+
  // |      Part           |
  // +---------------------+
  // |      Part           |
  // +---------------------+
  // |      ...            |
  // +---------------------+
```

## Before/After Comparisons

Use for: refactoring visualization, migration plans, optimization results.

**Three-scenario comparison (from TensorFlow):**
```
  0) Before         1) After Fusion    2) Combined
     p                  p                  p
     |                  |                  |
     v                  v              +---v---+
     A                  A              | A     |
    / \                 |              | / \   |
   |   |           +----+----+        | B   C |
   v   v           | / \     |        | tuple |
   B   C           | B   C   |        +---+---+
    \ /            | tuple   |            |
    v v            +----+----+           / \
   ROOT                 |           gte_b   gte_a
                       / \
                  gte_b   gte_c
```

## UI Sketches

Use for: interface mockups, layout planning.

**Simple UI layout:**
```
  +------------------------------------------+
  | [Logo]    Navigation          [User Menu] |
  +------------------------------------------+
  |          |                                |
  | Sidebar  |         Main Content           |
  |          |                                |
  | - Item 1 |   +--------+  +--------+      |
  | - Item 2 |   | Card 1 |  | Card 2 |      |
  | - Item 3 |   +--------+  +--------+      |
  |          |                                |
  +----------+--------------------------------+
  | Footer                                    |
  +------------------------------------------+
```
