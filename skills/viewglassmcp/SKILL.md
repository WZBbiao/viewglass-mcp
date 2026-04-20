---
name: viewglassmcp
description: Official skill for ViewglassMCP. Use for live iOS UI inspection and interaction through the Viewglass MCP server.
---

# ViewglassMCP

Use Viewglass MCP tools to inspect and interact with a live iOS app.

## Step 1: Establish Current UI Context

- For navigation, custom UI, tab switching, settings pages, or any unknown screen, start with `ui_snapshot`.
- Treat `ui_snapshot` as the source of truth for the current page.
- Use `summary`, `groups`, and `nodes` to identify the correct target.
- Do not try to scan for sessions manually. If `.viewglassmcp/config.yaml` already has a `bundleId`, let ViewglassMCP resolve the session automatically.

## Step 2: Resolve an Exact OID Before Executing

- `ui_tap`, `ui_scroll`, `ui_input`, and `ui_dismiss` require an exact `oid` from `ui_snapshot`.
- Do not guess UIKit private class names before reading the snapshot.
- Prefer visible labels, `groups`, `searchableText`, `actionTargetOid`, and stable structure over temporary runtime details.

## Step 3: Verify Transitions Explicitly

- After navigation or modal transitions, use `ui_wait` or another `ui_snapshot` to verify the new state.
- Do not assume animations have completed.

## Step 4: Maintain Project-Local Experience Memory

For repeated flows, keep project-local experience in:

- `.viewglassmcp/README.md`
- `.viewglassmcp/recipes.yaml`
- `.viewglassmcp/config.yaml`
- `.viewglassmcp/config.yaml`

Rules:
- The bundled `recipes.yaml` template is intentionally empty and generic. Add project-specific entries only after successful live runs in the current project.
- If the task is likely to repeat and `.viewglassmcp/` does not exist in the current project, create it automatically.
- Use the package templates as the initial content source.
- Persist the app bundle id in `.viewglassmcp/config.yaml` once it is known for the project.
- After a reusable live task succeeds, you must update `.viewglassmcp/recipes.yaml` in the same session before finishing the task.
- Do not store runtime `oid` as durable identity.
- Prefer multi-signal recipes: `controllerHints`, `groupRole`, `searchableTextAny`, `accessibilityIdAny`, `classHints`, `areaHint`, and `success`.

## Anti-patterns

Avoid these:
- starting with repeated locator guesses to figure out the current page
- guessing `UITabBar`, `UITabBarButton`, or private wrappers before reading the snapshot
- trying to use execution tools as search tools
- relying on raw screenshots when the task is structural rather than visual
