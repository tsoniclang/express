# Agent Notes (express)

This repo is the canonical native Tsonic implementation of `@tsonic/express`.

## Branch Hygiene (IMPORTANT)

- Before starting work, and again before creating a new branch, run:
  - `bash scripts/check-branch-hygiene.sh`
- Do not proceed if that script reports warnings unless the maintainer explicitly says to ignore them for the current task.
- Keep this repo on `main` unless it is the one active PR branch.
- Do not leave local feature/release branches behind after they are merged.

## Work Standard

- This port is airplane-grade. Favor correct architecture and comprehensive tests over quick translation.
- The goal is not a tactical port. Eliminate whole classes of drift from split ownership or generated-package indirection.
- New logic should be written in native Tsonic-facing source (`.ts`) unless it is clearly substrate-only.

## Migration Policy

- Keep host substrate minimal.
- Move library behavior into native source:
  - routing
  - middleware composition
  - request/response shaping
  - built-in middleware logic
- If a piece feels forced into CLR because Tsonic/runtime/bindings are missing something, record the gap explicitly instead of hiding it.

## Testing Policy

- Keep runtime coverage comprehensive and source-owned.
- Add broader tests than the CLR repo where the old implementation was best-effort or simplified.
- Final quality bar is stricter than parity: preserve behavior and shrink deviation classes.
