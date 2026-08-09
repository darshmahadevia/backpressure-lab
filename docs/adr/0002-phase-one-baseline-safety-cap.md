# ADR 0002: Bound the baseline queue for process safety

- Status: accepted
- Date: 2026-08-08

## Context

The baseline demonstration intentionally has no user-facing overload protection, but an unbounded queue could let a public demo consume unbounded memory.

## Decision

The baseline admission path accepts work until a generous internal queue cap is reached, then records safety-cap rejections. The dashboard labels this as a safety cap, not as the backpressure strategy being demonstrated.

## Consequences

The baseline can show queue growth, waiting, timeouts, and eventual rejection without risking the host. A later bounded-queue/load-shedding implementation will use separate protection-profile semantics and explain the tradeoff explicitly.
