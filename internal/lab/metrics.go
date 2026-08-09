package lab

import (
	"math"
	"sort"
	"sync"
	"time"
)

type recorder struct {
	mu sync.Mutex

	startedAt time.Time
	lastAt    time.Time

	totalIncoming  int64
	totalAccepted  int64
	totalRejected  int64
	totalCompleted int64
	totalFailed    int64
	totalTimedOut  int64

	lastIncoming  int64
	lastAccepted  int64
	lastRejected  int64
	lastCompleted int64
	lastFailed    int64
	lastTimedOut  int64

	latencies     []time.Duration
	maxQueueDepth int
	maxActive     int
}

func newRecorder(startedAt time.Time) *recorder {
	return &recorder{startedAt: startedAt, lastAt: startedAt, latencies: make([]time.Duration, 0, 2_000)}
}

func (r *recorder) observeIncoming() {
	r.mu.Lock()
	r.totalIncoming++
	r.mu.Unlock()
}

func (r *recorder) observeAccepted() {
	r.mu.Lock()
	r.totalAccepted++
	r.mu.Unlock()
}

func (r *recorder) observeRejected() {
	r.mu.Lock()
	r.totalRejected++
	r.mu.Unlock()
}

func (r *recorder) observeCompleted(latency time.Duration) {
	r.mu.Lock()
	r.totalCompleted++
	r.addLatencyLocked(latency)
	r.mu.Unlock()
}

func (r *recorder) observeFailed(latency time.Duration) {
	r.mu.Lock()
	r.totalFailed++
	r.addLatencyLocked(latency)
	r.mu.Unlock()
}

func (r *recorder) observeTimedOut(latency time.Duration) {
	r.mu.Lock()
	r.totalTimedOut++
	r.addLatencyLocked(latency)
	r.mu.Unlock()
}

func (r *recorder) addLatencyLocked(latency time.Duration) {
	if latency < 0 {
		latency = 0
	}
	if len(r.latencies) == cap(r.latencies) {
		copy(r.latencies, r.latencies[1:])
		r.latencies = r.latencies[:len(r.latencies)-1]
	}
	r.latencies = append(r.latencies, latency)
}

func (r *recorder) snapshot(now time.Time, status RunStatus, queueDepth, active int, pressure float64, maxActive int) Snapshot {
	r.mu.Lock()
	defer r.mu.Unlock()

	if queueDepth > r.maxQueueDepth {
		r.maxQueueDepth = queueDepth
	}
	if active > r.maxActive {
		r.maxActive = active
	}
	if maxActive > r.maxActive {
		r.maxActive = maxActive
	}

	elapsed := now.Sub(r.startedAt)
	interval := now.Sub(r.lastAt)
	if interval <= 0 {
		interval = time.Millisecond
	}
	latencies := append([]time.Duration(nil), r.latencies...)
	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })

	snapshot := Snapshot{
		ElapsedMS:           elapsed.Milliseconds(),
		Status:              status,
		QueueDepth:          queueDepth,
		MaxQueueDepth:       r.maxQueueDepth,
		ActiveOperations:    active,
		MaxActiveOperations: r.maxActive,
		DownstreamPressure:  pressure,
		P50LatencyMS:        percentileMilliseconds(latencies, 0.50),
		P95LatencyMS:        percentileMilliseconds(latencies, 0.95),
		P99LatencyMS:        percentileMilliseconds(latencies, 0.99),
		TotalIncoming:       r.totalIncoming,
		TotalAccepted:       r.totalAccepted,
		TotalRejected:       r.totalRejected,
		TotalCompleted:      r.totalCompleted,
		TotalFailed:         r.totalFailed,
		TotalTimedOut:       r.totalTimedOut,
		IncomingRate:        rate(r.totalIncoming-r.lastIncoming, interval),
		AcceptedRate:        rate(r.totalAccepted-r.lastAccepted, interval),
		RejectedRate:        rate(r.totalRejected-r.lastRejected, interval),
		CompletedRate:       rate(r.totalCompleted-r.lastCompleted, interval),
		FailedRate:          rate(r.totalFailed-r.lastFailed, interval),
		TimeoutRate:         rate(r.totalTimedOut-r.lastTimedOut, interval),
	}
	snapshot.State, snapshot.Message = interpretSnapshot(snapshot)

	r.lastAt = now
	r.lastIncoming = r.totalIncoming
	r.lastAccepted = r.totalAccepted
	r.lastRejected = r.totalRejected
	r.lastCompleted = r.totalCompleted
	r.lastFailed = r.totalFailed
	r.lastTimedOut = r.totalTimedOut
	return snapshot
}

func rate(delta int64, interval time.Duration) float64 {
	if delta <= 0 || interval <= 0 {
		return 0
	}
	return float64(delta) / interval.Seconds()
}

func percentileMilliseconds(values []time.Duration, quantile float64) float64 {
	if len(values) == 0 {
		return 0
	}
	index := int(math.Ceil(quantile*float64(len(values)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(values) {
		index = len(values) - 1
	}
	return float64(values[index]) / float64(time.Millisecond)
}

func interpretSnapshot(snapshot Snapshot) (SystemState, string) {
	if snapshot.Status == StatusComplete {
		return StateComplete, "The run completed; the final snapshot is ready to inspect."
	}
	if snapshot.Status == StatusStopped {
		return StateStopped, "The run was stopped; the metrics below show work observed before cancellation."
	}
	if snapshot.Status == StatusDraining {
		return StateRecovering, "Input has eased; workers are draining the backlog left by the baseline."
	}
	if snapshot.QueueDepth >= 1_500 || snapshot.P99LatencyMS >= 1_200 || snapshot.TimeoutRate >= 20 {
		return StateOverloaded, "The baseline is accepting work faster than workers can drain it; waiting time is driving tail latency."
	}
	if snapshot.QueueDepth > 0 || snapshot.P95LatencyMS >= 250 || snapshot.DownstreamPressure > 1 {
		return StateDegrading, "Requests are spending longer waiting because arrivals are approaching the system's effective capacity."
	}
	return StateHealthy, "Traffic is below the worker pool's effective capacity, so work is completing without sustained contention."
}

func (r *recorder) summary(now time.Time, queueDepth, active, maxActive int, pressure float64) Summary {
	snapshot := r.snapshot(now, StatusComplete, queueDepth, active, pressure, maxActive)
	return Summary{
		DurationMS:          snapshot.ElapsedMS,
		TotalIncoming:       snapshot.TotalIncoming,
		TotalAccepted:       snapshot.TotalAccepted,
		TotalRejected:       snapshot.TotalRejected,
		TotalCompleted:      snapshot.TotalCompleted,
		TotalFailed:         snapshot.TotalFailed,
		TotalTimedOut:       snapshot.TotalTimedOut,
		MaxQueueDepth:       snapshot.MaxQueueDepth,
		MaxActiveOperations: snapshot.MaxActiveOperations,
		P50LatencyMS:        snapshot.P50LatencyMS,
		P95LatencyMS:        snapshot.P95LatencyMS,
		P99LatencyMS:        snapshot.P99LatencyMS,
	}
}
