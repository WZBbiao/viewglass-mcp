# viewglass-mcp

MCP Server for [Viewglass](https://github.com/WZBbiao/viewglass) iOS UI inspection.
Exposes 16 tools for AI agents — bundles the `viewglass` CLI binary, no separate install required.

## For AI Agents

Give this link to any AI agent to set up the full stack autonomously:

```
https://raw.githubusercontent.com/WZBbiao/viewglass-mcp/main/AGENT.md
```

The agent will configure the MCP client, add ViewglassServer to the iOS project,
and verify the connection — no manual steps required.

## Tools

| Tool | Description |
|---|---|
| `ui_snapshot` | Capture the full view hierarchy (JSON tree). Fast and cheap. |
| `ui_query` | Find nodes by accessibility ID, class name, or OID. |
| `ui_attr_get` | Get runtime attributes of a node by OID. |
| `ui_tap` | Tap a node and return post-action hierarchy. |
| `ui_scroll` | Scroll a scroll view and return post-action hierarchy. |
| `ui_set_attr` | Set an attribute on a node at runtime (live, no recompile). |
| `ui_invoke` | Call any ObjC selector on any node — the highest-leverage tool. |
| `ui_wait` | Poll until a node appears, disappears, or an attribute matches. |
| `ui_assert` | Assert visibility, text, count, or attribute — fails as MCP error. |
| `ui_scan` | List all running Viewglass sessions. |
| `ui_screenshot` | Capture a PNG of the full screen or a specific node. |
| `ui_input` | Type text into a UITextField / UITextView. |
| `ui_swipe` | Swipe a node in a direction. |
| `ui_long_press` | Long-press a node. |
| `ui_dismiss` | Dismiss a presented view controller. |
| `compare_with_design` | Screenshot device + return Figma URL for Vision diff. |

## Requirements

- iOS app with [ViewglassServer](https://github.com/WZBbiao/ViewglassServer) running (simulator or device).
- No other dependencies — the `viewglass` CLI binary is bundled in this package.

## Usage

### Claude Desktop / any MCP client

```json
{
  "mcpServers": {
    "viewglass": {
      "command": "npx",
      "args": ["-y", "viewglass-mcp"]
    }
  }
}
```

Or install globally for faster startup:

```bash
npm install -g viewglass-mcp
```

```json
{
  "mcpServers": {
    "viewglass": {
      "command": "viewglass-mcp"
    }
  }
}
```

### Session

All tools accept an optional `session` in `bundleId@port` format (e.g. `com.example.App@47164`).
Omit it and the first running app is auto-detected.

### Override binary

Set `VIEWGLASS_BIN` to use a specific binary (development / CI):

```bash
VIEWGLASS_BIN=/path/to/viewglass npx viewglass-mcp
```

## Development

```bash
npm install
npm run build          # compile TypeScript
npm test               # unit tests (Vitest)
```

### E2E tests

1. Start your iOS simulator with ViewglassServer enabled.
2. Update `SESSION` in `src/__tests__/e2e.ts`.
3. Run:

```bash
VIEWGLASS_BIN=/path/to/viewglass npm run test:e2e
```

## Architecture

```
src/
  runner.ts          # CLI runner, binary resolution, injectable ExecFn
  index.ts           # MCP Server — registers all 16 tools
  tools/
    ui_snapshot.ts   ui_query.ts      ui_attr_get.ts
    ui_tap.ts        ui_scroll.ts     ui_set_attr.ts
    ui_invoke.ts     ui_wait.ts       ui_assert.ts
    ui_scan.ts       ui_screenshot.ts ui_input.ts
    ui_swipe.ts      ui_long_press.ts ui_dismiss.ts
    compare_with_design.ts
  __tests__/
    *.test.ts        # unit tests (mock ExecFn injection)
    e2e.ts           # e2e tests against live simulator

bin/                 # bundled viewglass CLI binaries (not in git, in npm)
  viewglass-darwin-arm64
  viewglass-darwin-x64
.viewglass-cli-version   # pins the CLI version bundled in this release
```

Binary resolution order: `VIEWGLASS_BIN` env → `bin/` bundled binary → `viewglass` in $PATH.
