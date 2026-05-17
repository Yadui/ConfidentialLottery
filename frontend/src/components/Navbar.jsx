import { Activity, CircleHelp, Globe2, RadioTower, Ticket, Trophy } from 'lucide-react'

const tabs = [
  { id: 'buy', label: 'Buy Ticket', icon: Ticket },
  { id: 'draw', label: 'Live Draw', icon: Activity },
  { id: 'proof', label: 'Winner Proof', icon: Trophy },
]

function Navbar({ currentTab, setCurrentTab, midnightStatus, onOpenAppGuide, onOpenTutorial }) {
  const zkMode = midnightStatus?.zkMode ?? 'mock'
  const serviceUp = Boolean(midnightStatus?.serviceUp)

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <button className="brand-button" type="button" onClick={() => setCurrentTab('buy')}>
          <span className="brand-mark">
            <Ticket className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>Confidential Lottery</span>
        </button>

        <div className="nav-cluster">
          <nav className="tab-nav" data-tour="tab-navigation" aria-label="Lottery workflow">
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = currentTab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCurrentTab(id)}
                  className={active ? 'nav-tab is-active' : 'nav-tab'}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              )
            })}
          </nav>

          <div className="nav-actions">
            <button className="icon-button" type="button" aria-label="Open app guide" onClick={onOpenAppGuide}>
              <Globe2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button className="guide-button" type="button" onClick={onOpenTutorial}>
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
              <span>Guide</span>
            </button>
          </div>

          <div className="network-pill">
            <RadioTower className={serviceUp ? 'h-4 w-4 text-[var(--semantic-up)]' : 'h-4 w-4 text-[var(--accent-yellow)]'} aria-hidden="true" />
            <span>{serviceUp ? `ZK ${zkMode}` : 'Mock ready'}</span>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Navbar
