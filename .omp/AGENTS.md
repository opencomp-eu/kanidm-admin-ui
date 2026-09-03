# Project Overview

This is a lightweight Kanidm administration UI consisting of:
- Rust/Axum backend — API, authentication, sessions, and Kanidm integration.
- React/TypeScript frontend — UI and API interaction.
- Kanidm — the sole source of truth; there is no application database.
- Docker — frontend and backend are packaged into a single container.

See `architecture.md` for the detailed architecture, directory structure, API endpoints, data flow, and Kanidm-specific behavior.

Before making substantial architectural changes, read `architecture.md` and inspect the existing implementation patterns.

## Core Engineering Principles
### 1. Prefer simple, maintainable code

Write code that another competent developer can understand quickly.
- Prefer straightforward implementations over clever abstractions.
- Keep functions and components focused on one responsibility.
- Avoid unnecessary indirection.
- Use descriptive names rather than comments to explain obvious behavior.
- Comments should explain why, not merely restate what the code does.
- Follow the existing project style unless there is a good reason to improve it.
- Do not introduce dependencies unless they provide meaningful value.

When there is a choice between a clever solution and a boring, obvious solution, prefer the boring solution.

### 2. Build composable, reusable modules

Follow DRY principles, but do not abstract prematurely.

If functionality, UI, or logic is genuinely shared by multiple places, extract it into a reusable module.

Examples:
- Repeated tables should become reusable table components.
- Repeated confirmation dialogs should use `ConfirmDialog`.
- Repeated API behavior should live in frontend/src/api.ts or an appropriate shared helper.
- Repeated Kanidm operations should be implemented on `KanidmClient` rather than duplicated in route handlers.
- Repeated data transformations should have a shared helper rather than subtly different implementations in multiple components.
- Shared TypeScript types and attribute helpers belong in `frontend/src/types.ts` or an appropriate shared module.

Avoid creating abstractions solely because two pieces of code look vaguely similar. Abstract when there is a meaningful shared concept or when duplication would make future changes error-prone.

### 3. Keep responsibilities separated

Maintain the existing separation of concerns:

Backend:
- src/kanidm.rs — Kanidm API communication and Kanidm-specific operations.
- src/routes/ — HTTP handlers, request validation, authorization decisions, and HTTP responses.
- src/auth.rs — authentication and session behavior.
- src/config.rs — configuration and environment variables.
- src/error.rs — application error handling.

Route handlers should not contain large amounts of low-level Kanidm HTTP implementation. Put that logic in KanidmClient.

Frontend:
- frontend/src/api.ts — communication with the backend API.
- frontend/src/types.ts — shared data types and common attribute helpers.
- frontend/src/pages/ — page-level composition and page-specific behavior.
- frontend/src/components/ — reusable UI components.

Do not put substantial business logic directly into TSX when it can be expressed as a helper, hook, API function, or reusable component.

## Frontend Architecture

Build the UI from small, composable components.

When creating a UI pattern that is likely to appear more than once, consider whether it belongs in `frontend/src/components/`.

Examples include:
- Tables
- Empty states
- Loading states
- Confirmation dialogs
- Form controls
- Badges/status indicators
- User/group selectors
- Reusable modals

Prefer composition over large components with many conditional branches.

Avoid turning every small piece of TSX into a component. Components should represent meaningful reusable UI concepts.

When a page becomes difficult to understand, split it into focused components rather than continuing to grow a single file.

Keep API calls out of presentational components where practical. Prefer the existing API abstraction in frontend/src/api.ts.

## Backend Architecture

Keep Axum route handlers thin.

A typical flow should look like:
```
HTTP request -> route handler -> validation / authorization -> KanidmClient -> Kanidm API
```

Put reusable Kanidm operations in `KanidmClient`.

Do not duplicate HTTP request construction, authentication headers, response handling, or Kanidm-specific serialization across route handlers.

Use the existing `AppState` and dependency flow rather than introducing unnecessary global state.

Follow existing error handling through `AppError`.

## Security Requirements

Security is a first-class requirement. Treat all input and external data as untrusted.

