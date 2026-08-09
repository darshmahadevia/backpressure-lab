# Phase 1 architecture

Backpressure Lab is intentionally a single-process experiment runner.

```text
React dashboard
      │ REST commands + Server-Sent Events
      ▼
Go HTTP adapter → experiment engine
                         │
             workload → safety-cap queue
                         │
                    worker pool
                         │
                synthetic dependency
                         │
                    metrics recorder
```

Each experiment owns its cancellation context, queue, worker pool, dependency model, random seed, recorder, and SSE hub. The engine exposes a small interface: list scenarios, start/get an experiment, stop it, subscribe to snapshots, and read its summary.

The baseline is not an unbounded-memory implementation. Its 2,000-item internal safety cap keeps the demo process safe; it is deliberately generous and reported separately from future user-facing bounded-work and load-shedding profiles.

A workload emits requests every 10ms according to the scenario's rate function. Workers process accepted requests through a synthetic dependency whose latency increases when active work exceeds healthy capacity. Request deadlines include queue wait, so tail latency and timeouts are consequences of real scheduling rather than scripted chart values.
