package lab

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

var ErrUnknownScenario = errors.New("unknown scenario")

// Engine owns the isolated experiments exposed by the API.
type Engine struct {
	mu          sync.RWMutex
	experiments map[string]*Experiment
	nextID      atomic.Uint64
}

func NewEngine() *Engine {
	return &Engine{experiments: make(map[string]*Experiment)}
}

func (e *Engine) Scenarios() []ScenarioInfo {
	catalog := scenarioCatalog()
	result := make([]ScenarioInfo, 0, len(catalog))
	for _, candidate := range catalog {
		result = append(result, candidate.info)
	}
	return result
}

func (e *Engine) Start(parent context.Context, config StartConfig) (*Experiment, error) {
	candidate, ok := findScenario(config.ScenarioID)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrUnknownScenario, config.ScenarioID)
	}
	config = normalizeConfig(config, candidate.info)
	startedAt := time.Now()
	id := fmt.Sprintf("exp-%06d", e.nextID.Add(1))
	ctx, cancel := context.WithCancel(parent)
	experiment := &Experiment{
		id:         id,
		config:     config,
		scenario:   candidate,
		startedAt:  startedAt,
		ctx:        ctx,
		cancel:     cancel,
		queue:      make(chan request, config.QueueCapacity),
		recorder:   newRecorder(startedAt),
		dependency: newDependency(startedAt, candidate.behaviorAt, config.Seed),
		hub:        newSnapshotHub(),
		done:       make(chan struct{}),
		status:     StatusRunning,
	}

	e.mu.Lock()
	e.experiments[id] = experiment
	e.mu.Unlock()

	go experiment.run()
	return experiment, nil
}

func normalizeConfig(config StartConfig, info ScenarioInfo) StartConfig {
	if config.Duration <= 0 {
		config.Duration = time.Duration(info.DefaultDurationSeconds) * time.Second
	}
	if config.Duration < 100*time.Millisecond {
		config.Duration = 100 * time.Millisecond
	}
	if config.Duration > 60*time.Second {
		config.Duration = 60 * time.Second
	}
	if config.QueueCapacity <= 0 {
		config.QueueCapacity = 2_000
	}
	if config.QueueCapacity > 20_000 {
		config.QueueCapacity = 20_000
	}
	if config.Workers <= 0 {
		config.Workers = 12
	}
	if config.Workers > 64 {
		config.Workers = 64
	}
	if config.RequestTimeout <= 0 {
		config.RequestTimeout = 1_500 * time.Millisecond
	}
	if config.DrainGrace <= 0 {
		config.DrainGrace = 5 * time.Second
	}
	if config.DrainGrace > 15*time.Second {
		config.DrainGrace = 15 * time.Second
	}
	if config.Seed == 0 {
		config.Seed = time.Now().UnixNano()
	}
	return config
}

func (e *Engine) Get(id string) (*Experiment, bool) {
	e.mu.RLock()
	experiment, ok := e.experiments[id]
	e.mu.RUnlock()
	return experiment, ok
}

type request struct {
	createdAt time.Time
	ctx       context.Context
	cancel    context.CancelFunc
}

// Experiment is the public seam for lifecycle, snapshots, and summary data.
type Experiment struct {
	id        string
	config    StartConfig
	scenario  scenario
	startedAt time.Time

	ctx    context.Context
	cancel context.CancelFunc
	queue  chan request

	recorder   *recorder
	dependency *dependency
	hub        *snapshotHub
	done       chan struct{}

	mu            sync.RWMutex
	status        RunStatus
	stopRequested bool
	snapshot      Snapshot
	summary       *Summary
}

func (x *Experiment) ID() string {
	return x.id
}

func (x *Experiment) Done() <-chan struct{} {
	return x.done
}

func (x *Experiment) Stop() {
	x.mu.Lock()
	if x.status == StatusRunning || x.status == StatusDraining {
		x.stopRequested = true
	}
	x.mu.Unlock()
	x.cancel()
}

func (x *Experiment) Subscribe() (<-chan Snapshot, func()) {
	return x.hub.subscribe()
}

func (x *Experiment) View() ExperimentView {
	x.mu.RLock()
	defer x.mu.RUnlock()
	var summary *Summary
	if x.summary != nil {
		copy := *x.summary
		summary = &copy
	}
	return ExperimentView{
		ID:                x.id,
		Scenario:          x.scenario.info,
		ProtectionProfile: "baseline",
		Status:            x.status,
		StartedAt:         x.startedAt,
		Snapshot:          x.snapshot,
		Summary:           summary,
	}
}

