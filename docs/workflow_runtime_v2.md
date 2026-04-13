# Workflow Runtime V2

## Goal

Move the project toward one workflow model, one trigger model, and one execution result model.

This phase does not rewrite the editor or remove legacy behavior yet. It defines the canonical shapes that new code should follow.

## Canonical Models

### WorkflowDocument

`WorkflowDefinition` is the canonical workflow document.

- It describes business logic only.
- It contains `id`, `name`, `description`, `nodes`, and `edges`.
- It must not depend on multiple storage formats.

Current compatibility note:

- The WebUI may still read legacy `wf.data` payloads.
- Saving should converge on one top-level canonical workflow shape.

### TriggerDefinition

Triggers are conceptually separate from workflow business logic.

- A trigger decides whether an external event should enter a workflow.
- A trigger resolves runtime input.
- A trigger does not define business steps.

Current compatibility note:

- Existing `trigger_*` nodes remain supported as a compatibility path.
- New runtime logic should treat them as an adapter layer, not as the long-term model.

### UI Assets

Menus, buttons, and web apps are Telegram UI assets.

- They are not the source of truth for workflow execution.
- Button-to-workflow direct binding is legacy compatibility behavior.
- Trigger matching should become the source of truth for event entry.

### Runtime Result

`ActionExecutionResult` is the canonical workflow/runtime output.

- All entry paths must resolve through one outcome application layer.
- Button, command, keyword, and manual execution must not diverge in result semantics.

## Canonical Execution Pipeline

All runtime entry points should converge on this flow:

1. `normalizeEvent`
2. `matchTriggers`
3. `buildRuntime`
4. `runWorkflow`
5. `applyWorkflowOutcome`

## Compatibility Rules

During the migration period, these legacy behaviors remain allowed:

- Reading old workflow payloads stored under `wf.data`
- Trigger-node extraction from mixed graphs
- Existing button/workflow direct bindings

These behaviors are compatibility-only and must not be expanded:

- Automatic trigger edge repair
- Automatic trigger wiring
- Hidden non-canvas edge preservation as a long-term storage strategy

## Shared Type Source

The canonical shared type source now lives under:

- `shared/workflow.ts`
- `shared/runtime.ts`

Frontend and backend should import or re-export these files instead of maintaining parallel workflow/runtime interfaces.
