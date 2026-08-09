# Backpressure Lab

Backpressure Lab is an interactive systems-engineering lab that makes backend overload visible.

Start a real concurrent experiment, watch work move through a queue and worker pool, then inspect how arrival rate, throughput, queue depth, tail latency, timeouts, and downstream pressure change as capacity is exceeded.

## Try it locally

Requirements: Go 1.23+, Node.js 22+, npm.

```bash
# terminal 1
make dev-api

# terminal 2
cd web && npm install && npm run dev
```

Open <http://localhost:5173>, select **Sudden traffic spike**, and press **Run experiment**. The first few seconds are calm; then offered load jumps above the worker pool's capacity and the baseline queue, p99 latency, and timeout count become visible.

The API listens on `http://localhost:8080`. Run the full checks with:

```bash
make check
```

## Phase 1 surface

- Four built-in scenarios: healthy system, sudden traffic spike, slow dependency, and dependency failure.
- A real workload generator, safety-capped queue, concurrent workers, contention-aware synthetic dependency, and request deadlines.
- Live REST + Server-Sent Events API with aggregate snapshots and terminal summaries.
- Dashboard pipeline: incoming → admission → queue → workers → dependency.
- Live rates, outcomes, queue depth, active operations, downstream pressure, p50/p95/p99 latency, and a plain-language operator reading.

Phase 1 intentionally uses the baseline profile. Bounded work, load shedding, concurrency limiting, circuit breaking, adaptive protection, retries, and comparison mode are later lab modules.

## Architecture

The first slice is a single Go experiment engine exposed through REST and Server-Sent Events, with a React dashboard as the operator surface. Each experiment owns its workload, queue, worker pool, synthetic downstream dependency, cancellation tree, and metrics recorder. See [`docs/architecture.md`](docs/architecture.md).

## GitHub workflow

Work is tracked in GitHub Issues and implementation is pushed directly to `main` after verification. The current Phase 0 and Phase 1 map is [issue #1](https://github.com/darshmahadevia/backpressure-lab/issues/1).
