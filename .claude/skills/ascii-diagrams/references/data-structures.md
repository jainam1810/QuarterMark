# Data Structures and Memory Layouts

Use for: packet formats, struct layouts, buffer organization, bit interpretation.

**Struct/packet layout with byte offsets:**
```
  Offset  0         4         8        12        16
          +---------+---------+---------+---------+
          |  magic  |  version|  flags  |  length |
          | (uint32)| (uint16)| (uint16)| (uint32)|
          +---------+---------+---------+---------+
          |                                       |
          |            payload (variable)          |
          |                                       |
          +---------------------------------------+
```

**Linked list (from Linux kernel patterns):**
```
  +------+    +------+    +------+
  | head |--->| node |--->| node |--->NULL
  | data |    | data |    | data |
  +------+    +------+    +------+
```

**Stack/queue:**
```
  TOP --> +-------+
          | item3 |
          +-------+
          | item2 |
          +-------+
          | item1 |     BOTTOM
          +-------+
```

**Bit fields and register layouts:**
```
  31  30  29  28 | 27  26  25  24 | 23 ... 16 | 15 ... 8 | 7 ... 0
  +---+---+---+--+---+---+---+---+-----------+----------+---------+
  | N | Z | C | V|   |   |   |   |           |          |         |
  +---+---+---+--+---+---+---+---+-----------+----------+---------+
  |    Flags     |   Reserved    |   Type    |  Length   | Opcode  |
```

**Key rules:**
- Show byte offsets when relevant
- Label field sizes (bytes, bits)
- Use consistent box widths for same-size fields
- Mark variable-length fields explicitly
