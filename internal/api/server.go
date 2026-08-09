package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/darshmahadevia/backpressure-lab/internal/lab"
)

type Server struct {
	engine *lab.Engine
	mux    *http.ServeMux
}

func NewServer(engine *lab.Engine) http.Handler {
	server := &Server{engine: engine, mux: http.NewServeMux()}
	server.mux.HandleFunc("GET /healthz", server.health)
	server.mux.HandleFunc("GET /api/scenarios", server.scenarios)
	server.mux.HandleFunc("POST /api/experiments", server.startExperiment)
	server.mux.HandleFunc("/api/experiments/", server.experiment)
	return withCORS(server.mux)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) scenarios(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.engine.Scenarios())
}

type startRequest struct {
	Scenario        string `json:"scenario"`
	DurationSeconds int    `json:"durationSeconds"`
	Seed            int64  `json:"seed"`
}

func (s *Server) startExperiment(w http.ResponseWriter, request *http.Request) {
	var input startRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, 4<<10)).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "request body must be valid JSON")
		return
	}
	if input.Scenario == "" {
		input.Scenario = "traffic-spike"
	}
	config := lab.DefaultStartConfig(input.Scenario)
	if input.DurationSeconds > 0 {
		config.Duration = time.Duration(input.DurationSeconds) * time.Second
	}
	if input.Seed != 0 {
		config.Seed = input.Seed
	}
	experiment, err := s.engine.Start(context.Background(), config)
	if err != nil {
		if errors.Is(err, lab.ErrUnknownScenario) {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "could not start experiment")
		return
	}
	writeJSON(w, http.StatusAccepted, experiment.View())
}

func (s *Server) experiment(w http.ResponseWriter, request *http.Request) {
	path := strings.TrimPrefix(request.URL.Path, "/api/experiments/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "experiment not found")
		return
	}
	experiment, ok := s.engine.Get(parts[0])
	if !ok {
		writeError(w, http.StatusNotFound, "experiment not found")
		return
	}
	if len(parts) == 2 && parts[1] == "stream" && request.Method == http.MethodGet {
		s.stream(w, request, experiment)
		return
	}
	if len(parts) == 2 && parts[1] == "stop" && request.Method == http.MethodPost {
		experiment.Stop()
		writeJSON(w, http.StatusAccepted, experiment.View())
		return
	}
	if len(parts) == 1 && request.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, experiment.View())
		return
	}
	writeError(w, http.StatusNotFound, "experiment endpoint not found")
}

func (s *Server) stream(w http.ResponseWriter, request *http.Request, experiment *lab.Experiment) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is not supported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	updates, unsubscribe := experiment.Subscribe()
	defer unsubscribe()
	for {
		select {
		case <-request.Context().Done():
			return
		case snapshot, open := <-updates:
			if !open {
				return
			}
			payload, err := json.Marshal(snapshot)
			if err != nil {
				return
			}
			_, _ = fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", payload)
			flusher.Flush()
			if snapshot.Status == lab.StatusComplete || snapshot.Status == lab.StatusStopped {
				return
			}
		}
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if request.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, request)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error":  message,
		"status": strconv.Itoa(status),
	})
}
