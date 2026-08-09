import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
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

export default function LabPage() {
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([])
  const [selectedScenario, setSelectedScenario] = useState(initialScenarioFromUrl)
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
        const selected = available.find((scenario) => scenario.id === selectedScenario) ?? available[0]
        if (selected) {
          setSelectedScenario(selected.id)
          setDuration(selected.defaultDurationSeconds)
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
  const currentState = snapshot.state || (experiment ? 'healthy' : '')
  const statusText = experiment ? stateLabels[currentState] : 'ready'
  const StateIcon = stateIcon(snapshot.state)
  const hasData = history.length > 1

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenario(scenarioId)
    const scenario = scenarios.find((item) => item.id === scenarioId)
    if (scenario) setDuration(scenario.defaultDurationSeconds)
    window.history.replaceState(null, '', `/lab?scenario=${scenarioId}`)
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
          <ThemeToggle />
        </div>
      </header>

      <main className="lab-main" id="main-content">
        <section className="lab-intro" aria-labelledby="lab-title">
          <div>
            <h1 id="lab-title">Run a condition.</h1>
            <p>Choose what changes underneath the service, then watch queueing, execution, deadlines, and recovery in real time.</p>
          </div>
          <div className="lab-intro-meta">
            <span>LIVE EXPERIMENT</span>
            <strong>{experiment ? formatDuration(snapshot.elapsedMs) : 'not running'}</strong>
            {experiment && <span className="run-id">{experiment.id}</span>}
          </div>
        </section>

        <section className="lab-controls" aria-labelledby="controls-title">
          <div className="control-heading">
            <h2 id="controls-title">Choose a preset</h2>
            <p>One variable changes at a time so the cause stays legible.</p>
          </div>
          <ScenarioPicker
            options={scenarios}
            value={selectedScenario}
            onChange={handleScenarioChange}
            disabled={isActive || isStarting}
          />
          <div className="control-footer">
            <label className="duration-control">
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
            <div className="lab-actions">
              <button className="button button-primary" type="button" onClick={() => void handleStart()} disabled={isActive || isStarting}>
                <Play size={14} fill="currentColor" aria-hidden="true" />
                {isStarting ? 'Starting…' : 'Run experiment'}
              </button>
              {isActive && (
                <button className="button button-stop" type="button" onClick={() => void handleStop()} disabled={isStopping}>
                  <CircleStop size={14} aria-hidden="true" />
                  {isStopping ? 'Stopping…' : 'Stop'}
                </button>
              )}
            </div>
          </div>
          {selected && <p className="selected-note">{selected.description} Peak offered rate: {formatRate(selected.peakRate)}.</p>}
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <WifiOff size={15} aria-hidden="true" />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={15} /></button>
          </div>
        )}

        <section className="observation-section" aria-labelledby="observation-title">
          <div className="section-bar">
            <h2 id="observation-title">The pipeline</h2>
            <span className="run-observation" role="status" aria-live="polite"><Clock3 size={13} aria-hidden="true" /> {experiment ? formatDuration(snapshot.elapsedMs) : 'waiting for a run'}</span>
          </div>

          <div className="pipeline" aria-label="Request processing pipeline">
            <PipelineStage icon={Radio} label="incoming" value={formatRate(snapshot.incomingRate)} detail="offered load" tone="accent" />
            <PipelineArrow />
            <PipelineStage icon={Layers3} label="admission" value={formatRate(snapshot.acceptedRate)} detail={`${formatNumber(snapshot.totalRejected)} cap rejected`} tone="muted" />
            <PipelineArrow />
            <PipelineStage icon={Gauge} label="queue" value={formatNumber(snapshot.queueDepth)} detail={`peak ${formatNumber(snapshot.maxQueueDepth)}`} tone={snapshot.queueDepth > 0 ? 'warning' : 'neutral'} progress={Math.min(100, snapshot.queueDepth / 20)} />
            <PipelineArrow />
            <PipelineStage icon={Server} label="workers" value={`${snapshot.activeOperations} active`} detail={`${formatRate(snapshot.completedRate)} completed`} tone="signal" progress={Math.min(100, snapshot.activeOperations / 12 * 100)} />
            <PipelineArrow />
            <PipelineStage icon={Database} label="dependency" value={`${Math.round(snapshot.downstreamPressure * 100)}%`} detail="downstream pressure" tone={snapshot.downstreamPressure > 1 ? 'danger' : 'signal'} progress={Math.min(100, snapshot.downstreamPressure * 100)} />
          </div>

          <div className={`operator-reading reading-${currentState}`} role="status" aria-live="polite">
            <StateIcon size={15} aria-hidden="true" />
            <span>{snapshot.message}</span>
            {experiment && <span className="operator-reading-state">{stateLabels[currentState]}</span>}
          </div>

          <section className="metric-strip" aria-label="Key live metrics">
            <Metric label="incoming" value={formatRate(snapshot.incomingRate)} detail={`${formatNumber(snapshot.totalIncoming)} total`} />
            <Metric label="completed" value={formatRate(snapshot.completedRate)} detail={`${formatNumber(snapshot.totalCompleted)} successful`} tone="success" />
            <Metric label="queue" value={formatNumber(snapshot.queueDepth)} detail={`max ${formatNumber(snapshot.maxQueueDepth)}`} tone={snapshot.queueDepth > 0 ? 'warning' : undefined} />
            <Metric label="p99 latency" value={formatLatency(snapshot.p99LatencyMs)} detail={`p50 ${formatLatency(snapshot.p50LatencyMs)} · p95 ${formatLatency(snapshot.p95LatencyMs)}`} tone={snapshot.p99LatencyMs > 1000 ? 'danger' : undefined} />
            <Metric label="failed" value={formatNumber(snapshot.totalFailed)} detail={formatRate(snapshot.failedRate)} tone={snapshot.totalFailed > 0 ? 'danger' : undefined} />
            <Metric label="timeouts" value={formatNumber(snapshot.totalTimedOut)} detail={formatRate(snapshot.timeoutRate)} tone={snapshot.totalTimedOut > 0 ? 'danger' : undefined} />
          </section>

          <section className="charts-grid" aria-label="Live metric trends">
            <ChartPanel title="Offered load / throughput" index="A" wide>
              <TrendChart history={history} primary="incomingRate" secondary="completedRate" primaryColor="var(--accent)" secondaryColor="var(--signal)" empty={!hasData} />
              <ChartFooter left="requests per second" right={hasData ? `${history.length} samples` : 'waiting for a run'} />
            </ChartPanel>
            <ChartPanel title="Queue pressure" index="B">
              <TrendChart history={history} primary="queueDepth" primaryColor="var(--accent)" empty={!hasData} />
              <ChartFooter left="waiting work" right="cap 2,000" />
            </ChartPanel>
            <ChartPanel title="Tail latency" index="C" icon={<Clock3 size={14} aria-hidden="true" />}>
              <TrendChart history={history} primary="p95LatencyMs" primaryColor="var(--danger)" empty={!hasData} />
              <ChartFooter left="p95 / milliseconds" right="deadline 1.5s" />
            </ChartPanel>
          </section>

          {experiment?.summary && <SummaryPanel experiment={experiment} />}
        </section>
      </main>
    </div>
  )
}

