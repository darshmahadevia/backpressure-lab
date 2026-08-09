# ADR 0001: Keep Phase 1 experiments in one Go process

- Status: accepted
- Date: 2026-08-08

## Context

The first portfolio slice needs real concurrent work, cancellation, queueing, and live metrics while remaining easy to run locally and safe to expose publicly. A distributed runtime would add operational complexity before it improves the demonstration.

## Decision

Run each experiment as an isolated in-memory runtime inside one Go process. The HTTP API controls lifecycle, and Server-Sent Events streams aggregate snapshots to the React dashboard. Each experiment has bounded resource limits and is cancelled automatically after its workload and drain grace period.

## Consequences

The behavior is easy to inspect and test with the race detector, and experiments are cheap to start. Runs are ephemeral and process-local; persistence, multi-node fairness, and external load generation are deferred until they are justified by later experiments.
