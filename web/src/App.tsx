import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleStop,
  Clock3,
  Database,
  Gauge,
  Layers3,
  Play,
  Radio,
  Server,
  TriangleAlert,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react'
import { fetchScenarios, getExperiment, startExperiment, stopExperiment, streamExperiment } from './api'
import type { ChartPoint, ExperimentView, ScenarioInfo, Snapshot, SystemState } from './types'

const emptySnapshot: Snapshot = {
  elapsedMs: 0,
  status: '',
  state: '',
  message: 'Choose a scenario and start a run to put the system under load.',
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

function App() {
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([])
  const [selectedScenario, setSelectedScenario] = useState('traffic-spike')
  const [duration, setDuration] = useState(24)
  const [experiment, setExperiment] = useState<ExperimentView | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [history, setHistory] = useState<ChartPoint[]>([])
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cleanupStream = useRef<(() => void) | null>(null)

  useEffect(() => {
    fetchScenarios()
      .then((available) => {
        setScenarios(available)
        const defaultScenario = available.find((scenario) => scenario.id === selectedScenario) ?? available[0]
        if (defaultScenario) {
          setSelectedScenario(defaultScenario.id)
          setDuration(defaultScenario.defaultDurationSeconds)
        }
      })
      .catch((reason: Error) => setError(reason.message))

    return () => cleanupStream.current?.()
  }, [])

  const selected = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenario),
    [scenarios, selectedScenario],
  )
  const isActive = experiment?.status === 'running' || experiment?.status === 'draining'
  const StateIcon = stateIcon(snapshot.state)

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenario(scenarioId)
    const scenario = scenarios.find((item) => item.id === scenarioId)
    if (scenario) setDuration(scenario.defaultDurationSeconds)
  }

  const handleStart = async () => {
    cleanupStream.current?.()
    cleanupStream.current = null
    setIsStarting(true)
    setIsStopping(false)
    setError(null)
    setHistory([])
    try {
      const next = await startExperiment(selectedScenario, duration)
      setExperiment(next)
      setSnapshot({ ...emptySnapshot, ...next.snapshot, status: next.status })
      cleanupStream.current = streamExperiment(
        next.id,
        (nextSnapshot) => {
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
          ].slice(-80))
          setExperiment((current) => current ? { ...current, status: nextSnapshot.status || current.status, snapshot: nextSnapshot } : current)
          if (nextSnapshot.status === 'complete' || nextSnapshot.status === 'stopped') {
            void getExperiment(next.id)
              .then(setExperiment)
              .catch(() => undefined)
          }
        },
        (streamError) => setError(streamError.message),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The experiment could not start.')
    } finally {
      setIsStarting(false)
    }
  }

  const handleStop = async () => {
    if (!experiment) return
    setIsStopping(true)
    setError(null)
    try {
      await stopExperiment(experiment.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The experiment could not be stopped.')
      setIsStopping(false)
    }
  }

  const currentState = snapshot.state || (experiment ? 'healthy' : '')
  const statusText = experiment ? stateLabels[currentState] : 'ready to run'
  const hasData = history.length > 1

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Backpressure Lab home">
          <span className="wordmark-mark"><Activity size={18} strokeWidth={2.4} /></span>
          <span>backpressure<span className="wordmark-muted">/lab</span></span>
        </a>
        <div className="topbar-meta">
          <span className="mono-label">PHASE 01 · BASELINE</span>
          <span className={`status-chip status-${currentState || 'standby'}`} role="status">
            <span className="status-dot" aria-hidden="true" /> {statusText}
          </span>
        </div>
      </header>

      <main className="main-content">
        <section className="intro-grid" aria-labelledby="page-title">
          <div className="intro-copy">
            <p className="eyebrow"><Radio size={14} aria-hidden="true" /> LIVE SYSTEMS EXPERIMENT</p>
            <h1 id="page-title">Watch capacity<br /><span>become visible.</span></h1>
            <p className="intro-body">
              Put a real concurrent request pipeline under load. See the queue form, tail latency spread, and downstream pressure rise before your eyes.
            </p>
          </div>
          <aside className="experiment-note" aria-label="Current experiment profile">
            <div className="note-line"><span className="mono-label">PROFILE</span><span className="note-value">baseline / no protection</span></div>
            <div className="note-line"><span className="mono-label">PIPELINE</span><span className="note-value">traffic → queue → workers → dependency</span></div>
            <div className="note-line"><span className="mono-label">SIGNAL</span><span className="note-value accent-text">actual concurrent work</span></div>
          </aside>
        </section>

        <section className="control-bar" aria-labelledby="run-controls-title">
          <div className="control-title">
            <span className="section-index">01</span>
            <div>
              <h2 id="run-controls-title">Configure a run</h2>
              <p>Start with a preset; advanced protection arrives in the next lab module.</p>
            </div>
          </div>
          <div className="controls">
            <label className="field-label">
              <span>Scenario</span>
              <select value={selectedScenario} onChange={(event) => handleScenarioChange(event.target.value)} disabled={isActive || isStarting}>
                {scenarios.length === 0 && <option value="traffic-spike">Loading scenarios…</option>}
                {scenarios.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}
              </select>
            </label>
            <label className="field-label duration-field">
              <span>Duration <strong>{duration}s</strong></span>
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                disabled={isActive || isStarting}
                aria-label="Experiment duration in seconds"
              />
            </label>
            <div className="control-actions">
              <button className="primary-button" type="button" onClick={handleStart} disabled={isActive || isStarting}>
                <Play size={16} fill="currentColor" aria-hidden="true" />
                {isStarting ? 'Starting…' : 'Run experiment'}
              </button>
              {isActive && (
                <button className="stop-button" type="button" onClick={handleStop} disabled={isStopping}>
                  <CircleStop size={16} aria-hidden="true" />
                  {isStopping ? 'Stopping…' : 'Stop'}
                </button>
              )}
            </div>
          </div>
          {selected && <p className="scenario-description">{selected.description} <span>Peak offered rate: {formatRate(selected.peakRate)}</span></p>}
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <WifiOff size={17} aria-hidden="true" />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">Dismiss</button>
          </div>
        )}

        <section className="live-section" aria-labelledby="live-system-title">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow"><Zap size={14} aria-hidden="true" /> OBSERVABILITY SURFACE</p>
              <h2 id="live-system-title">The pipeline, right now</h2>
            </div>
            <div className="run-clock" aria-live="polite">
              <Clock3 size={15} aria-hidden="true" />
              <span>{experiment ? formatDuration(snapshot.elapsedMs) : '—'}</span>
              {experiment && <span className="run-id">{experiment.id}</span>}
            </div>
          </div>

          <div className="pipeline" aria-label="Request processing pipeline">
            <PipelineStage icon={Radio} label="incoming" value={formatRate(snapshot.incomingRate)} detail="offered load" tone="incoming" />
            <PipelineArrow />
            <PipelineStage icon={Layers3} label="admission" value={formatRate(snapshot.acceptedRate)} detail={`${formatNumber(snapshot.totalRejected)} safety-cap rejected`} tone="admission" />
            <PipelineArrow />
            <PipelineStage icon={Gauge} label="queue" value={formatNumber(snapshot.queueDepth)} detail={`peak ${formatNumber(snapshot.maxQueueDepth)}`} tone={snapshot.queueDepth > 0 ? 'warning' : 'neutral'} progress={Math.min(100, snapshot.queueDepth / 20)} />
            <PipelineArrow />
            <PipelineStage icon={Server} label="workers" value={`${snapshot.activeOperations} active`} detail={`${formatRate(snapshot.completedRate)} completed`} tone={snapshot.activeOperations > 8 ? 'warning' : 'workers'} progress={Math.min(100, snapshot.activeOperations / 12 * 100)} />
            <PipelineArrow />
            <PipelineStage icon={Database} label="dependency" value={`${Math.round(snapshot.downstreamPressure * 100)}%`} detail="pressure / healthy capacity" tone={snapshot.downstreamPressure > 1 ? 'danger' : 'dependency'} progress={Math.min(100, snapshot.downstreamPressure * 100)} />
          </div>

          <div className="operator-reading" role="status" aria-live="polite">
            <StateIcon size={17} aria-hidden="true" />
            <span>{snapshot.message}</span>
            {experiment && <span className="operator-reading-state">{stateLabels[currentState]}</span>}
          </div>
        </section>

        <section className="metric-strip" aria-label="Key live metrics">
          <Metric label="incoming rate" value={formatRate(snapshot.incomingRate)} detail={`${formatNumber(snapshot.totalIncoming)} total`} tone="neutral" />
          <Metric label="completed rate" value={formatRate(snapshot.completedRate)} detail={`${formatNumber(snapshot.totalCompleted)} successful`} tone="success" />
          <Metric label="queue depth" value={formatNumber(snapshot.queueDepth)} detail={`max ${formatNumber(snapshot.maxQueueDepth)}`} tone={snapshot.queueDepth > 0 ? 'warning' : 'neutral'} />
          <Metric label="p99 latency" value={formatLatency(snapshot.p99LatencyMs)} detail={`p50 ${formatLatency(snapshot.p50LatencyMs)} · p95 ${formatLatency(snapshot.p95LatencyMs)}`} tone={snapshot.p99LatencyMs > 1000 ? 'danger' : 'neutral'} />
          <Metric label="failed" value={formatNumber(snapshot.totalFailed)} detail={formatRate(snapshot.failedRate)} tone={snapshot.totalFailed > 0 ? 'danger' : 'neutral'} />
          <Metric label="timeouts" value={formatNumber(snapshot.totalTimedOut)} detail={formatRate(snapshot.timeoutRate)} tone={snapshot.totalTimedOut > 0 ? 'danger' : 'neutral'} />
        </section>

        <section className="charts-grid" aria-labelledby="signals-title">
          <div className="chart-panel chart-panel-wide">
            <div className="chart-header">
              <div><p className="eyebrow">SIGNAL A</p><h3 id="signals-title">Offered load vs throughput</h3></div>
              <div className="legend"><span className="legend-item legend-incoming"><i /> incoming</span><span className="legend-item legend-complete"><i /> completed</span></div>
            </div>
            <TrendChart history={history} primary="incomingRate" secondary="completedRate" primaryColor="var(--orange)" secondaryColor="var(--cyan)" empty={!hasData} />
            <div className="chart-footer"><span>rate / requests per second</span><span>{hasData ? `${history.length} live samples` : 'waiting for a run'}</span></div>
          </div>
          <div className="chart-panel">
            <div className="chart-header"><div><p className="eyebrow">SIGNAL B</p><h3>Queue pressure</h3></div><Layers3 size={17} aria-hidden="true" /></div>
            <TrendChart history={history} primary="queueDepth" primaryColor="var(--orange)" empty={!hasData} />
            <div className="chart-footer"><span>waiting work</span><span>cap 2,000</span></div>
          </div>
          <div className="chart-panel">
            <div className="chart-header"><div><p className="eyebrow">SIGNAL C</p><h3>Tail latency</h3></div><TimerIcon value={snapshot.p99LatencyMs} /></div>
            <TrendChart history={history} primary="p95LatencyMs" primaryColor="var(--red)" empty={!hasData} />
            <div className="chart-footer"><span>p95 / milliseconds</span><span>deadline 1.5 s</span></div>
          </div>
        </section>

        {experiment?.summary && <SummaryPanel experiment={experiment} />}

        <footer className="page-footer">
          <span>Backpressure Lab / phase 01</span>
          <span>Real work. Synthetic dependency. Ephemeral run.</span>
        </footer>
      </main>
    </div>
  )
}