function StatusChip({ state, label }: { state: SystemState | ''; label: string }) {
  return <span className={`status-chip status-${state || 'standby'}`} role="status"><i aria-hidden="true" /> {label}</span>
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
      <div className="stage-top"><Icon size={14} aria-hidden="true" /><span>{label}</span></div>
      <strong>{value}</strong>
      <span className="stage-detail">{detail}</span>
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

function ChartPanel({ title, index, icon, wide, children }: { title: string; index: string; icon?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`chart-panel ${wide ? 'chart-panel-wide' : ''}`}>
      <div className="chart-header">
        <div className="chart-title"><span>{index}</span><h3>{title}</h3></div>
        {icon ?? <span className="chart-state-line" aria-hidden="true" />}
      </div>
      {children}
    </div>
  )
}

function ChartFooter({ left, right }: { left: string; right: string }) {
  return <div className="chart-footer"><span>{left}</span><span>{right}</span></div>
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
        {!empty && secondary && <polyline points={toPoints(secondary)} fill="none" stroke={secondaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {!empty && <polyline points={toPoints(primary)} fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {empty && <span className="chart-empty"><Activity size={14} aria-hidden="true" /> Start a run to collect signal</span>}
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
        <h2 id="summary-title">Run complete</h2>
        <p>The baseline accepted work without a user-facing protection strategy. Rejections are only the internal safety cap protecting this demo process.</p>
      </div>
      <div className="summary-values">
        <div><span>successful</span><strong>{formatNumber(summary.totalCompleted)}</strong></div>
        <div><span>cap rejected</span><strong>{formatNumber(summary.totalRejected)}</strong></div>
        <div><span>failed</span><strong>{formatNumber(summary.totalFailed)}</strong></div>
        <div><span>timed out</span><strong>{formatNumber(summary.totalTimedOut)}</strong></div>
        <div><span>p99 latency</span><strong>{formatLatency(summary.p99LatencyMs)}</strong></div>
        <div><span>max queue</span><strong>{formatNumber(summary.maxQueueDepth)}</strong></div>
      </div>
    </section>
  )
}
