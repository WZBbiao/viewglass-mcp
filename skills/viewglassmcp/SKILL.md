---
name: viewglassmcp
description: Official skill for ViewglassMCP. Use for live iOS UI inspection and interaction through the Viewglass MCP server.
---

# ViewglassMCP

Use Viewglass MCP tools to inspect and interact with a live iOS app.

## Step 1: Establish Current UI Context

- For navigation, custom UI, tab switching, settings pages, or any unknown screen, start with `ui_snapshot`.
- Treat `ui_snapshot` as the source of truth for the current page.
- Default `ui_snapshot` output is a compact action index. Use `summary`, `groups`, `navigationCandidates`, `nodes`, and `matchedRecipes` to identify the correct target.
- Prefer `summary.inputCandidates[].inputTargetOid` for text entry when available.
- Use `ui_screenshot` for visual layout and `ui_attr_get` for long text or detailed attributes after the target `oid` is known.
- Use `mode=fullIndex` only when the compact action index is insufficient.
- Do not try to scan for sessions manually. If `.viewglassmcp/config.yaml` already has a `bundleId`, let ViewglassMCP resolve the session automatically.

## Step 2: Resolve an Exact OID Before Executing

- `ui_tap`, `ui_scroll`, `ui_input`, and `ui_dismiss` require an exact `oid` from `ui_snapshot`.
- For page/list scrolling, use `ui_scroll` on the best visible container/cell oid; it resolves wrapper/cell targets to the real scroll view and performs a swipe-style scroll.
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
- If the task is blocked, unusually inefficient, or exposes a ViewglassMCP bad case, call `ui_feedback` before finishing.
- Do not store runtime `oid` as durable identity.
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
- repeatedly requesting large snapshots instead of using screenshots for visual context and targeted attribute reads for details
- finishing a blocked or inefficient flow without recording `ui_feedback`
