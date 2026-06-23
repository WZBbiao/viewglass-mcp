# viewglass-mcp

MCP Server for [Viewglass](https://github.com/WZBbiao/viewglass) iOS UI inspection.
Exposes 15 tools for AI agents — bundles the `viewglass` CLI binary, no separate install required.

## Install the Viewglass skill

Like `xcodebuildmcp`, ViewglassMCP works best when its skill is installed into the AI client skill directory and the project `AGENTS.md` is updated.

When ViewglassMCP starts normally, it now bootstraps itself automatically like `xcodebuildmcp`:

- installs the ViewglassMCP skill into detected client skill directories (for example `.claude/skills` and `.agents/skills`)
- appends the Viewglass guidance line to the project `AGENTS.md`
- creates `.viewglassmcp/config.yaml`, `.viewglassmcp/README.md`, and `.viewglassmcp/recipes.yaml` in the project root

`viewglass-mcp init --force` still exists as an explicit repair/bootstrap command, but it should not be required for the normal MCP path.

## Tools

| Tool | Description |
|---|---|
| `ui_snapshot` | Capture an agent-first UI snapshot with summary, recommended locators, navigation candidates, matched recipes, and optional rawTree. |
| `ui_attr_get` | Get runtime attributes by stable locator or volatile runtime OID. |
| `ui_tap` | Tap by stable locator first, with OID fallback. Supports UIControl, gesture-backed views, UITableViewCell, and UICollectionViewCell. |
| `ui_scroll` | Scroll by stable locator first, with OID fallback; resolves wrapper/cell targets to a real scroll view. |
| `ui_set_attr` | Set an attribute on a node at runtime (live, no recompile). |
| `ui_invoke` | Call any ObjC selector on any node — the highest-leverage tool. |
| `ui_wait` | Poll until a node appears, disappears, or an attribute matches. |
| `ui_assert` | Assert visibility, text, count, or attribute — fails as MCP error. |
| `ui_connect` | Resolve and pin the active session to a specific app bundle id. |
| `ui_screenshot` | Capture a PNG of the full screen or a specific node. |
| `ui_input` | Type text into a UITextField / UITextView by stable locator first, with OID fallback. |
| `ui_swipe` | Swipe a node in a direction. |
| `ui_long_press` | Long-press a node. |
| `ui_dismiss` | Dismiss a presented view controller by stable locator first, with OID fallback. |
| `compare_with_design` | Screenshot device + return Figma URL for Vision diff. |

## Recommended agent workflow

For page navigation, settings flows, tab switching, and custom UI:

1. Start with `ui_snapshot`
   - Default output is a small action index: visible labels, groups, `recommendedLocator`, navigation candidates, and likely action targets.
   - For textless settings/profile icons, inspect `summary.navigationCandidates` and `areaHint` such as `topRight`.
   - Use `ui_screenshot` for visual layout and `ui_attr_get` for long text or detailed attributes after you know the stable locator.
   - Use `mode=fullIndex` only when the default action index is insufficient.
   - Treat it as the source of truth for "where am I right now?".
2. Then use execution tools with stable locators
   - Prefer `recommendedLocator`, especially `#accessibilityIdentifier`.
   - `oid` and `lastKnownOid` are volatile runtime handles. They are acceptable cache hints, but replay must try stable locator first.
   - If source code is available and the target lacks a stable locator, add an `accessibilityIdentifier` to the component before relying on text/class/oid.
3. Use `ui_wait` or another `ui_snapshot` to verify transitions
   - Do not assume a tap has finished a navigation animation unless you verify it.
4. Use `ui_attr_get` only after the correct target is known
   - This is for reading precise runtime values such as text color or font.

Avoid this pattern:

- guessing `UITabBar`, `UITabBarButton`, `UIButton`, or private UIKit classes first
- saving only an `oid` in a recipe without a stable locator or success check
- trying to infer the current page from repeated locator guesses instead of starting with `ui_snapshot`
- taking a screenshot before checking the structured snapshot, unless the task is explicitly visual

## Project-local experience memory

For repeated flows, keep project-local experience under:

- `.viewglassmcp/README.md`
- `.viewglassmcp/recipes.yaml`
- `.viewglassmcp/config.yaml`

These files are maintained by the agent after successful live runs.
Use `config.yaml` for stable project defaults like the app bundle identifier.
Use `recipes.yaml` for reusable target-finding recipes. It may keep `lastKnownOid`
as a cache hint, but durable identity should be stable locator signals.

Recommended config / recipe signals:

- `controllerHints`
- `groupRole`
- `searchableTextAny`
- `accessibilityIdAny`
- `classHints`
- `areaHint`
- `success`
- `lastKnownOid` only as a volatile cache hint

Templates are included in this package under:

The bundled `recipes.yaml` is intentionally empty and generic. Agents should only write project-specific recipes after successful live runs in the current project.


- `templates/.viewglassmcp/README.md`
- `templates/.viewglassmcp/recipes.yaml`

Agent-first rule:

- the agent should create `.viewglassmcp/` automatically inside the current project when a task is likely to repeat
- after a reusable live task succeeds, the agent must update `.viewglassmcp/recipes.yaml` in the same session before finishing the task
- on later runs, the agent should consult `.viewglassmcp/recipes.yaml` before fallback exploration

## Requirements

- iOS app with [ViewglassServer](https://github.com/WZBbiao/ViewglassServer) running (simulator or device).
- No other dependencies — the `viewglass` CLI binary is bundled in this package.

## Usage

### Claude Desktop / any MCP client

If you installed the package globally, `viewglass-mcp` starts the MCP server by default and also supports `viewglass-mcp init`.

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
If omitted, ViewglassMCP checks `.viewglassmcp/config.yaml` for `sessionDefaults.bundleId` plus optional selectors.
When multiple sessions match the same bundle ID, ViewglassMCP does not guess; provide `session`, `port`, `deviceIdentifier`, `deviceName`, or `deviceType`, or set them under `sessionDefaults`.
Prefer stable selectors such as `deviceIdentifier`, `deviceName`, and `deviceType`; treat `session` and `port` as last-known runtime hints because they can change after relaunch.

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

Export the latest contiguous run from a session log into a replay-oriented flow draft:

```bash
npm run export:flow -- /tmp/viewglass-mcp.log.com.example.app@47175.log
```

Optional flags:

- `-- --all-runs`: export every detected run in the log file
- `-- --include-screenshots`: keep screenshot steps in the draft
- `-- --gap-ms 120000`: change the run split threshold

Initialize project-local experience memory in a target project:
There is no required bootstrap command. The agent should create and maintain `.viewglassmcp/` automatically.

When session logging is enabled, each line includes `session=<bundleId@port>` when the tool/CLI call has one.  
With file splitting enabled, examples look like:

- `/tmp/viewglass-mcp.log.com.example.app@47175.log`
- `/tmp/viewglass-mcp.log.com.example.app@47164.log`

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