## Secrets
- Never hard-code API tokens, passwords, client secrets, cookie secrets, or other credentials.
- Never commit secrets to the repository.
- Never add real secrets to .env.example.
- Do not log secrets or authentication tokens.
- Be careful when debugging authentication/configuration code not to print environment variables wholesale.
- Treat .env files as sensitive.

## Authentication and authorization
- Do not weaken authentication or authorization to make development easier.
- Preserve the existing OIDC and development-mode behavior unless the task explicitly requires changing it.
- Any new administrative endpoint must be evaluated for authorization requirements.
- Do not assume that hiding a UI control provides security; enforce security on the backend.

## Input validation

Validate user-controlled input at appropriate boundaries.

Do not blindly pass arbitrary user input into:
- Kanidm filters
- URLs
- HTTP headers
- filesystem paths
- shell commands
- HTML
- SQL or other query languages

There should be no reason for application code to execute arbitrary shell commands.

## Browser security
- Avoid introducing XSS vulnerabilities.
- Do not use dangerouslySetInnerHTML unless there is a clear, reviewed requirement.
- Do not expose backend secrets to the frontend.
- Do not put sensitive credentials into client-side storage.
- Preserve secure cookie/session behavior.

## Destructive operations

Treat destructive administrative operations carefully.

Examples include:
- deleting users
- deleting groups
- removing group memberships
- disabling accounts
- deleting OAuth2 applications
- changing credentials

Provide appropriate confirmation in the UI and ensure the backend correctly enforces the operation.

## Kanidm-Specific Rules

Read and follow the Kanidm quirks documented in architecture.md.

In particular:
- Kanidm is the sole source of truth.
- Do not introduce an application database without an explicit architectural decision.
- Use KanidmClient for Kanidm API operations.
- Create endpoints may return an empty or unexpected response; follow the existing pattern of returning the submitted entry when appropriate.
- Group memberships use the memberof attribute and SPN-style values such as name@domain.
- Passwords must not be set directly; use the existing credential/update-intent mechanism to generate reset tokens.
- Active accounts may not have a status attribute; absence of status does not mean the account is invalid.
- Preserve existing Kanidm API compatibility behavior when adding new functionality.

When unsure about a Kanidm API behavior, inspect `docs/kanidm-1.11.1-openapi.json` and the existing `KanidmClient` implementation before guessing.

## Making Changes

Before implementing a non-trivial change:
- Understand the existing implementation.
- Identify the appropriate layer/module for the change.
- Look for existing helpers/components/patterns that can be reused.
- Consider whether the change introduces duplication.
- Consider security implications and failure cases.
- Make the smallest clean change that solves the problem.

Do not rewrite unrelated code merely because it could be improved.

Do not change architecture unnecessarily.

### Adding backend functionality

Normally:
- Add or extend the appropriate KanidmClient method in src/kanidm.rs.
- Add the route handler in the appropriate src/routes/*.rs.
- Register the route in the resource router.
- Add or update tests.
- Add the corresponding frontend API function if needed.

### Adding frontend functionality

Normally:
- Add/update types and helpers in frontend/src/types.ts if needed.
- Add the API function in frontend/src/api.ts.
- Create or update the appropriate page/component.
- Extract genuinely reusable UI into frontend/src/components/.
- Add/update tests where appropriate.
- Verify the production build.
- Testing and Verification

Do not assume code works because it compiles.

After making changes:
- Run the relevant tests.
- Run the frontend build when frontend code changes.
- Run Rust formatting/checks/tests when backend code changes.
- Inspect the resulting diff.
- Check for accidental debug output, secrets, unrelated changes, or generated files.

Prefer targeted tests for the behavior being changed, then run broader checks when practical.

If a test or build cannot be run, say so rather than claiming it passed.

## When Requirements Are Unclear

Prefer inspecting the codebase and existing patterns before asking questions.

If the intended behavior is still ambiguous and the choice could affect security, data integrity, or architecture, stop and ask rather than guessing.

For low-risk implementation details, choose the simplest solution consistent with the existing architecture.
