import { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import AppGuide from './components/AppGuide'
import BuyTicketView from './components/BuyTicketView'
import DemoControls from './components/DemoControls'
import GuidedTutorial from './components/GuidedTutorial'
import LiveDrawView from './components/LiveDrawView'
import ProofTransparencyPanel from './components/ProofTransparencyPanel'
import WinnerProofView from './components/WinnerProofView'
import { checkMidnightService } from './midnight/api'

const TUTORIAL_STORAGE_KEY = 'confidential-lottery:tutorial-seen'

function App() {
  const [currentTab, setCurrentTab] = useState('buy')
  const [lastTicket, setLastTicket] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [midnightStatus, setMidnightStatus] = useState({ serviceUp: false, zkMode: 'mock' })
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [appGuideOpen, setAppGuideOpen] = useState(false)

  const refreshMidnightStatus = () => {
    let active = true
    checkMidnightService().then((status) => {
      if (active) setMidnightStatus(status)
    })
    return () => {
      active = false
    }
  }

  useEffect(() => {
    return refreshMidnightStatus()
  }, [])

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TUTORIAL_STORAGE_KEY) !== 'true') {
        setTutorialOpen(true)
      }
    } catch {
      setTutorialOpen(true)
    }
  }, [])

  const refreshPublicState = () => setRefreshKey((key) => key + 1)

  const handleDemoReset = () => {
    setLastTicket(null)
    setCurrentTab('buy')
    refreshPublicState()
    refreshMidnightStatus()
  }

  const handleDemoSeeded = (result) => {
    setLastTicket(result.winner_candidate)
    setCurrentTab('proof')
    refreshPublicState()
    refreshMidnightStatus()
  }

  const closeTutorial = () => {
    setTutorialOpen(false)
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true')
    } catch {
      // localStorage can be unavailable in private browser contexts.
    }
  }

  return (
    <div className="app-shell">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        midnightStatus={midnightStatus}
        onOpenAppGuide={() => setAppGuideOpen(true)}
        onOpenTutorial={() => setTutorialOpen(true)}
      />

      <main>
        <section className="hero-band" data-tour="app-hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <span className="badge-pill on-dark">INSTITUTIONAL DRAW</span>
              <h1>Private lottery, public proof.</h1>
              <p>
                Run a confidential lottery desk where ticket numbers stay hidden, commitments stay auditable, and winner claims carry a ZK proof trail.
              </p>
              <div className="hero-actions">
                <button className="primary-button hero-button" type="button" onClick={() => setCurrentTab('buy')}>
                  Buy ticket
                </button>
                <button className="secondary-button secondary-button-dark" type="button" onClick={() => setCurrentTab('draw')}>
                  View draw
                </button>
              </div>
            </div>

            <div className="product-mockup-stage" aria-hidden="true">
              <div className="mockup-card mockup-card-primary">
                <div className="mockup-card-header">
                  <span>Confidential Lottery</span>
                  <span className="status-dot" />
                </div>
                <div className="mockup-metric">
                  <span>Commitments</span>
                  <strong>1,000</strong>
                </div>
                <div className="mockup-row">
                  <span>Proof mode</span>
                  <strong>{midnightStatus.serviceUp ? midnightStatus.zkMode : 'mock'}</strong>
                </div>
                <div className="mockup-row">
                  <span>Network</span>
                  <strong>Preview</strong>
                </div>
                <div className="mockup-bars">
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div className="mockup-card mockup-card-secondary">
                <div>
                  <span className="mockup-label">Latest proof hash</span>
                  <strong>6f2a...91c4</strong>
                </div>
                <div className="mockup-proof-line" />
                <div className="mockup-proof-line short" />
              </div>
            </div>
          </div>
        </section>

        <div className="workspace-shell">
          <div className="hackathon-grid">
            <DemoControls onReset={handleDemoReset} onSeeded={handleDemoSeeded} />
            <ProofTransparencyPanel midnightStatus={midnightStatus} />
          </div>

          <div className={currentTab === 'buy' ? '' : 'hidden'}>
            <BuyTicketView
              onTicketCreated={(ticket) => {
                setLastTicket(ticket)
                refreshPublicState()
              }}
            />
          </div>

          <div className={currentTab === 'draw' ? '' : 'hidden'}>
            <LiveDrawView refreshKey={refreshKey} onDrawComplete={refreshPublicState} />
          </div>

          <div className={currentTab === 'proof' ? '' : 'hidden'}>
            <WinnerProofView lastTicket={lastTicket} refreshKey={refreshKey} onClaimCreated={refreshPublicState} />
          </div>
        </div>
      </main>

      <AppGuide open={appGuideOpen} onClose={() => setAppGuideOpen(false)} />
      <GuidedTutorial open={tutorialOpen} onClose={closeTutorial} setCurrentTab={setCurrentTab} />
    </div>
  )
}

export default App
