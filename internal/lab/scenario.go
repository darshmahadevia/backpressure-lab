package lab

import "time"

type downstreamBehavior struct {
	baseLatency        time.Duration
	jitter             time.Duration
	failureProbability float64
}

type scenario struct {
	info       ScenarioInfo
	rateAt     func(time.Duration) float64
	behaviorAt func(time.Duration) downstreamBehavior
}

func scenarioCatalog() []scenario {
	return []scenario{
		{
			info: ScenarioInfo{
				ID:                     "healthy",
				Name:                   "Healthy system",
				Description:            "Traffic stays below the worker pool's effective capacity.",
				DefaultDurationSeconds: 18,
				PeakRate:               45,
			},
			rateAt: func(time.Duration) float64 { return 45 },
			behaviorAt: func(time.Duration) downstreamBehavior {
				return downstreamBehavior{baseLatency: 70 * time.Millisecond, jitter: 12 * time.Millisecond}
			},
		},
		{
			info: ScenarioInfo{
				ID:                     "traffic-spike",
				Name:                   "Sudden traffic spike",
				Description:            "A safe warmup jumps above capacity, then eases so recovery is visible.",
				DefaultDurationSeconds: 24,
				PeakRate:               340,
			},
			rateAt: func(elapsed time.Duration) float64 {
				switch {
				case elapsed < 4*time.Second:
					return 35
				case elapsed < 14*time.Second:
					return 340
				default:
					return 45
				}
			},
			behaviorAt: func(time.Duration) downstreamBehavior {
				return downstreamBehavior{baseLatency: 75 * time.Millisecond, jitter: 15 * time.Millisecond}
			},
		},
		{
			info: ScenarioInfo{
				ID:                     "slow-dependency",
				Name:                   "Slow dependency",
				Description:            "The downstream service becomes several times slower while traffic stays steady.",
				DefaultDurationSeconds: 22,
				PeakRate:               70,
			},
			rateAt: func(time.Duration) float64 { return 70 },
			behaviorAt: func(elapsed time.Duration) downstreamBehavior {
				switch {
				case elapsed < 5*time.Second:
					return downstreamBehavior{baseLatency: 70 * time.Millisecond, jitter: 12 * time.Millisecond}
				case elapsed < 15*time.Second:
					return downstreamBehavior{baseLatency: 430 * time.Millisecond, jitter: 45 * time.Millisecond}
				default:
					return downstreamBehavior{baseLatency: 90 * time.Millisecond, jitter: 15 * time.Millisecond}
				}
			},
		},
		{
			info: ScenarioInfo{
				ID:                     "dependency-failure",
				Name:                   "Dependency failure",
				Description:            "A downstream failure window creates errors while traffic continues.",
				DefaultDurationSeconds: 20,
				PeakRate:               90,
			},
			rateAt: func(time.Duration) float64 { return 90 },
			behaviorAt: func(elapsed time.Duration) downstreamBehavior {
				if elapsed >= 4*time.Second && elapsed < 12*time.Second {
					return downstreamBehavior{baseLatency: 110 * time.Millisecond, jitter: 18 * time.Millisecond, failureProbability: 0.55}
				}
				return downstreamBehavior{baseLatency: 75 * time.Millisecond, jitter: 12 * time.Millisecond}
			},
		},
	}
}

func findScenario(id string) (scenario, bool) {
	for _, candidate := range scenarioCatalog() {
		if candidate.info.ID == id {
			return candidate, true
		}
	}
	return scenario{}, false
}
