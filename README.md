# Backpressure Lab

Backpressure Lab is an interactive systems-engineering lab that makes backend overload visible.

Start a real concurrent experiment, watch work move through a queue and worker pool, then inspect how arrival rate, throughput, queue depth, tail latency, timeouts, and downstream pressure change as capacity is exceeded.

> Phase 0 and Phase 1 are currently being implemented. Protection strategies and comparison mode follow in later issues.

## Development

Requirements: Go 1.23+, Node.js 22+, npm.

```bash
# terminal 1
make dev-api

# terminal 2
cd web && npm install && npm run dev
```

Open <http://localhost:5173>.

The API listens on `http://localhost:8080`. Run the full checks with:

```bash
make check
```

## Architecture

The first slice is a single Go experiment engine exposed through REST and Server-Sent Events, with a React dashboard as the operator surface. Each experiment owns its workload, queue, worker pool, synthetic downstream dependency, cancellation tree, and metrics recorder.
