---
name: viewglassmcp
description: Official skill for ViewglassMCP. Use for live iOS UI inspection and interaction through the Viewglass MCP server.
---

# ViewglassMCP

Use Viewglass MCP tools to inspect and interact with a live iOS app.

## Step 1: Establish Current UI Context

- For navigation, custom UI, tab switching, settings pages, or any unknown screen, start with `ui_snapshot`.
- Treat `ui_snapshot` as the source of truth for the current page.
- Default `ui_snapshot` output is a compact action index. Use `recommendedLocator`, `summary`, `groups`, `navigationCandidates`, `nodes`, and `matchedRecipes` to identify the correct target.
- Prefer `#accessibilityIdentifier` and `recommendedLocator` for repeatable actions.
- Use `ui_screenshot` for visual layout and `ui_attr_get` for long text or detailed attributes after the target locator is known.
- Use `mode=fullIndex` only when the compact action index is insufficient.
- Do not try to guess sessions manually. If `.viewglassmcp/config.yaml` already has a `bundleId` plus stable selectors, let ViewglassMCP resolve the session automatically.
- If `ui_connect` reports multiple sessions for the same bundle, choose using `session`, `port`, `deviceIdentifier`, `deviceName`, or `deviceType`; prefer `deviceIdentifier`/`deviceName`/`deviceType` over last-known `session`/`port`.

## Step 2: Execute With Stable Locator First

- `ui_tap`, `ui_scroll`, `ui_input`, `ui_attr_get`, and `ui_dismiss` accept `locator` first and `oid` as fallback.
- `oid` / `lastKnownOid` are runtime handles. They may be cached in recipes, but replay must try stable locator signals before oid.
- For page/list scrolling, use `ui_scroll` with a stable locator for the best visible container/cell; it resolves wrapper/cell targets to the real scroll view and performs a swipe-style scroll.
- If source is available and the target lacks a stable locator, add an `accessibilityIdentifier` to the component before relying on text/class/oid.
- Do not guess UIKit private class names before reading the snapshot.
- Prefer `accessibilityIdentifier`, visible labels, `groups`, `searchableText`, `actionTargetOid`, and stable structure over temporary runtime details.

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
- Persist the app bundle id and, when needed, stable device selectors in `.viewglassmcp/config.yaml` once they are known for the project.
- After a reusable live task succeeds, you must update `.viewglassmcp/recipes.yaml` in the same session before finishing the task.
- If the task is blocked, unusually inefficient, or exposes a ViewglassMCP bad case, call `ui_feedback` before finishing.
- Do not store runtime `oid` as the only durable identity. It may be saved as `lastKnownOid` cache metadata only.
- Prefer multi-signal recipes: `controllerHints`, `groupRole`, `searchableTextAny`, `accessibilityIdAny`, `classHints`, `areaHint`, and `success`.

## Step 5: Send Feedback For Iteration

Use `ui_feedback` near the end of a ViewglassMCP task when there is actionable feedback:

- `outcome=blocked` if the task could not be completed.
- `outcome=partial` if the task completed only after wasteful retries or workaround attempts.
- `outcome=regression` if a previously working flow now fails.
- Include `task`, `summary`, `expected`, `actual`, `session`, relevant tool names, local screenshot/log paths, and a concise `suggestion`.

Feedback is written as JSONL to `VIEWGLASS_MCP_FEEDBACK_FILE` when set, otherwise to `.viewglassmcp/feedback.jsonl`.

## Anti-patterns

Avoid these:
- starting with repeated locator guesses to figure out the current page
- guessing `UITabBar`, `UITabBarButton`, or private wrappers before reading the snapshot
- trying to use execution tools as search tools
- replaying a recipe by `oid` before trying its stable locator signals
- repeatedly requesting large snapshots instead of using screenshots for visual context and targeted attribute reads for details
- finishing a blocked or inefficient flow without recording `ui_feedback`
