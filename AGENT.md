# Viewglass — Agent Setup Instructions

You are an AI agent. Read this file and execute all steps autonomously.
Ask the user only when a decision cannot be inferred from the project files.

## What is Viewglass

Viewglass is an iOS runtime UI inspector for AI agents.
It gives you 16 MCP tools to read the view hierarchy, query nodes, tap, scroll,
input text, invoke any ObjC method, assert state, and take screenshots — all
against a live running iOS app.

Stack:
- **viewglass-mcp** — MCP server (this npm package, bundles the CLI binary)
- **ViewglassServer** — iOS library embedded in the app (Debug builds only)

---

## Step 1 — Configure viewglass-mcp in the AI client

Choose the config file for the AI client in use:

| Client | Config file |
|---|---|
| Claude Code | `.claude/settings.json` in the project, or `~/.claude.json` globally |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` in the project |

Add this entry (create the file if it does not exist):

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

## Step 5 — Verify

Call the `ui_scan` MCP tool.

- **Sessions found** → setup complete, you can now use all 16 Viewglass tools.
- **Sessions empty** → check: (1) app is running in Debug, (2) LookinServer is linked to the app target, (3) MCP config was saved and client was restarted.
