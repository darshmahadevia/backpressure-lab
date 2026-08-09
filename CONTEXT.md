# Backpressure Lab context

## Purpose

Backpressure Lab is an interactive systems-engineering experiment for making overload behavior visible. A run generates real concurrent work through a request-processing pipeline and exposes the resulting queue, latency, throughput, failure, and downstream-pressure signals.

## Domain glossary

- **Scenario** — a deterministic workload and downstream-condition timeline, such as a traffic spike or slow dependency.
- **Protection profile** — the overload-control behavior applied to a run. Phase 1 uses the baseline profile with no intentional protection.
- **Experiment** — one execution of a scenario with its own lifecycle, workload, queue, workers, dependency, and metrics.
- **Logical request** — one unit of user-visible work emitted by the workload.
- **Attempt** — one execution try for a logical request. Retries are not part of Phase 1.
- **Admission** — the decision to accept incoming work into the waiting queue or reject it.
- **Queue depth** — the number of accepted requests waiting to execute.
- **Worker** — one processing slot that takes accepted work from the queue and calls the dependency.
- **Downstream dependency** — the synthetic service whose latency and reliability determine processing capacity.
- **Snapshot** — the current aggregate metric view streamed to the dashboard.
- **Summary** — the final aggregate result of a completed experiment.
- **System event** — a derived explanation of a meaningful state transition, such as sustained queue growth or overload.

## Phase 1 boundary

The first vertical slice includes experiment lifecycle control, built-in scenarios, a real workload generator, a safety-bounded baseline queue, concurrent workers, a contention-aware downstream model, request deadlines, aggregate metrics, SSE snapshots, and a minimal dashboard. Intentional protection strategies, retries, comparison mode, persistence, and authentication are later work.
