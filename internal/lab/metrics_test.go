package lab

import (
	"testing"
	"time"
)

func TestLatencyPercentilesUseObservedDurations(t *testing.T) {
	recorder := newRecorder(time.Unix(0, 0))
	for _, latency := range []time.Duration{10, 20, 30, 40, 50} {
		recorder.observeCompleted(latency * time.Millisecond)
	}

	snapshot := recorder.snapshot(time.Unix(1, 0), StatusRunning, 0, 0, 0, 0)
	if snapshot.P50LatencyMS != 30 {
		t.Fatalf("p50 = %.1f, want 30", snapshot.P50LatencyMS)
	}
	if snapshot.P95LatencyMS != 50 {
		t.Fatalf("p95 = %.1f, want 50", snapshot.P95LatencyMS)
	}
	if snapshot.P99LatencyMS != 50 {
		t.Fatalf("p99 = %.1f, want 50", snapshot.P99LatencyMS)
	}
}
