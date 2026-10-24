# Sequences, Timelines, and Tables

## Sequence Diagrams

Use for: request/response flows, event ordering, multi-actor interactions.

**Request sequence:**
```
  Client          Server          Database
    |                |                |
    |-- GET /user -->|                |
    |                |-- SELECT * --> |
    |                |<-- rows -------|
    |<-- 200 OK -----|                |
    |                |                |
```

**Timeline with events:**
```
  t=0     t=100ms   t=200ms   t=500ms   t=1s
  |         |         |         |         |
  boot    ready    first-req  cache-hit  steady
```

## Tables

Use for: comparison matrices, configuration options, API endpoints.

**Simple table:**
```
  Method   | Path         | Handler        | Auth
  ---------|--------------|----------------|------
  GET      | /api/users   | list_users     | yes
  POST     | /api/users   | create_user    | yes
  GET      | /api/health  | health_check   | no
```

**Compact table:**
```
  Status | Meaning
  -------|--------------------
  200    | OK
  400    | Bad Request
  401    | Unauthorized
  404    | Not Found
  500    | Internal Server Error
```

**Key rules:**
- Align column separators `|`
- Use `-` row under headers
- Keep consistent column widths per column
