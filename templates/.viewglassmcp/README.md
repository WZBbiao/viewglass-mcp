# .viewglassmcp

Project-local Viewglass experience memory.

This directory is maintained by the agent, not by the runtime.

Purpose:

- preserve successful UI interaction knowledge inside the project
- speed up repeated flows without depending on fragile runtime OIDs
- keep reusable navigation and target-finding knowledge reviewable in git

Rules:

1. Prefer stable locator signals. `oid` may be stored only as `lastKnownOid` cache metadata.
2. Prefer multi-signal target descriptions:
   - `controllerHints`
   - `groupRole`
   - `searchableTextAny`
   - `accessibilityIdAny`
   - `classHints`
   - `areaHint`
3. If source is available and a key target lacks a stable locator, add an `accessibilityIdentifier` before relying on text/class/OID.
4. Every recipe must include a success condition.
5. Update a recipe only after a task succeeds on a live app.
6. If a recipe fails repeatedly, revise or remove it.

Recommended files:

- `recipes.yaml`
  Reusable target-finding and action recipes. The template starts empty on purpose.
  Agents should add project-specific recipes only after a real successful run in
  the current project.
- `config.yaml`
  Project-local Viewglass defaults such as the target app bundle identifier and
  optional session selectors (`deviceIdentifier`, `deviceName`, `deviceType`,
  `session`, `port`) for disambiguating multiple devices or simulators running
  the same app. Treat `session` and `port` as last-known runtime hints because
  they can change after relaunch.
- `feedback.jsonl`
  Agent-authored feedback records for blocked flows, inefficient tool loops,
  screenshot/input/waiting bad cases, and useful improvement ideas. The
  `ui_feedback` MCP tool appends structured JSONL here by default.

Agent discipline:

- Before a complex repeated task, check whether `.viewglassmcp/recipes.yaml` already has a relevant recipe.
- After successfully completing a reusable task, update or add a recipe.
- Before finishing a blocked or unusually inefficient Viewglass task, call
  `ui_feedback` with the relevant session, tools, artifacts, expected behavior,
  actual behavior, and a concise suggestion.
- Use recipes to accelerate future runs, but still verify against a fresh `ui_snapshot`.
