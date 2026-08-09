import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
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
  const currentState = snapshot.state || (experiment ? 'healthy' : '')
  const statusText = experiment ? stateLabels[currentState] : 'ready to run'
  const StateIcon = stateIcon(snapshot.state)
  const hasData = history.length > 1

  const scrollToExperiment = () => {
    document.getElementById('experiment')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenario(scenarioId)
    const scenario = scenarios.find((item) => item.id === scenarioId)
    if (scenario) setDuration(scenario.defaultDurationSeconds)
  }

  const handleStart = async (options?: { scenario?: string; duration?: number; scroll?: boolean }) => {
    cleanupStream.current?.()
    cleanupStream.current = null
    setIsStarting(true)
    setIsStopping(false)
    setError(null)
    setHistory([])
    if (options?.scroll) scrollToExperiment()

    const scenarioId = options?.scenario ?? selectedScenario
    const runDuration = options?.duration ?? duration
    try {
      const next = await startExperiment(scenarioId, runDuration)
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

  const handleHeroStart = () => {
    if (isActive) {
      scrollToExperiment()
      return
    }
    const spike = scenarios.find((scenario) => scenario.id === 'traffic-spike')
    setSelectedScenario('traffic-spike')
    setDuration(spike?.defaultDurationSeconds ?? 24)
    void handleStart({ scenario: 'traffic-spike', duration: spike?.defaultDurationSeconds ?? 24, scroll: true })
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
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Backpressure Lab home">
          <span className="brand-mark"><Activity size={17} strokeWidth={2.4} /></span>
          <span>Backpressure <em>Lab</em></span>
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          <a href="#experiment">The experiment</a>
          <a href="#how-it-works">How it works</a>
          <a href="#signals">Signals</a>
        </nav>
        <button className="header-action" type="button" onClick={handleHeroStart} disabled={isStarting}>
          {isActive ? 'View live run' : isStarting ? 'Starting…' : 'Run the spike'}
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">Capacity is finite.<br /><span>Make it visible.</span></h1>
            <p className="hero-lede">
              Backpressure Lab puts a real concurrent request pipeline under load, so you can watch the queue form, tail latency spread, and downstream pressure rise.
            </p>
            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={handleHeroStart} disabled={isStarting}>
                <Play size={16} fill="currentColor" aria-hidden="true" />
                {isActive ? 'View the live run' : 'Try the traffic spike'}
              </button>
              <a className="button button-quiet" href="#how-it-works">
                Understand the model <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="hero-proof" aria-label="Lab properties">
              <span><i /> Real concurrency</span>
              <span><i /> Live metrics</span>
              <span><i /> No scripted curves</span>
            </div>
          </div>

          <div className="hero-instrument" aria-label="Preview of the request processing pipeline">
            <div className="instrument-topline">
              <span>LIVE MODEL</span>
              <span className="instrument-state"><i /> BASELINE / NO PROTECTION</span>
            </div>
            <div className="mini-pipeline">
              <MiniStage icon={Radio} label="traffic" value={experiment ? formatRate(snapshot.incomingRate) : '35 → 340/s'} />
              <MiniConnector />
              <MiniStage icon={Layers3} label="queue" value={experiment ? formatNumber(snapshot.queueDepth) : 'waiting work'} />
              <MiniConnector />
              <MiniStage icon={Server} label="workers" value={experiment ? `${snapshot.activeOperations} active` : '12 slots'} />
              <MiniConnector />
              <MiniStage icon={Database} label="dependency" value={experiment ? `${Math.round(snapshot.downstreamPressure * 100)}% pressure` : 'finite capacity'} />
            </div>
            <div className="instrument-readout">
              <div>
                <span>THE MOMENT TO WATCH</span>
                <strong>{experiment ? stateLabels[currentState] : 'load crosses capacity'}</strong>
              </div>
              <p>{experiment ? snapshot.message : 'When arrivals outpace workers, waiting time becomes the story.'}</p>
            </div>
            <div className="instrument-foot">
              <span>request deadline <strong>1.5s</strong></span>
              <span>queue safety cap <strong>2,000</strong></span>
            </div>
          </div>
        </section>

        <section className="proof-strip" aria-label="What the lab makes visible">
          <div><strong>01</strong><span>Traffic arrives</span><p>A workload starts safe, then changes the offer.</p></div>
          <div><strong>02</strong><span>Capacity tightens</span><p>Workers and a downstream dependency stay finite.</p></div>
          <div><strong>03</strong><span>Behavior emerges</span><p>Queue depth, latency, and timeouts come from the run.</p></div>
        </section>

        <section className="experiment-section" id="experiment" aria-labelledby="experiment-title">
          <div className="section-heading-row">
            <SectionHeading id="experiment-title" index="01" title="Run the experiment" description="Start with a known scenario. The baseline accepts work without a user-facing protection strategy." />
            <StatusChip state={currentState} label={statusText} />
          </div>

          <div className="control-panel">
            <div className="control-panel-top">
              <div>
                <span className="panel-label">CONFIGURATION</span>
                <h3>Choose the condition to introduce</h3>
              </div>
              <span className="profile-badge">BASELINE / PHASE 01</span>
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
                <button className="button button-primary" type="button" onClick={() => void handleStart()} disabled={isActive || isStarting}>
                  <Play size={16} fill="currentColor" aria-hidden="true" />
                  {isStarting ? 'Starting…' : 'Run experiment'}
                </button>
                {isActive && (
                  <button className="button button-stop" type="button" onClick={() => void handleStop()} disabled={isStopping}>
                    <CircleStop size={16} aria-hidden="true" />
                    {isStopping ? 'Stopping…' : 'Stop'}
                  </button>
                )}
              </div>
            </div>
            {selected && <p className="scenario-description">{selected.description} <span>Peak offered rate: {formatRate(selected.peakRate)}</span></p>}
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <WifiOff size={17} aria-hidden="true" />
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={16} /></button>
            </div>
          )}

          <div className="live-workspace">
            <div className="live-workspace-header">
              <div>
                <span className="panel-label">LIVE OBSERVATION</span>
                <h3>The pipeline, right now</h3>
              </div>
              <div className="run-meta" aria-live="polite">
                <Clock3 size={15} aria-hidden="true" />
                <span>{experiment ? formatDuration(snapshot.elapsedMs) : '—'}</span>
                {experiment && <span className="run-id">{experiment.id}</span>}
              </div>
            </div>

            <div className="pipeline" aria-label="Request processing pipeline">
              <PipelineStage icon={Radio} label="incoming" value={formatRate(snapshot.incomingRate)} detail="offered load" tone="accent" />
              <PipelineArrow />
              <PipelineStage icon={Layers3} label="admission" value={formatRate(snapshot.acceptedRate)} detail={`${formatNumber(snapshot.totalRejected)} safety-cap rejected`} tone="muted" />
              <PipelineArrow />
              <PipelineStage icon={Gauge} label="queue" value={formatNumber(snapshot.queueDepth)} detail={`peak ${formatNumber(snapshot.maxQueueDepth)}`} tone={snapshot.queueDepth > 0 ? 'warning' : 'neutral'} progress={Math.min(100, snapshot.queueDepth / 20)} />
              <PipelineArrow />
              <PipelineStage icon={Server} label="workers" value={`${snapshot.activeOperations} active`} detail={`${formatRate(snapshot.completedRate)} completed`} tone="signal" progress={Math.min(100, snapshot.activeOperations / 12 * 100)} />
              <PipelineArrow />
              <PipelineStage icon={Database} label="dependency" value={`${Math.round(snapshot.downstreamPressure * 100)}%`} detail="pressure / healthy capacity" tone={snapshot.downstreamPressure > 1 ? 'danger' : 'signal'} progress={Math.min(100, snapshot.downstreamPressure * 100)} />
            </div>

            <div className={`operator-reading reading-${currentState}`} role="status" aria-live="polite">
              <StateIcon size={17} aria-hidden="true" />
              <span>{snapshot.message}</span>
              {experiment && <span className="operator-reading-state">{stateLabels[currentState]}</span>}
            </div>

            <section className="metric-strip" aria-label="Key live metrics">
              <Metric label="incoming rate" value={formatRate(snapshot.incomingRate)} detail={`${formatNumber(snapshot.totalIncoming)} total`} />
              <Metric label="completed rate" value={formatRate(snapshot.completedRate)} detail={`${formatNumber(snapshot.totalCompleted)} successful`} tone="success" />
              <Metric label="queue depth" value={formatNumber(snapshot.queueDepth)} detail={`max ${formatNumber(snapshot.maxQueueDepth)}`} tone={snapshot.queueDepth > 0 ? 'warning' : undefined} />
              <Metric label="p99 latency" value={formatLatency(snapshot.p99LatencyMs)} detail={`p50 ${formatLatency(snapshot.p50LatencyMs)} · p95 ${formatLatency(snapshot.p95LatencyMs)}`} tone={snapshot.p99LatencyMs > 1000 ? 'danger' : undefined} />
              <Metric label="failed" value={formatNumber(snapshot.totalFailed)} detail={formatRate(snapshot.failedRate)} tone={snapshot.totalFailed > 0 ? 'danger' : undefined} />
              <Metric label="timeouts" value={formatNumber(snapshot.totalTimedOut)} detail={formatRate(snapshot.timeoutRate)} tone={snapshot.totalTimedOut > 0 ? 'danger' : undefined} />
            </section>

            <section className="charts-grid" aria-label="Live metric trends">
              <ChartPanel title="Offered load vs throughput" index="A" wide>
                <TrendChart history={history} primary="incomingRate" secondary="completedRate" primaryColor="var(--accent)" secondaryColor="var(--signal)" empty={!hasData} />
                <ChartFooter left="rate / requests per second" right={hasData ? `${history.length} live samples` : 'waiting for a run'} />
              </ChartPanel>
              <ChartPanel title="Queue pressure" index="B">
                <TrendChart history={history} primary="queueDepth" primaryColor="var(--accent)" empty={!hasData} />
                <ChartFooter left="waiting work" right="cap 2,000" />
              </ChartPanel>
              <ChartPanel title="Tail latency" index="C" icon={<Clock3 size={16} aria-hidden="true" />}>
                <TrendChart history={history} primary="p95LatencyMs" primaryColor="var(--danger)" empty={!hasData} />
                <ChartFooter left="p95 / milliseconds" right="deadline 1.5s" />
              </ChartPanel>
            </section>
          </div>

          {experiment?.summary && <SummaryPanel experiment={experiment} />}
        </section>

        <section className="how-section" id="how-it-works" aria-labelledby="how-title">
          <SectionHeading id="how-title" index="02" title="A simple pipeline. A real limit." description="The model is small on purpose. The behavior is not scripted." />
          <div className="how-grid">
            <HowStep number="01" title="Offer work" icon={Radio}>A workload emits requests according to a scenario. Traffic can be safe, spiky, or steady while the dependency changes underneath it.</HowStep>
            <HowStep number="02" title="Wait for capacity" icon={Layers3}>Accepted requests wait in a real queue. Once workers cannot drain arrivals fast enough, queue time becomes request latency.</HowStep>
            <HowStep number="03" title="Observe the cost" icon={Gauge}>Deadlines, timeouts, failures, and downstream pressure are consequences of the run—not values painted on after the fact.</HowStep>
          </div>
        </section>

        <section className="signals-section" id="signals" aria-labelledby="signals-section-title">
          <div className="signals-copy">
            <SectionHeading id="signals-section-title" index="03" title="Overload is a relationship." description="The same service can be healthy or unhealthy depending on what arrives, what waits, and what the dependency can absorb." />
            <a className="text-link" href="#experiment">Run another condition <ArrowUpRight size={16} aria-hidden="true" /></a>
          </div>
          <div className="signal-list" aria-label="Signals measured by the lab">
            <div><strong>Throughput plateaus</strong><span>More offered load does not always create more completed work.</span></div>
            <div><strong>Tail latency spreads</strong><span>p95 and p99 reveal the waiting that averages hide.</span></div>
            <div><strong>Recovery takes time</strong><span>A backlog can outlive the spike that created it.</span></div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand" href="/" aria-label="Backpressure Lab home"><span className="brand-mark"><Activity size={15} aria-hidden="true" /></span><span>Backpressure <em>Lab</em></span></a>
        <span>Real work. Synthetic dependency. Ephemeral run.</span>
        <span>Phase 01 / baseline</span>
      </footer>
    </div>
  )
}

