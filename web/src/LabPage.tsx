import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleStop,
  Clock3,
  Database,
  Gauge,
  Layers3,
  Play,
  Radio,
  RefreshCw,
  Server,
  TriangleAlert,
  WifiOff,
  X,
} from 'lucide-react'
import { fetchScenarios, getExperiment, startExperiment, stopExperiment, streamExperiment } from './api'
import { ScenarioPicker } from './ScenarioPicker'
import { ThemeToggle } from './Theme'
import type { ChartPoint, ExperimentView, ScenarioInfo, Snapshot, SystemState } from './types'

const emptySnapshot: Snapshot = {
  elapsedMs: 0,
  status: '',
  state: '',
  message: 'Choose a condition and start a run to collect live system signal.',
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
}

const stateLabels: Record<SystemState | '', string> = {
  '': 'standby',
  healthy: 'healthy',
  degrading: 'degrading',
  overloaded: 'overloaded',
  recovering: 'recovering',
  complete: 'complete',
  stopped: 'stopped',
}

const stateGuidance: Record<SystemState | '', { headline: string; watch: string; next: string }> = {
  '': {
    headline: 'Ready to observe',
    watch: 'No live data yet',
    next: 'choose a condition and run it',
  },
  healthy: {
    headline: 'Capacity is keeping up',
    watch: 'queue depth stays near zero',
    next: 'compare offered work with completed work',
  },
  degrading: {
    headline: 'Capacity is getting tighter',
    watch: 'tail latency is widening',
    next: 'watch whether waiting work begins to accumulate',
  },
  overloaded: {
    headline: 'Work is arriving faster than it drains',
    watch: 'queue depth and p99 latency',
    next: 'let the run continue to see the recovery cost',
  },
  recovering: {
    headline: 'The backlog is draining',
    watch: 'completed rate catching up with incoming rate',
    next: 'look for queue depth and latency to fall',
  },
  complete: {
    headline: 'The experiment has finished',
    watch: 'the terminal summary below',
    next: 'change one condition and run it again',
  },
  stopped: {
    headline: 'The experiment was stopped',
    watch: 'the work left at stop time',
    next: 'run the same condition again or choose another',
  },
}

type StreamState = 'idle' | 'connecting' | 'live' | 'disconnected' | 'closed'

const streamLabels: Record<StreamState, string> = {
  idle: 'feed idle',
  connecting: 'connecting live feed',
  live: 'live feed',
  disconnected: 'feed disconnected',
  closed: 'feed closed',
}

