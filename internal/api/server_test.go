package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/darshmahadevia/backpressure-lab/internal/lab"
)

func TestStartExperimentEndpointReturnsAnExperiment(t *testing.T) {
	server := NewServer(lab.NewEngine())
	request := httptest.NewRequest(http.MethodPost, "/api/experiments", strings.NewReader(`{"scenario":"healthy","durationSeconds":1}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusAccepted, recorder.Body.String())
	}
	var response struct {
		ID     string        `json:"id"`
		Status lab.RunStatus `json:"status"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.ID == "" {
		t.Fatal("expected an experiment id")
	}
	if response.Status != lab.StatusRunning {
		t.Fatalf("status = %q, want %q", response.Status, lab.StatusRunning)
	}
}

func TestConfiguredOriginReceivesCORSHeaders(t *testing.T) {
	t.Setenv("BACKPRESSURE_ALLOWED_ORIGINS", "https://lab.example.com, https://preview.example.com")
	server := NewServer(lab.NewEngine())
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	request.Header.Set("Origin", "https://lab.example.com")
	recorder := httptest.NewRecorder()

	server.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "https://lab.example.com" {
		t.Fatalf("allow-origin = %q, want configured origin", got)
	}
	if got := recorder.Header().Get("Vary"); got != "Origin" {
		t.Fatalf("vary = %q, want Origin", got)
	}
}

func TestUnconfiguredOriginDoesNotReceiveCORSHeaders(t *testing.T) {
	t.Setenv("BACKPRESSURE_ALLOWED_ORIGINS", "https://lab.example.com")
	server := NewServer(lab.NewEngine())
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	request.Header.Set("Origin", "https://untrusted.example.com")
	recorder := httptest.NewRecorder()

	server.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("allow-origin = %q, want no header for an unconfigured origin", got)
	}
}

func TestStreamEndpointSendsSnapshotEvents(t *testing.T) {
	engine := lab.NewEngine()
	server := NewServer(engine)
	experiment, err := engine.Start(context.Background(), lab.StartConfig{
		ScenarioID:     "healthy",
		Duration:       100 * time.Millisecond,
		QueueCapacity:  16,
		Workers:        2,
		RequestTimeout: 500 * time.Millisecond,
		DrainGrace:     100 * time.Millisecond,
		Seed:           3,
	})
	if err != nil {
		t.Fatalf("start experiment: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/experiments/"+experiment.ID()+"/stream", nil)
	recorder := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		server.ServeHTTP(recorder, request)
		close(done)
	}()

	select {
	case <-experiment.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("experiment did not complete")
	}
	request.Context() // keep the request's context alive until the terminal event is observed
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("stream did not close")
	}

	body := recorder.Body.String()
	if !strings.Contains(body, "event: snapshot") {
		t.Fatalf("stream body did not contain a snapshot event: %q", body)
	}
	if !strings.Contains(body, `"status":"complete"`) {
		t.Fatalf("stream body did not contain a terminal snapshot: %q", body)
	}
}
