import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Database,
  Gauge,
  Layers3,
  Radio,
  Server,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const scenarioRows: Array<{
  id: string
  name: string
  description: string
  effect: string
  icon: LucideIcon
}> = [
  {
    id: 'traffic-spike',
    name: 'Sudden traffic spike',
    description: 'A safe warmup jumps above capacity, then eases so recovery is visible.',
    effect: 'queue growth + tail latency',
    icon: Radio,
  },
  {
    id: 'slow-dependency',
    name: 'Slow dependency',
    description: 'Traffic stays steady while the downstream service becomes several times slower.',
    effect: 'capacity collapses underneath load',
    icon: Clock3,
  },
  {
    id: 'dependency-failure',
    name: 'Dependency failure',
    description: 'A failure window creates errors while incoming work continues to arrive.',
    effect: 'errors + timeout pressure',
    icon: AlertCircle,
  },
  {
    id: 'healthy',
    name: 'Healthy system',
    description: 'A control run keeps traffic below the worker pool’s effective capacity.',
    effect: 'stable queue + low latency',
    icon: Gauge,
  },
]

export default function LandingPage() {
  return (
    <div className="landing-shell">
      <header className="landing-header">
        <a className="brand" href="/" aria-label="Backpressure Lab home">
          <span className="brand-mark"><Activity size={17} strokeWidth={2.4} /></span>
          <span>Backpressure <em>Lab</em></span>
        </a>
        <nav className="landing-nav" aria-label="Primary navigation">
          <a href="#why">Why it matters</a>
          <a href="#scenarios">Scenarios</a>
          <a href="#model">The model</a>
        </nav>
        <a className="header-action" href="/lab?scenario=traffic-spike">
          Open the lab <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <h1 id="landing-title">When traffic outruns capacity, <span>the system tells you why.</span></h1>
            <p className="landing-lede">
              Backpressure Lab is a small, real-concurrency experiment for seeing overload happen: work arrives, waits, contends, times out, and eventually recovers.
            </p>
            <div className="landing-actions">
              <a className="button button-primary" href="/lab?scenario=traffic-spike">
                Run a traffic spike <ArrowRight size={16} aria-hidden="true" />
              </a>
              <a className="button button-quiet" href="#model">
                See the model <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="landing-facts" aria-label="Lab facts">
              <div><strong>01</strong><span>real concurrent work</span></div>
              <div><strong>02</strong><span>live metric snapshots</span></div>
              <div><strong>03</strong><span>no scripted curves</span></div>
            </div>
          </div>

          <div className="system-figure" id="model" aria-labelledby="model-title">
            <div className="figure-header">
              <div>
                <span className="figure-label">THE MODEL</span>
                <h2 id="model-title">A finite pipeline</h2>
              </div>
              <span className="figure-status"><i /> baseline</span>
            </div>
            <div className="system-map" aria-label="Traffic flows through admission, a queue, workers, and a downstream dependency">
              <SystemNode icon={Radio} label="traffic" detail="35 → 340 req/s" />
              <SystemConnector />
              <SystemNode icon={Layers3} label="queue" detail="waiting work" />
              <SystemConnector />
              <SystemNode icon={Server} label="workers" detail="12 slots" />
              <SystemConnector />
              <SystemNode icon={Database} label="dependency" detail="finite capacity" />
            </div>
            <div className="figure-readout">
              <div>
                <span>WHAT CHANGES</span>
                <strong>offered load</strong>
              </div>
              <ArrowRight size={16} aria-hidden="true" />
              <div>
                <span>WHAT EMERGES</span>
                <strong>waiting time</strong>
              </div>
            </div>
            <div className="figure-foot">
              <span>request deadline <strong>1.5s</strong></span>
              <span>safety cap <strong>2,000</strong></span>
            </div>
          </div>
        </section>

        <section className="landing-statement" id="why" aria-labelledby="why-title">
          <div className="statement-lede">
            <span className="section-index">01</span>
            <h2 id="why-title">Most overload is invisible until it is expensive.</h2>
          </div>
          <div className="statement-body">
            <p>Average latency can look fine while the slowest requests are already waiting behind a growing queue. Throughput can flatten while incoming work keeps climbing.</p>
            <p>The lab makes those relationships concrete. You change one condition, then watch the system respond in real time.</p>
          </div>
        </section>

        <section className="landing-scenarios" id="scenarios" aria-labelledby="scenarios-title">
          <div className="section-heading-row">
            <div className="section-heading">
              <span className="section-index">02</span>
              <div>
                <h2 id="scenarios-title">Choose a condition.</h2>
                <p>Each preset creates a different path to overload. Start with the spike, then try changing capacity instead of traffic.</p>
              </div>
            </div>
            <a className="text-link" href="/lab">View all in the lab <ArrowUpRight size={16} aria-hidden="true" /></a>
          </div>
          <div className="scenario-list">
            {scenarioRows.map((scenario) => (
              <a className="scenario-row" href={`/lab?scenario=${scenario.id}`} key={scenario.id}>
                <span className="scenario-icon"><scenario.icon size={17} aria-hidden="true" /></span>
                <span className="scenario-main">
                  <strong>{scenario.name}</strong>
                  <span>{scenario.description}</span>
                </span>
                <span className="scenario-effect">{scenario.effect}</span>
                <ArrowUpRight className="scenario-arrow" size={17} aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>

        <section className="landing-cta" aria-labelledby="cta-title">
          <div>
            <span className="section-index">03</span>
            <h2 id="cta-title">Start with the moment<br />the queue appears.</h2>
          </div>
          <div className="cta-copy">
            <p>The first run is already configured. You only need to press play and watch the relationship between arrival rate and capacity unfold.</p>
            <a className="button button-primary" href="/lab?scenario=traffic-spike">Open the experiment <ArrowUpRight size={16} aria-hidden="true" /></a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="brand" href="/" aria-label="Backpressure Lab home"><span className="brand-mark"><Activity size={15} aria-hidden="true" /></span><span>Backpressure <em>Lab</em></span></a>
        <span>Real work. Synthetic dependency. Ephemeral run.</span>
        <span>Phase 01 / baseline</span>
      </footer>
    </div>
  )
}

function SystemNode({ icon: Icon, label, detail }: { icon: LucideIcon; label: string; detail: string }) {
  return (
    <div className="system-node">
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
      <strong>{detail}</strong>
    </div>
  )
}

function SystemConnector() {
  return <span className="system-connector" aria-hidden="true"><i /></span>
}
