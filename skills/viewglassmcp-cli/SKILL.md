---
name: viewglassmcp-cli
description: Official skill for the Viewglass CLI. Use when interacting with live iOS UI through the `viewglass` executable directly.
---

# Viewglass CLI

Use the `viewglass` CLI for live iOS UI inspection and interaction.

## Step 1: Confirm the CLI Exists

Check availability:
```bash
viewglass --help
```

If the CLI is not available, use the project-local build or install path already configured for the environment.

## Step 2: Snapshot Before Actions

- Start with `viewglass snapshot`-equivalent MCP/CLI flow for unknown pages.
- Resolve the target first, then execute the action.
- Keep execution steps minimal and deterministic.

## Step 3: Prefer Exact Targets

- For repeated flows, use project-local `.viewglassmcp/recipes.yaml` to recover the right target.
- Avoid guessing locators when an exact target can be derived from the current UI structure.