func (x *Experiment) run() {
	var workers sync.WaitGroup
	for i := 0; i < x.config.Workers; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			x.worker()
		}()
	}

	snapshotStop := make(chan struct{})
	var snapshots sync.WaitGroup
	snapshots.Add(1)
	go func() {
		defer snapshots.Done()
		x.snapshotLoop(snapshotStop)
	}()

	workloadDone := make(chan struct{})
	go x.generateWorkload(workloadDone)
	<-workloadDone

	x.setStatus(StatusDraining)
	workerDone := make(chan struct{})
	go func() {
		workers.Wait()
		close(workerDone)
	}()

	if x.wasStopped() {
		x.cancel()
	} else {
		timer := time.NewTimer(x.config.DrainGrace)
		select {
		case <-workerDone:
			timer.Stop()
		case <-timer.C:
			x.cancel()
			<-workerDone
		}
	}

	close(snapshotStop)
	snapshots.Wait()

	status := StatusComplete
	if x.wasStopped() {
		status = StatusStopped
	}
	finalSnapshot := x.recorder.snapshot(time.Now(), status, len(x.queue), x.dependency.activeOperations(), x.dependency.pressure(), x.dependency.maxActiveOperations())
	finalSummary := x.recorder.summary(time.Now(), len(x.queue), x.dependency.activeOperations(), x.dependency.maxActiveOperations(), x.dependency.pressure())
	x.mu.Lock()
	x.status = status
	x.snapshot = finalSnapshot
	x.summary = &finalSummary
	x.mu.Unlock()
	x.hub.close(finalSnapshot)
	close(x.done)
	x.cancel()
}

func (x *Experiment) generateWorkload(done chan<- struct{}) {
	defer close(done)
	defer close(x.queue)

	started := time.Now()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	var carry float64

	for {
		elapsed := time.Since(started)
		if elapsed >= x.config.Duration {
			return
		}
		select {
		case <-x.ctx.Done():
			return
		case now := <-ticker.C:
			interval := now.Sub(started)
			rate := x.scenario.rateAt(interval)
			carry += rate * 0.01
			count := int(carry)
			carry -= float64(count)
			for i := 0; i < count; i++ {
				x.emitRequest()
			}
		}
	}
}

func (x *Experiment) emitRequest() {
	x.recorder.observeIncoming()
	requestContext, cancel := context.WithTimeout(x.ctx, x.config.RequestTimeout)
	work := request{createdAt: time.Now(), ctx: requestContext, cancel: cancel}
	select {
	case x.queue <- work:
		x.recorder.observeAccepted()
	default:
		cancel()
		x.recorder.observeRejected()
	}
}

func (x *Experiment) worker() {
	for {
		select {
		case <-x.ctx.Done():
			return
		case work, ok := <-x.queue:
			if !ok {
				return
			}
			x.process(work)
		}
	}
}

func (x *Experiment) process(work request) {
	defer work.cancel()
	if err := work.ctx.Err(); err != nil {
		x.recorder.observeTimedOut(time.Since(work.createdAt))
		return
	}

	elapsed := time.Since(x.startedAt)
	err := x.dependency.call(work.ctx, elapsed)
	latency := time.Since(work.createdAt)
	switch {
	case err == nil:
		x.recorder.observeCompleted(latency)
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		x.recorder.observeTimedOut(latency)
	default:
		x.recorder.observeFailed(latency)
	}
}

func (x *Experiment) snapshotLoop(stop <-chan struct{}) {
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			x.publishSnapshot()
		}
	}
}

func (x *Experiment) publishSnapshot() {
	x.mu.RLock()
	status := x.status
	x.mu.RUnlock()
	snapshot := x.recorder.snapshot(time.Now(), status, len(x.queue), x.dependency.activeOperations(), x.dependency.pressure(), x.dependency.maxActiveOperations())
	x.mu.Lock()
	x.snapshot = snapshot
	x.mu.Unlock()
	x.hub.publish(snapshot)
}

func (x *Experiment) setStatus(status RunStatus) {
	x.mu.Lock()
	x.status = status
	x.mu.Unlock()
	x.publishSnapshot()
}

func (x *Experiment) wasStopped() bool {
	x.mu.RLock()
	stopped := x.stopRequested
	x.mu.RUnlock()
	return stopped
}
