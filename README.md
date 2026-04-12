# viewglass-mcp

MCP Server that exposes the [Viewglass](https://github.com/WZBbiao/lookin) iOS UI inspection CLI as structured tools for AI agents.

## Tools

| Tool | Description |
|---|---|
| `ui_snapshot` | Capture the full view hierarchy (JSON tree). Fast and cheap. |
| `ui_query` | Find nodes by accessibility identifier, class name, or OID. |
| `ui_attr_get` | Get runtime attributes of a node by OID. |
| `ui_tap` | Tap a node and return post-action hierarchy. |
| `ui_scroll` | Scroll a scroll view and return post-action hierarchy. |
| `ui_set_attr` | Set an attribute on a node at runtime (live, no recompile). |
| `compare_with_design` | Screenshot device + return Figma URL for Vision diff. |

## Requirements

- **Viewglass binary** in PATH, or set `VIEWGLASS_BIN` env var.
- ViewglassDemo (or your app with Viewglass enabled) running on a simulator.

## Usage

### In Claude Desktop / any MCP client

```json
{
  "mcpServers": {
    "viewglass": {
      "command": "npx",
      "args": ["-y", "viewglass-mcp"],
      "env": {
        "VIEWGLASS_BIN": "/path/to/viewglass"
      }
    }
  }
}
```

### Session

All tools accept an optional `session` parameter in `bundleId@port` format (e.g. `com.example.App@47164`). If omitted, the first running app is auto-detected via `viewglass apps list`.

## Development

```bash
npm install
npm run build          # compile TypeScript
npm test               # unit tests (Vitest)
npm run test:e2e       # e2e tests against live simulator
```

### Running e2e tests

1. Start your iOS simulator with Viewglass enabled.
2. Update `SESSION` constant in `src/__tests__/e2e.ts` to match your session.
3. Run:

```bash
VIEWGLASS_BIN=/path/to/viewglass npm run test:e2e
```

## Architecture

```
src/
  runner.ts          # CLI runner with injectable ExecFn for testability
  index.ts           # MCP Server — registers all 7 tools
  tools/
    ui_snapshot.ts
    ui_query.ts
    ui_attr_get.ts
    ui_tap.ts
    ui_scroll.ts
    ui_set_attr.ts
    compare_with_design.ts
  __tests__/
    *.test.ts          # Vitest unit tests (mock ExecFn injection)
    e2e.ts             # E2E tests against real simulator
```

All tools use dependency injection (`ExecFn`) so they can be unit-tested without spawning real processes.
