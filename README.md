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
| `ui_snapshot` | Capture an agent-first UI snapshot with summary, groups, searchable nodes, and optional rawTree. |
| `ui_attr_get` | Get runtime attributes of a node by OID. |
| `ui_tap` | Tap a node by exact `oid` from `ui_snapshot`. Supports UIControl, gesture-backed views, UITableViewCell, and UICollectionViewCell. |
| `ui_scroll` | Scroll a scroll view by exact `oid` from `ui_snapshot` and return an execution summary. |
| `ui_set_attr` | Set an attribute on a node at runtime (live, no recompile). |
| `ui_invoke` | Call any ObjC selector on any node — the highest-leverage tool. |
| `ui_wait` | Poll until a node appears, disappears, or an attribute matches. |
| `ui_assert` | Assert visibility, text, count, or attribute — fails as MCP error. |
| `ui_scan` | List all running Viewglass sessions. |
| `ui_connect` | Resolve and pin the active session to a specific app bundle id. |
| `ui_screenshot` | Capture a PNG of the full screen or a specific node. |
| `ui_input` | Type text into a UITextField / UITextView by exact `oid` from `ui_snapshot` and return an execution summary. |
| `ui_swipe` | Swipe a node in a direction. |
| `ui_long_press` | Long-press a node. |
| `ui_dismiss` | Dismiss a presented view controller by exact `oid` from `ui_snapshot` and return an execution summary. |
| `compare_with_design` | Screenshot device + return Figma URL for Vision diff. |

## Recommended agent workflow

For page navigation, settings flows, tab switching, and custom UI:

1. Start with `ui_snapshot`
   - Use it to understand the current page, visible labels, groups, and likely action targets.
   - Treat it as the source of truth for "where am I right now?".
2. Then use execution tools with exact `oid`
   - Extract the exact target `oid` from `ui_snapshot.groups` or `ui_snapshot.nodes`.
   - `ui_tap`, `ui_scroll`, `ui_input`, and `ui_dismiss` all require `oid`.
   - Prefer user-visible labels in the snapshot over UIKit private class guesses.
3. Use `ui_wait` or another `ui_snapshot` to verify transitions
   - Do not assume a tap has finished a navigation animation unless you verify it.
4. Use `ui_attr_get` only after the correct node is known
   - This is for reading precise runtime values such as text color or font.

Avoid this pattern:

- guessing `UITabBar`, `UITabBarButton`, `UIButton`, or private UIKit classes first
- passing guessed labels to `ui_tap` instead of first locating an exact `oid` in `ui_snapshot`
- trying to infer the current page from repeated locator guesses instead of starting with `ui_snapshot`
- taking a screenshot before checking the structured snapshot, unless the task is explicitly visual

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

### Debug logging

All logs go to `stderr` by default so they do not corrupt the MCP `stdout` protocol stream.

```bash
VIEWGLASS_MCP_LOG=1 npx viewglass-mcp
```

Optional flags:

- `VIEWGLASS_MCP_LOG_TOOL=1`: log each tool call start/end summary
- `VIEWGLASS_MCP_LOG_CLI=1`: log each internal `viewglass` CLI command, duration, and exit status
- `VIEWGLASS_MCP_LOG_FILE=/tmp/viewglass-mcp.log`: write logs to a file instead of `stderr`
- `VIEWGLASS_MCP_LOG_SPLIT_BY_SESSION=1`: when `VIEWGLASS_MCP_LOG_FILE` is set, write one file per session

When session logging is enabled, each line includes `session=<bundleId@port>` when the tool/CLI call has one.  
With file splitting enabled, examples look like:

- `/tmp/viewglass-mcp.log.com.example.app@47175.log`
- `/tmp/viewglass-mcp.log.com.wzb.ViewglassDemo@47164.log`

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
    ui_snapshot.ts                    ui_attr_get.ts
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

Binary resolution order: `VIEWGLASS_BIN` env → `viewglass` in $PATH → `bin/` bundled binary.
