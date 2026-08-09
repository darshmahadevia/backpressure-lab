package lab

import "time"

// RunStatus describes the lifecycle of one experiment.
type RunStatus string

const (
	StatusRunning  RunStatus = "running"
	StatusDraining RunStatus = "draining"
	StatusComplete RunStatus = "complete"
	StatusStopped  RunStatus = "stopped"
)

// SystemState is the operator-facing interpretation of a snapshot.
type SystemState string

const (
	StateHealthy    SystemState = "healthy"
	StateDegrading  SystemState = "degrading"
	StateOverloaded SystemState = "overloaded"
	StateRecovering SystemState = "recovering"
	StateComplete   SystemState = "complete"
	StateStopped    SystemState = "stopped"
)

type ScenarioInfo struct {
	ID                     string  `json:"id"`
	Name                   string  `json:"name"`
	Description            string  `json:"description"`
	DefaultDurationSeconds int     `json:"defaultDurationSeconds"`
	PeakRate               float64 `json:"peakRate"`
}

type StartConfig struct {
	ScenarioID     string
	Duration       time.Duration
	QueueCapacity  int
	Workers        int
	RequestTimeout time.Duration
	DrainGrace     time.Duration
	Seed           int64
}

func DefaultStartConfig(scenarioID string) StartConfig {
	return StartConfig{
		ScenarioID:     scenarioID,
		QueueCapacity:  2_000,
		Workers:        12,
		RequestTimeout: 1_500 * time.Millisecond,
		DrainGrace:     5 * time.Second,
		Seed:           time.Now().UnixNano(),
	}
}

type Snapshot struct {
	ElapsedMS           int64       `json:"elapsedMs"`
	Status              RunStatus   `json:"status"`
	State               SystemState `json:"state"`
	Message             string      `json:"message"`
	IncomingRate        float64     `json:"incomingRate"`
	AcceptedRate        float64     `json:"acceptedRate"`
	RejectedRate        float64     `json:"rejectedRate"`
	CompletedRate       float64     `json:"completedRate"`
	FailedRate          float64     `json:"failedRate"`
	TimeoutRate         float64     `json:"timeoutRate"`
	QueueDepth          int         `json:"queueDepth"`
	MaxQueueDepth       int         `json:"maxQueueDepth"`
	ActiveOperations    int         `json:"activeOperations"`
	MaxActiveOperations int         `json:"maxActiveOperations"`
	DownstreamPressure  float64     `json:"downstreamPressure"`
	P50LatencyMS        float64     `json:"p50LatencyMs"`
	P95LatencyMS        float64     `json:"p95LatencyMs"`
	P99LatencyMS        float64     `json:"p99LatencyMs"`
	TotalIncoming       int64       `json:"totalIncoming"`
	TotalAccepted       int64       `json:"totalAccepted"`
	TotalRejected       int64       `json:"totalRejected"`
	TotalCompleted      int64       `json:"totalCompleted"`
	TotalFailed         int64       `json:"totalFailed"`
	TotalTimedOut       int64       `json:"totalTimedOut"`
}

type Summary struct {
	DurationMS          int64   `json:"durationMs"`
	TotalIncoming       int64   `json:"totalIncoming"`
	TotalAccepted       int64   `json:"totalAccepted"`
	TotalRejected       int64   `json:"totalRejected"`
	TotalCompleted      int64   `json:"totalCompleted"`
	TotalFailed         int64   `json:"totalFailed"`
	TotalTimedOut       int64   `json:"totalTimedOut"`
	MaxQueueDepth       int     `json:"maxQueueDepth"`
	MaxActiveOperations int     `json:"maxActiveOperations"`
	P50LatencyMS        float64 `json:"p50LatencyMs"`
	P95LatencyMS        float64 `json:"p95LatencyMs"`
	P99LatencyMS        float64 `json:"p99LatencyMs"`
}

type ExperimentView struct {
	ID                string       `json:"id"`
	Scenario          ScenarioInfo `json:"scenario"`
	ProtectionProfile string       `json:"protectionProfile"`
	Status            RunStatus    `json:"status"`
	StartedAt         time.Time    `json:"startedAt"`
	Snapshot          Snapshot     `json:"snapshot"`
	Summary           *Summary     `json:"summary,omitempty"`
}
