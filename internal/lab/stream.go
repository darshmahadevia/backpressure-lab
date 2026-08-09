package lab

import "sync"

type snapshotHub struct {
	mu          sync.Mutex
	subscribers map[chan Snapshot]struct{}
	latest      Snapshot
	closed      bool
}

func newSnapshotHub() *snapshotHub {
	return &snapshotHub{subscribers: make(map[chan Snapshot]struct{})}
}

func (h *snapshotHub) subscribe() (<-chan Snapshot, func()) {
	channel := make(chan Snapshot, 8)
	h.mu.Lock()
	if h.closed {
		channel <- h.latest
		close(channel)
		h.mu.Unlock()
		return channel, func() {}
	}
	h.subscribers[channel] = struct{}{}
	if h.latest.Status != "" {
		channel <- h.latest
	}
	h.mu.Unlock()

	return channel, func() {
		h.mu.Lock()
		if _, ok := h.subscribers[channel]; ok {
			delete(h.subscribers, channel)
			close(channel)
		}
		h.mu.Unlock()
	}
}

func (h *snapshotHub) publish(snapshot Snapshot) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.latest = snapshot
	for channel := range h.subscribers {
		enqueueLatest(channel, snapshot)
	}
}

func (h *snapshotHub) close(snapshot Snapshot) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.latest = snapshot
	h.closed = true
	for channel := range h.subscribers {
		enqueueLatest(channel, snapshot)
		close(channel)
		delete(h.subscribers, channel)
	}
}

func enqueueLatest(channel chan Snapshot, snapshot Snapshot) {
	select {
	case channel <- snapshot:
		return
	default:
	}
	select {
	case <-channel:
	default:
	}
	select {
	case channel <- snapshot:
	default:
	}
}
