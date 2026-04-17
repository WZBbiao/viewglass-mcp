# .viewglassmcp

Project-local Viewglass experience memory.

This directory is maintained by the agent, not by the runtime.

Purpose:

- preserve successful UI interaction knowledge inside the project
- speed up repeated flows without hard-coding fragile runtime OIDs
- keep reusable navigation and target-finding knowledge reviewable in git

Rules:

1. Do not store runtime `oid` as the long-term identity of a target.
2. Prefer multi-signal target descriptions:
   - `controllerHints`
   - `groupRole`
   - `searchableTextAny`
   - `accessibilityIdAny`
   - `classHints`
   - `areaHint`
3. Every recipe must include a success condition.
4. Update a recipe only after a task succeeds on a live app.
5. If a recipe fails repeatedly, revise or remove it.

Recommended files:

- `recipes.yaml`
  Reusable target-finding and action recipes.
- `config.yaml`
  Project-local Viewglass defaults such as the target app bundle identifier.

Agent discipline:

- Before a complex repeated task, check whether `.viewglassmcp/recipes.yaml` already has a relevant recipe.
- After successfully completing a reusable task, update or add a recipe.
- Use recipes to accelerate future runs, but still verify against a fresh `ui_snapshot`.