function MiniStage({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="mini-stage">
      <Icon size={15} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function MiniConnector() {
  return <span className="mini-connector" aria-hidden="true"><i /></span>
}

function SectionHeading({ id, index, title, description }: { id?: string; index: string; title: string; description: string }) {
  return (
    <div className="section-heading">
      <span className="section-number">{index}</span>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
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
        {!empty && secondary && <polyline points={toPoints(secondary)} fill="none" stroke={secondaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {!empty && <polyline points={toPoints(primary)} fill="none" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {empty && <span className="chart-empty"><Activity size={16} aria-hidden="true" /> Start a run to collect signal</span>}
      {!empty && <span className="chart-scale">max {formatNumber(max)}</span>}
    </div>
  )
}

function HowStep({ number, title, icon: Icon, children }: { number: string; title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <article className="how-step">
      <div className="how-step-top"><span>{number}</span><Icon size={18} aria-hidden="true" /></div>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  )
}

function SummaryPanel({ experiment }: { experiment: ExperimentView }) {
  const summary = experiment.summary
  if (!summary) return null
  return (
    <section className="summary-panel" aria-labelledby="summary-title">
      <div className="summary-intro">
        <span className="panel-label">RUN COMPLETE</span>
        <h2 id="summary-title">What the baseline did</h2>
        <p>The run accepted work without a user-facing protection strategy. Rejections below are only the internal safety cap protecting this demo process.</p>
      </div>
      <div className="summary-values">
        <div><span>successful</span><strong>{formatNumber(summary.totalCompleted)}</strong></div>
        <div><span>safety-cap rejected</span><strong>{formatNumber(summary.totalRejected)}</strong></div>
        <div><span>failed</span><strong>{formatNumber(summary.totalFailed)}</strong></div>
        <div><span>timed out</span><strong>{formatNumber(summary.totalTimedOut)}</strong></div>
        <div><span>p99 latency</span><strong>{formatLatency(summary.p99LatencyMs)}</strong></div>
        <div><span>max queue</span><strong>{formatNumber(summary.maxQueueDepth)}</strong></div>
      </div>
    </section>
  )
}

export default App
