package lab

import (
	"context"
	"errors"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"
)

var errDependencyFailure = errors.New("downstream dependency failed")

type dependency struct {
	behaviorAt      func(time.Duration) downstreamBehavior
	startedAt       time.Time
	healthyCapacity int64

	active    atomic.Int64
	maxActive atomic.Int64
	randomMu  sync.Mutex
	random    *rand.Rand
}

func newDependency(startedAt time.Time, behaviorAt func(time.Duration) downstreamBehavior, seed int64) *dependency {
	return &dependency{
		behaviorAt:      behaviorAt,
		startedAt:       startedAt,
		healthyCapacity: 8,
		random:          rand.New(rand.NewSource(seed)),
	}
}

func (d *dependency) call(ctx context.Context, elapsed time.Duration) error {
	behavior := d.behaviorAt(elapsed)
	active := d.active.Add(1)
	defer d.active.Add(-1)
	d.updateMax(active)

	contention := 1.0
	if active > d.healthyCapacity {
		contention += 0.45 * float64(active-d.healthyCapacity)
	}
	jitter := d.randomDuration(behavior.jitter)
	delay := time.Duration(float64(behavior.baseLatency)*contention) + jitter

	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
	}

	if behavior.failureProbability > 0 && d.randomFloat() < behavior.failureProbability {
		return errDependencyFailure
	}
	return nil
}

func (d *dependency) randomDuration(max time.Duration) time.Duration {
	if max <= 0 {
		return 0
	}
	d.randomMu.Lock()
	value := d.random.Int63n(int64(max)*2 + 1)
	d.randomMu.Unlock()
	return time.Duration(value - int64(max))
}

func (d *dependency) randomFloat() float64 {
	d.randomMu.Lock()
	value := d.random.Float64()
	d.randomMu.Unlock()
	return value
}

func (d *dependency) updateMax(value int64) {
	for {
		current := d.maxActive.Load()
		if value <= current || d.maxActive.CompareAndSwap(current, value) {
			return
		}
	}
}

func (d *dependency) activeOperations() int {
	return int(d.active.Load())
}

func (d *dependency) maxActiveOperations() int {
	return int(d.maxActive.Load())
}

func (d *dependency) pressure() float64 {
	return float64(d.active.Load()) / float64(d.healthyCapacity)
}
