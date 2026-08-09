# Backpressure Lab

Backpressure Lab is a real-concurrency learning tool for observing overload and recovery.

## Agent skills

### Issue tracker

Work is tracked in GitHub Issues using `gh`; implementation work is committed and pushed directly to `main`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical Matt Pocock skill labels documented in `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. Read `CONTEXT.md` and relevant ADRs under `docs/adr/` before changing domain behavior. See `docs/agents/domain.md`.

## Working agreement

- Claim the active issue with `gh issue edit <number> --add-assignee @me` before implementation.
- Work in tracer-bullet slices and keep the issue acceptance criteria current.
- Use Go tests and the race detector for concurrency changes.
- Run frontend typechecking, tests, and a production build before resolving a UI issue.
- Push completed issue work directly to `main`; do not create a pull request for this repository.
