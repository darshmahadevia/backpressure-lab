export type RunStatus = 'running' | 'draining' | 'complete' | 'stopped'
export type SystemState = 'healthy' | 'degrading' | 'overloaded' | 'recovering' | 'complete' | 'stopped'

export interface ScenarioInfo {
  id: string
  name: string
  description: string
  defaultDurationSeconds: number
  peakRate: number
}

export interface Snapshot {
  elapsedMs: number
  status: RunStatus | ''
  state: SystemState | ''
  message: string
  incomingRate: number
  acceptedRate: number
  rejectedRate: number
  completedRate: number
  failedRate: number
  timeoutRate: number
  queueDepth: number
  maxQueueDepth: number
  activeOperations: number
  maxActiveOperations: number
  downstreamPressure: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
  totalIncoming: number
  totalAccepted: number
  totalRejected: number
  totalCompleted: number
  totalFailed: number
  totalTimedOut: number
}

export interface Summary {
  durationMs: number
  totalIncoming: number
  totalAccepted: number
  totalRejected: number
  totalCompleted: number
  totalFailed: number
  totalTimedOut: number
  maxQueueDepth: number
  maxActiveOperations: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
}

export interface ExperimentView {
  id: string
  scenario: ScenarioInfo
  protectionProfile: string
  status: RunStatus
  startedAt: string
  snapshot: Snapshot
  summary?: Summary
}

export interface ChartPoint {
  elapsedMs: number
  incomingRate: number
  completedRate: number
  queueDepth: number
  p95LatencyMs: number
}
