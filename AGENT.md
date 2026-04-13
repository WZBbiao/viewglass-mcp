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

### Detect integration method

- If a `Podfile` exists in the project → use **CocoaPods**
- Otherwise → use **Swift Package Manager**

### Swift Package Manager

1. Open `Package.swift` (app package) or the Xcode project's SPM dependencies.

   If the target is an Xcode project (no top-level `Package.swift`), instruct
   the user to add the package in Xcode:
   > File → Add Package Dependencies → `https://github.com/WZBbiao/ViewglassServer.git` → version `0.1.0` → add `LookinServer` to the app target

   If `Package.swift` exists, add to dependencies:
   ```swift
   .package(url: "https://github.com/WZBbiao/ViewglassServer.git", from: "0.1.0")
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
  :tag => '0.1.0',
  :subspecs => ['Swift'],
  :configurations => ['Debug']
```

Then run:
```bash
pod install
```

---

## Step 3 — Import LookinServer in the app entry point

Find the app entry point. In order of preference:
1. `AppDelegate.swift` — look for `@UIApplicationMain` or `UIApplicationDelegate`
2. `App.swift` — look for `@main` and `App` protocol
3. Objective-C: `AppDelegate.m`

Add the import at the top of the file (after existing imports):

**Swift:**
```swift
#if DEBUG
import LookinServer
#endif
```

**Objective-C:**
```objc
#if DEBUG
@import LookinServer;
#endif
```

No other initialization code is needed. The server starts automatically on import.

---

## Step 4 — Build and run the app

Tell the user:
> Please build and run the app on a simulator or connected device using the Debug scheme, then let me know when it's running.

Wait for confirmation before proceeding.

---

## Step 5 — Verify

Call the `ui_scan` MCP tool.

- **Sessions found** → setup complete, you can now use all 16 Viewglass tools.
- **Sessions empty** → check: (1) app is running in Debug, (2) LookinServer import was added, (3) MCP config was saved and client was restarted.

---

## Version compatibility

| viewglass-mcp | bundled CLI | ViewglassServer |
|---|---|---|
| 0.1.0 | 0.1.0 | ≥ 0.1.0 |

Current versions are in `.viewglass-cli-version` and `.viewglass-server-min-version` inside the npm package.
