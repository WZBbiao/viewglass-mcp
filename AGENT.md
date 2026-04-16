# Viewglass — Agent Setup Instructions

You are an AI agent. Read this file and execute all steps autonomously.
Ask the user only when a decision cannot be inferred from the project files.

Important: if this project uses ViewglassMCP, prefer the installed ViewglassMCP skill over this raw file when it is available in the client skill directory.

## What is Viewglass

Viewglass is an iOS runtime UI inspector for AI agents.
It gives you 15 MCP tools to read the view hierarchy, inspect nodes, tap, scroll,
input text, invoke any ObjC method, assert state, and take screenshots — all
against a live running iOS app.

`ui_tap` supports semantic taps on UIControl, gesture-backed views,
UITableViewCell, and UICollectionViewCell, including labels nested inside cells.

Stack:
- **viewglass-mcp** — MCP server (this npm package, bundles the CLI binary)
- **ViewglassServer** — iOS library embedded in the app (Debug builds only)

## Operating discipline

Use these tools in this order unless the task is trivial and the target is already certain.

1. `ui_snapshot`
   - Always start here for navigation, tab switching, settings pages, custom UI, and any unknown screen.
   - Use the snapshot summary, groups, nodes, and visible labels to understand the current page.
2. Resolve an exact target `oid` from `ui_snapshot`
   - Prefer `groups.items[].oid` and `nodes[].oid` / `actionTargetOid`.
   - Prefer user-visible labels over UIKit private class names.
   - Do not guess `UITabBar`, `UITabBarButton`, `UIButton`, or private wrapper classes unless the snapshot already proves they are the right target.
3. Execute using exact `oid`
   - `ui_tap`, `ui_scroll`, `ui_input`, and `ui_dismiss` require the exact `oid` you resolved from `ui_snapshot`.
4. `ui_wait` or another `ui_snapshot`
   - Use this to confirm navigation, modal transitions, and list updates.
5. `ui_attr_get`
   - Use only after the correct target has been located.

Avoid these anti-patterns:

- starting with repeated locator guesses to figure out which page is currently visible
- taking screenshots before using the structured snapshot, unless the task is explicitly visual
- inventing alternate locator DSL such as `@"..."` or private query syntax
- guessing UIKit internal class names before reading the snapshot
- passing guessed labels to execution tools instead of first resolving an exact `oid`

If `ui_snapshot` is large, it is acceptable to parse the returned JSON programmatically. That is a valid agent strategy. The important constraint is to base decisions on the snapshot first, not on blind UIKit guesses.

## Local project experience memory

For repeated tasks, maintain project-local experience in:

- `.viewglassmcp/README.md`
- `.viewglassmcp/recipes.yaml`

Use this memory to speed up repeated navigation and target resolution.

Rules:

1. If the task is likely to repeat and `.viewglassmcp/` does not exist in the current project, create it automatically.
2. Create these files automatically when needed:
   - `.viewglassmcp/README.md`
   - `.viewglassmcp/recipes.yaml`
3. Read `.viewglassmcp/recipes.yaml` before repeating a known flow.
4. After a reusable UI task succeeds on a live app, update or add a recipe in `.viewglassmcp/recipes.yaml` during the same session.
5. Do not store runtime `oid` as the durable identity of a target.
6. Prefer multi-signal recipes:
   - `controllerHints`
   - `groupRole`
   - `searchableTextAny`
   - `accessibilityIdAny`
   - `classHints`
   - `areaHint`
7. Every recipe must include `success` conditions.
8. If a recipe fails repeatedly, revise or remove it.

Default experience loop:

1. Check `.viewglassmcp/recipes.yaml` first when the task resembles a previous flow.
2. If no usable recipe exists, use `ui_snapshot` and complete the task normally.
3. If the task succeeds and is likely to repeat, update `.viewglassmcp/recipes.yaml` immediately.
4. On later runs, prefer the project-local recipe before fallback exploration.

Use the templates in this repository as the content source when you create `.viewglassmcp/`:

- `templates/.viewglassmcp/README.md`
- `templates/.viewglassmcp/recipes.yaml`

---

## Step 0 — Install the ViewglassMCP skill

From the project root, run:

```bash
npx -y viewglass-mcp init --force
```

This installs the skill into supported client skill directories and updates `AGENTS.md` with a ViewglassMCP guidance line, following the same model as `xcodebuildmcp`.

## Step 1 — Configure viewglass-mcp in the AI client

Choose the config file for the AI client in use:

| Client | Config file |
|---|---|
| Claude Code | `.claude/settings.json` in project, or `~/.claude.json` globally |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` in project |
| Windsurf | `~/.codeium/windsurf/mcp_settings.json` |
| VS Code (GitHub Copilot) | `.vscode/mcp.json` in project |
| Cline | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| Gemini CLI | `~/.gemini/settings.json` |

All clients use the same JSON format. Add this entry (create the file if it does not exist):

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

If Node.js / npx is not available, install it first:
```bash
brew install node
```

---

## Step 2 — Add ViewglassServer to the iOS project

First, locate the iOS project root (directory containing `*.xcodeproj` or `Package.swift` for the app).

Check the latest release tag at: `https://github.com/WZBbiao/ViewglassServer/releases/latest`
Use that tag for the version in the snippets below.

### Detect integration method

- If a `Podfile` exists in the project → use **CocoaPods**
- Otherwise → use **Swift Package Manager**

### Swift Package Manager

If the target is an Xcode project (no top-level `Package.swift`), instruct the user:
> File → Add Package Dependencies → `https://github.com/WZBbiao/ViewglassServer.git` → choose the latest version → add `LookinServer` to the app target

If `Package.swift` exists, add to dependencies:
```swift
.package(url: "https://github.com/WZBbiao/ViewglassServer.git", from: "<latest-tag>")
```
And to the app target:
```swift
.product(name: "LookinServer", package: "ViewglassServer")
```

### CocoaPods

Add to `Podfile` inside the app target block:
```ruby
pod 'LookinServer',
  :git => 'https://github.com/WZBbiao/ViewglassServer.git',
  :tag => '<latest-tag>',
  :subspecs => ['Swift'],
  :configurations => ['Debug']
```

Then run:
```bash
pod install
```

---

## Step 3 — Import LookinServer (SPM only)

LookinServer uses an ObjC `+load` method to start automatically when linked —
no initialization code is required.

**CocoaPods:** skip this step.

**SPM:** add a defensive import to prevent the linker from dead-stripping the module.
Find the app entry point (`AppDelegate.swift`, `App.swift`, or `AppDelegate.m`) and add:

```swift
#if DEBUG
import LookinServer
#endif
```

---

## Step 4 — Build and run the app

Tell the user:
> Please build and run the app on a simulator or connected device using the Debug scheme, then let me know when it's running.

Wait for confirmation before proceeding.

---

## Step 5 — Connect

Infer the app's bundle ID from the project (check `Info.plist`, `.xcodeproj`, or `Package.swift`),
then call `ui_connect` with that bundle ID.

- **Session returned** → setup complete, pass the session string to all other Viewglass tools.
- **App not found** → check: (1) app is running in Debug scheme, (2) LookinServer is linked to the app target, (3) MCP config was saved and client was restarted. Then retry `ui_connect`.
- **Bundle ID unknown** → fall back to `ui_scan` to see what sessions are available.