function initialScenarioFromUrl(): string {
  return new URLSearchParams(window.location.search).get('scenario') ?? 'traffic-spike'
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatRate(value: number): string {
  return `${formatNumber(value)}/s`
}

function formatLatency(value: number): string {
  if (value < 1) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`
  return `${Math.round(value)} ms`
}

function formatDuration(value: number): string {
  return `${Math.max(0, Math.round(value / 1000))} s`
}

function stateIcon(state: SystemState | ''): LucideIcon {
  if (state === 'overloaded') return TriangleAlert
  if (state === 'degrading' || state === 'recovering') return AlertCircle
  if (state === 'complete') return CheckCircle2
  if (state === 'stopped') return CircleStop
  return Activity
}

function terminalStatus(status?: string): boolean {
  return status === 'complete' || status === 'stopped'
}

export default function LabPage() {
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([])
  const [selectedScenario, setSelectedScenario] = useState(initialScenarioFromUrl)
  const [duration, setDuration] = useState(24)
  const [experiment, setExperiment] = useState<ExperimentView | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [history, setHistory] = useState<ChartPoint[]>([])
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true)
  const [scenarioLoadAttempt, setScenarioLoadAttempt] = useState(0)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [streamState, setStreamState] = useState<StreamState>('idle')
  const [error, setError] = useState<string | null>(null)
  const cleanupStream = useRef<(() => void) | null>(null)
  const terminalStream = useRef(false)

  useEffect(() => {
    let active = true
    setIsLoadingScenarios(true)
    setScenarioError(null)

    fetchScenarios()
      .then((available) => {
        if (!active) return
        setScenarios(available)
        const selected = available.find((scenario) => scenario.id === selectedScenario) ?? available[0]
        if (selected) {
          setSelectedScenario(selected.id)
          setDuration(selected.defaultDurationSeconds)
        }
      })
      .catch(() => {
        if (active) setScenarioError('The API did not return the scenario presets. Check the API URL, then try again.')
      })
      .finally(() => {
        if (active) setIsLoadingScenarios(false)
      })

    return () => {
      active = false
    }
  }, [scenarioLoadAttempt])

  useEffect(() => () => cleanupStream.current?.(), [])

  const selected = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenario),
    [scenarios, selectedScenario],
  )
  const isActive = experiment?.status === 'running' || experiment?.status === 'draining'
  const currentState = snapshot.state || (experiment ? 'healthy' : '')
  const statusText = experiment ? stateLabels[currentState] : 'ready'
  const StateIcon = stateIcon(currentState)
  const hasData = history.length > 1
  const hasRun = Boolean(experiment)
  const guidance = stateGuidance[currentState]
  const canStart = Boolean(selected) && !isActive && !isStarting && !isLoadingScenarios

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenario(scenarioId)
    const scenario = scenarios.find((item) => item.id === scenarioId)
    if (scenario) setDuration(scenario.defaultDurationSeconds)
    window.history.replaceState(null, '', `/lab?scenario=${scenarioId}`)
  }

  const connectToExperiment = (id: string) => {
    cleanupStream.current?.()
    terminalStream.current = false
    setStreamState('connecting')
    cleanupStream.current = streamExperiment(
      id,
      (nextSnapshot) => {
        terminalStream.current = terminalStatus(nextSnapshot.status)
        setStreamState(terminalStream.current ? 'closed' : 'live')
        setSnapshot(nextSnapshot)
        setHistory((current) => [
          ...current,
          {
            elapsedMs: nextSnapshot.elapsedMs,
            incomingRate: nextSnapshot.incomingRate,
            completedRate: nextSnapshot.completedRate,
            queueDepth: nextSnapshot.queueDepth,
            p95LatencyMs: nextSnapshot.p95LatencyMs,
          },
        ].slice(-96))
        setExperiment((current) => current ? { ...current, status: nextSnapshot.status || current.status, snapshot: nextSnapshot } : current)
        if (terminalStream.current) {
          void getExperiment(id)
            .then((view) => {
              setExperiment(view)
              setSnapshot(view.snapshot)
            })
            .catch(() => undefined)
        }
      },
      () => {
        if (terminalStream.current) return
        setStreamState('disconnected')
        setError('Live updates disconnected. The API may still be running; reconnect to continue watching.')
      },
    )
  }

  const handleStart = async () => {
    cleanupStream.current?.()
    cleanupStream.current = null
    setIsStarting(true)
    setIsStopping(false)
    setStreamState('connecting')
    setError(null)
    setScenarioError(null)
    setExperiment(null)
    setSnapshot(emptySnapshot)
    setHistory([])
    try {
      const next = await startExperiment(selectedScenario, duration)
      setExperiment(next)
      setSnapshot({ ...emptySnapshot, ...next.snapshot, status: next.status })
      connectToExperiment(next.id)
    } catch {
      setStreamState('idle')
      setError('The experiment could not start. Check the API connection and try again.')
    } finally {
      setIsStarting(false)
    }
  }

  const handleStop = async () => {
    if (!experiment || !isActive) return
    setIsStopping(true)
    setError(null)
    try {
      await stopExperiment(experiment.id)
    } catch {
      setError('The experiment could not be stopped. Check the API connection and try again.')
    } finally {
      setIsStopping(false)
    }
  }

  const handleReconnect = async () => {
    if (!experiment) return
    setError(null)
    try {
      const latest = await getExperiment(experiment.id)
      setExperiment(latest)
      setSnapshot(latest.snapshot)
      if (terminalStatus(latest.status)) {
        setStreamState('closed')
        return
      }
      connectToExperiment(latest.id)
    } catch {
      setStreamState('disconnected')
      setError('The live feed could not reconnect. Check the API connection and try again.')
    }
  }

  return (
    <div className="lab-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="lab-header">
        <a className="lab-back" href="/">
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Overview</span>
        </a>
        <a className="lab-title" href="/" aria-label="Backpressure Lab home">BACKPRESSURE LAB <span>/ LAB</span></a>
        <div className="lab-header-actions">
          <StatusChip state={currentState} label={statusText} />
          <FeedStatus state={streamState} />
          <ThemeToggle />
        </div>
      </header>

      <main className="lab-main" id="main-content">
        <section className="lab-intro" aria-labelledby="lab-title">
          <div className="lab-intro-copy">
            <h1 id="lab-title">Run a condition.</h1>
            <p>Choose what changes underneath the service, then watch what arrives, what waits, what is executing, and what actually finishes.</p>
          </div>
          <div className="lab-intro-meta" aria-label="Experiment status">
            <span>RUN STATUS</span>
            <strong>{experiment ? statusText : 'ready to observe'}</strong>
            <span className="elapsed-label">{experiment ? `${formatDuration(snapshot.elapsedMs)} elapsed` : 'no run yet'}</span>
            {experiment && <span className="run-id">{experiment.id}</span>}
          </div>
        </section>

        <section className="lab-controls" aria-labelledby="controls-title">
          <div className="control-heading">
            <div>
              <h2 id="controls-title">Set the experiment</h2>
              <p>Change one condition at a time so the cause stays legible in the live view.</p>
            </div>
            <span className="control-baseline">baseline / no user-facing protection</span>
          </div>
          <ScenarioPicker
            options={scenarios}
            value={selectedScenario}
            onChange={handleScenarioChange}
            disabled={isActive || isStarting || isLoadingScenarios}
          />
          <div className="control-footer">
            <label className="duration-control">
              <span>Run duration <strong>{duration}s</strong></span>
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                disabled={isActive || isStarting}
                aria-label="Experiment duration in seconds"
                aria-valuetext={`${duration} seconds`}
              />
            </label>
            <div className="lab-actions">
              <button className="button button-primary" type="button" onClick={() => void handleStart()} disabled={!canStart}>
                <Play size={14} fill="currentColor" aria-hidden="true" />
                {isStarting ? 'Starting…' : 'Run experiment'}
              </button>
              {isActive && (
                <button className="button button-stop" type="button" onClick={() => void handleStop()} disabled={isStopping}>
                  <CircleStop size={14} aria-hidden="true" />
                  {isStopping ? 'Stopping…' : 'Stop run'}
                </button>
              )}
            </div>
          </div>
          {selected && <p className="selected-note">{selected.description} Peak offered rate: {formatRate(selected.peakRate)}.</p>}
        </section>

        {scenarioError && (
          <div className="error-banner" role="alert">
            <WifiOff size={15} aria-hidden="true" />
            <div className="error-copy">
              <strong>Scenario presets unavailable</strong>
              <span>{scenarioError}</span>
            </div>
            <button className="button button-small" type="button" onClick={() => setScenarioLoadAttempt((attempt) => attempt + 1)}>
              <RefreshCw size={13} aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {error && (
          <div className="error-banner" role="alert">
            <WifiOff size={15} aria-hidden="true" />
            <div className="error-copy">
              <strong>Connection needs attention</strong>
              <span>{error}</span>
            </div>
            {streamState === 'disconnected' && isActive && (
              <button className="button button-small" type="button" onClick={() => void handleReconnect()}>
                <RefreshCw size={13} aria-hidden="true" />
                Reconnect
              </button>
            )}
            <button className="icon-button" type="button" onClick={() => setError(null)} aria-label="Dismiss connection message"><X size={15} aria-hidden="true" /></button>
          </div>
        )}

        <section className="run-model" aria-labelledby="run-model-title">
          <div className="run-model-copy">
            <h2 id="run-model-title">What stays fixed</h2>
            <p>The selected condition changes traffic or the dependency. The processing model stays the same, making the resulting tradeoff easier to read.</p>
          </div>
          <dl className="run-model-grid">
            <div><dt>worker slots</dt><dd>12</dd></div>
            <div><dt>request deadline</dt><dd>1.5 s</dd></div>
            <div><dt>queue safety cap</dt><dd>2,000</dd></div>
            <div><dt>profile</dt><dd>baseline</dd></div>
            <div><dt>data source</dt><dd>real run</dd></div>
          </dl>
          <p className="run-model-footnote">The safety cap protects this demo process. It is not the overload strategy being taught.</p>
        </section>

        <section className="observation-section" aria-labelledby="observation-title">
          <div className="section-bar">
            <div className="section-bar-copy">
              <h2 id="observation-title">The pipeline, right now</h2>
              <p>Read left to right: offered work, admitted work, waiting work, active slots, then downstream pressure.</p>
            </div>
            <span className="run-observation"><Clock3 size={13} aria-hidden="true" /> {experiment ? formatDuration(snapshot.elapsedMs) : 'waiting for a run'}</span>
          </div>

          <div className="pipeline" aria-label="Request processing pipeline">
            <PipelineStage
              icon={Radio}
              label="incoming"
              value={hasRun ? formatRate(snapshot.incomingRate) : '—'}
              detail={hasRun ? `${formatNumber(snapshot.totalIncoming)} total` : 'no work emitted'}
              state={hasRun ? (isActive ? 'emitting' : 'finished') : 'idle'}
              tone="accent"
            />
            <PipelineArrow />
            <PipelineStage
              icon={Layers3}
              label="admission"
              value={hasRun ? formatRate(snapshot.acceptedRate) : '—'}
              detail={hasRun ? `${formatNumber(snapshot.totalRejected)} safety-cap rejected` : 'no admissions yet'}
              state={hasRun ? (snapshot.totalRejected > 0 ? 'cap active' : 'accepting') : 'idle'}
              tone="muted"
            />
            <PipelineArrow />
            <PipelineStage
              icon={Gauge}
              label="queue"
              value={hasRun ? formatNumber(snapshot.queueDepth) : '—'}
              detail={hasRun ? `peak ${formatNumber(snapshot.maxQueueDepth)}` : 'not measured'}
              state={hasRun ? (snapshot.queueDepth > 0 ? 'work waiting' : 'clear') : 'not measured'}
              tone={snapshot.queueDepth > 0 ? 'warning' : 'neutral'}
              progress={hasRun ? Math.min(100, snapshot.queueDepth / 20) : undefined}
            />
            <PipelineArrow />
            <PipelineStage
              icon={Server}
              label="workers"
              value={hasRun ? `${snapshot.activeOperations} active` : '—'}
              detail={hasRun ? `${formatRate(snapshot.completedRate)} completed` : 'no slots in use'}
              state={hasRun ? (snapshot.activeOperations >= 12 ? 'all slots busy' : `${12 - snapshot.activeOperations} slots free`) : 'idle'}
              tone={hasRun ? 'signal' : 'neutral'}
              progress={hasRun ? Math.min(100, snapshot.activeOperations / 12 * 100) : undefined}
            />
            <PipelineArrow />
            <PipelineStage
              icon={Database}
              label="dependency"
              value={hasRun ? `${Math.round(snapshot.downstreamPressure * 100)}%` : '—'}
              detail="downstream pressure"
              state={hasRun ? (snapshot.downstreamPressure > 1 ? 'under pressure' : 'within baseline') : 'not measured'}
              tone={!hasRun ? 'neutral' : snapshot.downstreamPressure > 1 ? 'danger' : 'signal'}
              progress={hasRun ? Math.min(100, snapshot.downstreamPressure * 100) : undefined}
            />
          </div>

          <section className={`operator-reading reading-${currentState}`}>
            <div className="operator-reading-main">
              <StateIcon size={17} aria-hidden="true" />
              <div>
                <strong>{guidance.headline}</strong>
                <span>{snapshot.message}</span>
              </div>
            </div>
            <div className="operator-reading-details">
              <div><span>watch</span><strong>{guidance.watch}</strong></div>
              <div><span>next</span><strong>{guidance.next}</strong></div>
            </div>
          </section>
          <p className="sr-only" role="status" aria-live="polite">{guidance.headline}. Watch {guidance.watch}. Next: {guidance.next}.</p>

          <section className="metric-strip" aria-label="Key live metrics">
            <Metric label="incoming" value={hasRun ? formatRate(snapshot.incomingRate) : '—'} detail={hasRun ? `${formatNumber(snapshot.totalIncoming)} total` : 'not measured'} />
            <Metric label="completed" value={hasRun ? formatRate(snapshot.completedRate) : '—'} detail={hasRun ? `${formatNumber(snapshot.totalCompleted)} successful` : 'not measured'} tone={hasRun ? 'success' : undefined} />
            <Metric label="queue" value={hasRun ? formatNumber(snapshot.queueDepth) : '—'} detail={hasRun ? `max ${formatNumber(snapshot.maxQueueDepth)}` : 'not measured'} tone={hasRun && snapshot.queueDepth > 0 ? 'warning' : undefined} />
            <Metric label="p99 latency" value={hasRun ? formatLatency(snapshot.p99LatencyMs) : '—'} detail={hasRun ? `p50 ${formatLatency(snapshot.p50LatencyMs)} · p95 ${formatLatency(snapshot.p95LatencyMs)}` : 'not measured'} tone={hasRun && snapshot.p99LatencyMs > 1000 ? 'danger' : undefined} />
            <Metric label="failed" value={hasRun ? formatNumber(snapshot.totalFailed) : '—'} detail={hasRun ? formatRate(snapshot.failedRate) : 'not measured'} tone={hasRun && snapshot.totalFailed > 0 ? 'danger' : undefined} />
            <Metric label="timeouts" value={hasRun ? formatNumber(snapshot.totalTimedOut) : '—'} detail={hasRun ? formatRate(snapshot.timeoutRate) : 'not measured'} tone={hasRun && snapshot.totalTimedOut > 0 ? 'danger' : undefined} />
          </section>

          <section className="charts-grid" aria-label="Live metric trends">
            <ChartPanel
              title="Offered load / throughput"
              index="A"
              wide
              legend={<><ChartLegend color="var(--accent)" label="offered load" /><ChartLegend color="var(--signal)" label="completed" /></>}
            >
              <TrendChart history={history} primary="incomingRate" secondary="completedRate" primaryColor="var(--accent)" secondaryColor="var(--signal)" empty={!hasData} emptyLabel={hasRun ? 'Waiting for the first live snapshot' : 'Start a run to collect signal'} />
              <ChartFooter left="requests per second" right={hasData ? `${history.length} samples` : 'no samples yet'} />
            </ChartPanel>
            <ChartPanel title="Queue pressure" index="B" legend={<ChartLegend color="var(--accent)" label="waiting work" />}>
              <TrendChart history={history} primary="queueDepth" primaryColor="var(--accent)" empty={!hasData} emptyLabel={hasRun ? 'Waiting for the first live snapshot' : 'Start a run to collect signal'} />
              <ChartFooter left="accepted requests waiting" right="cap 2,000" />
            </ChartPanel>
            <ChartPanel title="Tail latency" index="C" icon={<Clock3 size={14} aria-hidden="true" />}>
              <TrendChart history={history} primary="p95LatencyMs" primaryColor="var(--danger)" empty={!hasData} emptyLabel={hasRun ? 'Waiting for the first live snapshot' : 'Start a run to collect signal'} />
              <ChartFooter left="p95 / milliseconds" right="deadline 1.5s" />
            </ChartPanel>
          </section>

          <details className="reading-guide">
            <summary><BookOpen size={15} aria-hidden="true" /><span>How to interpret this view</span><span className="summary-chevron" aria-hidden="true">+</span></summary>
            <div className="guide-grid">
              <div><strong>Incoming vs completed</strong><span>If incoming stays above completed, work is accumulating somewhere upstream.</span></div>
              <div><strong>Queue vs latency</strong><span>Queue wait is part of request latency, so the tail usually widens before users feel a clean failure.</span></div>
              <div><strong>Failed vs timed out</strong><span>Failed work reached the dependency. Timed-out work spent its deadline waiting or executing.</span></div>
            </div>
          </details>

          {experiment?.summary && <SummaryPanel experiment={experiment} />}
        </section>
      </main>
    </div>
  )
}

function StatusChip({ state, label }: { state: SystemState | ''; label: string }) {
  return <span className={`status-chip status-${state || 'standby'}`} role="status"><i aria-hidden="true" /> {label}</span>
}

function FeedStatus({ state }: { state: StreamState }) {
  return <span className={`feed-status feed-${state}`}><i aria-hidden="true" /> {streamLabels[state]}</span>
}

function PipelineStage({ icon: Icon, label, value, detail, state, tone, progress }: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  state: string
  tone: string
  progress?: number
}) {
  return (
    <div className={`pipeline-stage stage-${tone}`} aria-label={`${label}: ${value}; ${detail}; ${state}`}>
      <div className="stage-top"><Icon size={14} aria-hidden="true" /><span>{label}</span></div>
      <strong>{value}</strong>
      <span className="stage-detail">{detail}</span>
      <span className="stage-state">{state}</span>
      {progress !== undefined && <div className="stage-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>}
    </div>
  )
}

function PipelineArrow() {
  return <ArrowRight className="pipeline-arrow" size={14} aria-hidden="true" />
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className={`metric ${tone ? `metric-${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  )
}

function ChartPanel({ title, index, icon, legend, wide, children }: { title: string; index: string; icon?: ReactNode; legend?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`chart-panel ${wide ? 'chart-panel-wide' : ''}`}>
      <div className="chart-header">
        <div className="chart-title"><span>{index}</span><h3>{title}</h3></div>
        {legend ?? icon ?? <span className="chart-state-line" aria-hidden="true" />}
      </div>
      {children}
    </div>
  )
}

function ChartLegend({ color, label }: { color: string; label: string }) {
  return <span className="chart-legend"><i style={{ backgroundColor: color }} aria-hidden="true" />{label}</span>
}

function ChartFooter({ left, right }: { left: string; right: string }) {
  return <div className="chart-footer"><span>{left}</span><span>{right}</span></div>
}

function TrendChart({ history, primary, secondary, primaryColor, secondaryColor, empty, emptyLabel }: {
  history: ChartPoint[]
  primary: keyof ChartPoint
  secondary?: keyof ChartPoint
  primaryColor: string
  secondaryColor?: string
  empty: boolean
  emptyLabel: string
}) {
  const width = 720
  const height = 190
  const paddingX = 16
  const paddingY = 16
  const values = history.flatMap((point) => [Number(point[primary]), secondary ? Number(point[secondary]) : 0])
  const max = Math.max(1, ...values)
  const toPoints = (key: keyof ChartPoint) => history.map((point, index) => {
    const x = paddingX + (index / Math.max(1, history.length - 1)) * (width - paddingX * 2)
    const y = height - paddingY - (Number(point[key]) / max) * (height - paddingY * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <div className={`trend-chart ${empty ? 'trend-chart-empty' : ''}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={empty ? 'No live data yet' : 'Live experiment trend chart'}>
        {[0, 1, 2, 3].map((line) => {
          const y = paddingY + (line / 3) * (height - paddingY * 2)
          return <line key={line} x1={paddingX} x2={width - paddingX} y1={y} y2={y} className="chart-grid-line" />
        })}
        {!empty && secondary && <polyline points={toPoints(secondary)} fill="none" stroke={secondaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {!empty && <polyline points={toPoints(primary)} fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {empty && <span className="chart-empty"><Activity size={14} aria-hidden="true" /> {emptyLabel}</span>}
      {!empty && <span className="chart-scale">max {formatNumber(max)}</span>}
    </div>
  )
}

function SummaryPanel({ experiment }: { experiment: ExperimentView }) {
  const summary = experiment.summary
  if (!summary) return null
  const stopped = experiment.status === 'stopped'
  return (
    <section className="summary-panel" aria-labelledby="summary-title">
      <div className="summary-intro">
        <h2 id="summary-title">{stopped ? 'Run stopped' : 'Run complete'}</h2>
        <p>{stopped ? 'The run ended before the configured duration. These values describe the work observed up to the stop.' : 'The run reached its terminal state. Use the summary to compare what arrived with what the finite system could complete.'}</p>
        <span className="summary-duration">observed for {formatDuration(summary.durationMs)}</span>
      </div>
      <div className="summary-values">
        <div><span>accepted</span><strong>{formatNumber(summary.totalAccepted)}</strong></div>
        <div><span>successful</span><strong>{formatNumber(summary.totalCompleted)}</strong></div>
        <div><span>cap rejected</span><strong>{formatNumber(summary.totalRejected)}</strong></div>
        <div><span>failed</span><strong>{formatNumber(summary.totalFailed)}</strong></div>
        <div><span>timed out</span><strong>{formatNumber(summary.totalTimedOut)}</strong></div>
        <div><span>p99 latency</span><strong>{formatLatency(summary.p99LatencyMs)}</strong></div>
        <div><span>max queue</span><strong>{formatNumber(summary.maxQueueDepth)}</strong></div>
        <div><span>max active</span><strong>{formatNumber(summary.maxActiveOperations)}</strong></div>
      </div>
    </section>
  )
}
