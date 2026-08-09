package lab

import (
	"context"
	"testing"
	"time"
)

func TestExperimentProducesTerminalMetrics(t *testing.T) {
	engine := NewEngine()
	experiment, err := engine.Start(context.Background(), StartConfig{
		ScenarioID:     "healthy",
		Duration:       250 * time.Millisecond,
		QueueCapacity:  64,
		Workers:        4,
		RequestTimeout: 500 * time.Millisecond,
		DrainGrace:     500 * time.Millisecond,
		Seed:           7,
	})
	if err != nil {
		t.Fatalf("start experiment: %v", err)
	}

	<-experiment.Done()
	view := experiment.View()

	if view.Status != StatusComplete {
		t.Fatalf("status = %q, want %q", view.Status, StatusComplete)
	}
	if view.Snapshot.TotalIncoming == 0 {
		t.Fatal("expected the workload to emit requests")
	}
	if view.Summary == nil {
		t.Fatal("expected a completed experiment to have a summary")
	}
	if view.Summary.TotalAccepted < view.Summary.TotalCompleted {
		t.Fatalf("accepted = %d, completed = %d", view.Summary.TotalAccepted, view.Summary.TotalCompleted)
	}
}

func TestExperimentPublishesSnapshotsAndCanBeStopped(t *testing.T) {
	engine := NewEngine()
	experiment, err := engine.Start(context.Background(), StartConfig{
		ScenarioID:     "traffic-spike",
		Duration:       5 * time.Second,
		QueueCapacity:  64,
		Workers:        2,
		RequestTimeout: 200 * time.Millisecond,
		DrainGrace:     100 * time.Millisecond,
		Seed:           11,
	})
	if err != nil {
		t.Fatalf("start experiment: %v", err)
	}

	updates, unsubscribe := experiment.Subscribe()
	defer unsubscribe()
	select {
	case snapshot := <-updates:
		if snapshot.Status == "" {
			t.Fatal("expected a status in the first snapshot")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for a snapshot")
	}

	experiment.Stop()
	select {
	case <-experiment.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("experiment did not stop")
	}

	if got := experiment.View().Status; got != StatusStopped {
		t.Fatalf("status = %q, want %q", got, StatusStopped)
	}
}

func TestTrafficSpikeHitsTheBaselineSafetyCap(t *testing.T) {
	engine := NewEngine()
	experiment, err := engine.Start(context.Background(), StartConfig{
		ScenarioID:     "traffic-spike",
		Duration:       5 * time.Second,
		QueueCapacity:  64,
		Workers:        2,
		RequestTimeout: 250 * time.Millisecond,
		DrainGrace:     100 * time.Millisecond,
		Seed:           13,
	})
	if err != nil {
		t.Fatalf("start experiment: %v", err)
	}

	<-experiment.Done()
	summary := experiment.View().Summary
	if summary == nil {
		t.Fatal("expected a completed experiment to have a summary")
	}
	if summary.TotalRejected == 0 {
		t.Fatalf("expected the safety cap to reject work, summary = %+v", *summary)
	}
	if summary.MaxQueueDepth > 64 {
		t.Fatalf("max queue depth = %d, want <= 64", summary.MaxQueueDepth)
	}
}

func TestScenarioCatalogContainsThePhaseOnePresets(t *testing.T) {
	engine := NewEngine()
	got := engine.Scenarios()
	want := map[string]bool{
		"healthy":            false,
		"traffic-spike":      false,
		"slow-dependency":    false,
		"dependency-failure": false,
	}
	for _, scenario := range got {
		if _, ok := want[scenario.ID]; ok {
			want[scenario.ID] = true
		}
	}
	for id, present := range want {
		if !present {
			t.Errorf("scenario %q is missing", id)
		}
	}
}
