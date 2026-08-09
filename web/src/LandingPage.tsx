import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react'
import { ScenarioPicker, type ScenarioOption } from './ScenarioPicker'
import { ThemeToggle } from './Theme'

const scenarioRows: Array<ScenarioOption & { effect: string }> = [
  {
    id: 'traffic-spike',
    name: 'Sudden traffic spike',
    description: 'Traffic jumps above capacity, then eases so recovery is visible.',
    effect: 'queue growth and tail latency',
  },
  {
    id: 'slow-dependency',
    name: 'Slow dependency',
    description: 'The downstream service becomes slower while traffic stays steady.',
    effect: 'capacity collapses underneath load',
  },
  {
    id: 'dependency-failure',
    name: 'Dependency failure',
    description: 'A failure window creates errors while new work keeps arriving.',
    effect: 'errors and timeout pressure',
  },
  {
    id: 'healthy',
    name: 'Healthy system',
    description: 'A control run keeps traffic below the worker pool capacity.',
    effect: 'stable queue and low latency',
  },
]

export default function LandingPage() {
  const [selectedScenario, setSelectedScenario] = useState('traffic-spike')
  const [menuOpen, setMenuOpen] = useState(false)
  const selected = scenarioRows.find((scenario) => scenario.id === selectedScenario) ?? scenarioRows[0]
  const labHref = `/lab?scenario=${selected.id}`

  const chooseScenario = (scenarioId: string) => {
    setSelectedScenario(scenarioId)
    setMenuOpen(false)
  }

  return (
    <div className="landing-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="landing-header">
        <a className="brand" href="/" aria-label="Backpressure Lab home">
          <span className="brand-mark" aria-hidden="true" />
          <span>BACKPRESSURE LAB</span>
        </a>
        <nav className="landing-nav" aria-label="Primary navigation">
          <a href="#experiment">Experiment</a>
          <a href="#model">Model</a>
          <a href="https://github.com/darshmahadevia/backpressure-lab" target="_blank" rel="noreferrer">Source</a>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <a className="header-lab-link" href={labHref}>Enter lab <ArrowUpRight size={14} aria-hidden="true" /></a>
          <button
            className="mobile-nav-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="mobile-nav-panel" aria-label="Mobile navigation">
            <a href="#experiment" onClick={() => setMenuOpen(false)}>Experiment</a>
            <a href="#model" onClick={() => setMenuOpen(false)}>Model</a>
            <a href="https://github.com/darshmahadevia/backpressure-lab" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Source</a>
          </nav>
        )}
      </header>

      <main id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <h1 id="landing-title">See what happens when work arrives faster than it leaves.</h1>
            <p className="landing-lede">
              Backpressure Lab is a small, real-concurrency experiment for watching overload emerge: work arrives, waits, contends, times out, and recovers.
            </p>
            <div className="landing-actions">
              <a className="button button-primary" href={labHref}>Open the experiment <ArrowRight size={15} aria-hidden="true" /></a>
              <a className="text-link" href="#model">See the model <ArrowRight size={14} aria-hidden="true" /></a>
            </div>
            <div className="hero-meta" aria-label="Project characteristics">
              <span>real concurrent work</span>
              <span>live snapshots</span>
              <span>no scripted curves</span>
            </div>
          </div>

          <figure className="hero-proof" id="model">
            <div className="proof-heading">
              <h2>Four places to see pressure.</h2>
              <span>baseline / finite capacity</span>
            </div>
            <SystemDiagram />
            <figcaption>
              The experiment changes offered load or dependency behavior. The queue and tail latency show the cost.
            </figcaption>
          </figure>
        </section>

        <section className="method-section" aria-labelledby="method-title">
          <div className="section-lede">
            <h2 id="method-title">One condition. One live run.</h2>
            <p>Change one thing, then watch the relationship between arrival rate and finite capacity become observable.</p>
          </div>
          <div className="method-list">
            <div><strong>01</strong><span>Work enters the system.</span></div>
            <div><strong>02</strong><span>Workers reach their limit.</span></div>
            <div><strong>03</strong><span>Waiting time becomes the signal.</span></div>
          </div>
        </section>

        <section className="experiment-section" id="experiment" aria-labelledby="experiment-title">
          <div className="section-lede">
            <h2 id="experiment-title">Choose a condition.</h2>
            <p>Each preset makes a different part of the mechanism visible.</p>
          </div>
          <ScenarioPicker options={scenarioRows} value={selectedScenario} onChange={chooseScenario} />
          <div className="selection-line">
            <span>{selected.effect}</span>
            <a className="text-link" href={labHref}>Run {selected.name.toLowerCase()} <ArrowUpRight size={14} aria-hidden="true" /></a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="brand" href="/" aria-label="Backpressure Lab home"><span className="brand-mark" aria-hidden="true" /><span>BACKPRESSURE LAB</span></a>
        <span>real work / synthetic dependency / ephemeral run</span>
      </footer>
    </div>
  )
}

function SystemDiagram() {
  return (
    <svg className="system-diagram" viewBox="0 0 620 230" role="img" aria-label="Traffic flows through a queue, workers, and a dependency">
      <line className="diagram-track" x1="42" y1="92" x2="578" y2="92" />
      <line className="diagram-track diagram-track-faint" x1="42" y1="154" x2="578" y2="154" />
      <circle className="diagram-dot diagram-dot-accent" cx="76" cy="92" r="7" />
      <circle className="diagram-dot" cx="246" cy="92" r="7" />
      <circle className="diagram-dot" cx="406" cy="92" r="7" />
      <circle className="diagram-dot" cx="566" cy="92" r="7" />
      <path className="diagram-flow" d="M 92 92 C 132 60, 170 60, 226 92 S 330 124, 386 92 S 490 60, 546 92" />
      <rect className="diagram-queue" x="218" y="137" width="56" height="10" rx="2" />
      <rect className="diagram-queue" x="282" y="137" width="35" height="10" rx="2" />
      <rect className="diagram-queue" x="325" y="137" width="17" height="10" rx="2" />
      <text x="42" y="49">incoming</text>
      <text x="212" y="49">queue</text>
      <text x="373" y="49">workers</text>
      <text x="523" y="49">dependency</text>
      <text className="diagram-value" x="42" y="190">offered load</text>
      <text className="diagram-value" x="218" y="190">waiting work</text>
      <text className="diagram-value" x="373" y="190">finite slots</text>
      <text className="diagram-value" x="523" y="190" textAnchor="end">deadline</text>
    </svg>
  )
}
