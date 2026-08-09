import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import LabPage from './LabPage'
import { ThemeProvider } from './Theme'
import type { ExperimentView, ScenarioInfo, Snapshot } from './types'
import * as api from './api'

vi.mock('./api', () => ({
  fetchScenarios: vi.fn(),
  startExperiment: vi.fn(),
  getExperiment: vi.fn(),
  stopExperiment: vi.fn(),
  streamExperiment: vi.fn(),
}))

const scenarios: ScenarioInfo[] = [
  {
    id: 'traffic-spike',
    name: 'Sudden traffic spike',
    description: 'A spike for the test.',
    defaultDurationSeconds: 24,
    peakRate: 340,
  },
]

const runningView: ExperimentView = {
  id: 'exp-000001',
  scenario: scenarios[0],
  protectionProfile: 'baseline',
  status: 'running',
  startedAt: new Date().toISOString(),
  snapshot: {
    elapsedMs: 0,
    status: 'running',
    state: 'healthy',
    message: 'Traffic is below capacity.',
    incomingRate: 0,
    acceptedRate: 0,
    rejectedRate: 0,
    completedRate: 0,
    failedRate: 0,
    timeoutRate: 0,
    queueDepth: 0,
    maxQueueDepth: 0,
    activeOperations: 0,
    maxActiveOperations: 0,
    downstreamPressure: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    totalIncoming: 0,
    totalAccepted: 0,
    totalRejected: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalTimedOut: 0,
  },
}

const overloadedSnapshot: Snapshot = {
  ...runningView.snapshot,
  elapsedMs: 5_000,
  state: 'overloaded',
  message: 'The baseline is accepting work faster than workers can drain it.',
  incomingRate: 340,
  acceptedRate: 340,
  completedRate: 120,
  queueDepth: 1_487,
  maxQueueDepth: 1_487,
  activeOperations: 12,
  maxActiveOperations: 12,
  downstreamPressure: 1.5,
  p50LatencyMs: 830,
  p95LatencyMs: 1_500,
  p99LatencyMs: 1_501,
  totalIncoming: 1_700,
  totalAccepted: 1_700,
  totalCompleted: 600,
  totalTimedOut: 400,
}

describe('Backpressure Lab surfaces', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    vi.mocked(api.fetchScenarios).mockResolvedValue(scenarios)
    vi.mocked(api.startExperiment).mockResolvedValue(runningView)
    vi.mocked(api.streamExperiment).mockImplementation((_id, onSnapshot) => {
      onSnapshot(overloadedSnapshot)
      return vi.fn()
    })
  })

  it('gives the portfolio visitor a separate landing page', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /traffic outruns capacity/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /run a traffic spike/i })).toHaveAttribute('href', '/lab?scenario=traffic-spike')
    expect(screen.queryByRole('heading', { name: /the pipeline, right now/i })).not.toBeInTheDocument()
  })

  it('starts a lab run and surfaces the live overload signal', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/lab?scenario=traffic-spike')
    render(
      <ThemeProvider>
        <LabPage />
      </ThemeProvider>,
    )

    await user.click(await screen.findByRole('button', { name: /run experiment/i }))

    await waitFor(() => expect(api.startExperiment).toHaveBeenCalledWith('traffic-spike', 24))
    expect(screen.getByText('overloaded', { selector: '.status-chip' })).toBeInTheDocument()
    expect(screen.getAllByText(/accepting work faster than workers can drain/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('1,487').length).toBeGreaterThan(0)
  })
})