function PipelineStage({ icon: Icon, label, value, detail, tone, progress }: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  tone: string
  progress?: number
}) {
  return (
    <div className={`pipeline-stage stage-${tone}`}>
      <div className="stage-top"><Icon size={16} aria-hidden="true" /><span>{label}</span></div>
      <strong>{value}</strong>
      <span className="stage-detail">{detail}</span>
      {progress !== undefined && <div className="stage-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>}
    </div>
  )
}

function PipelineArrow() {
  return <ArrowRight className="pipeline-arrow" size={17} aria-hidden="true" />
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  )
}

function TimerIcon({ value }: { value: number }) {
  return value > 1000 ? <TriangleAlert size={17} className="danger-icon" aria-hidden="true" /> : <Clock3 size={17} aria-hidden="true" />
}

function TrendChart({ history, primary, secondary, primaryColor, secondaryColor, empty }: {
  history: ChartPoint[]
  primary: keyof ChartPoint
  secondary?: keyof ChartPoint
  primaryColor: string
  secondaryColor?: string
  empty: boolean
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
        {!empty && secondary && <polyline points={toPoints(secondary)} fill="none" stroke={secondaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {!empty && <polyline points={toPoints(primary)} fill="none" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {empty && <span className="chart-empty"><Activity size={16} aria-hidden="true" /> Start a run to collect signal</span>}
      {!empty && <span className="chart-scale">max {formatNumber(max)}</span>}
    </div>
  )
}

function SummaryPanel({ experiment }: { experiment: ExperimentView }) {
  const summary = experiment.summary
  if (!summary) return null
  return (
    <section className="summary-panel" aria-labelledby="summary-title">
      <div className="summary-intro">
        <p className="eyebrow"><CheckCircle2 size={14} aria-hidden="true" /> RUN COMPLETE</p>
        <h2 id="summary-title">What the baseline did</h2>
        <p>The run accepted work without a user-facing protection strategy. Rejections below are only the internal safety cap protecting this demo process.</p>
      </div>
      <div className="summary-values">
        <div><span>successful</span><strong>{formatNumber(summary.totalCompleted)}</strong></div>
        <div><span>safety-cap rejected</span><strong>{formatNumber(summary.totalRejected)}</strong></div>
        <div><span>timed out</span><strong>{formatNumber(summary.totalTimedOut)}</strong></div>
        <div><span>p99 latency</span><strong>{formatLatency(summary.p99LatencyMs)}</strong></div>
        <div><span>max queue</span><strong>{formatNumber(summary.maxQueueDepth)}</strong></div>
      </div>
    </section>
  )
}

export default App
