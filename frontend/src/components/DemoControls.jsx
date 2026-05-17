import { DatabaseZap, Loader2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { resetDemo, seedDemo } from '../midnight/api'

function DemoControls({ onReset, onSeeded }) {
  const [busyAction, setBusyAction] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleReset() {
    setBusyAction('reset')
    setMessage('')
    setError('')
    try {
      const result = await resetDemo()
      setMessage(`Cleared ${result.deleted.tickets} tickets, ${result.deleted.draws} draws, and ${result.deleted.claims} claims.`)
      onReset?.(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAction('')
    }
  }

  async function handleSeed() {
    setBusyAction('seed')
    setMessage('')
    setError('')
    try {
      const result = await seedDemo()
      setMessage(`Seeded ${result.tickets.length} tickets and revealed draw #${result.draw.drawn_number}.`)
      onSeeded?.(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAction('')
    }
  }

  const isBusy = Boolean(busyAction)

  return (
    <section className="demo-console" data-tour="demo-controls">
      <div>
        <span className="badge-pill">JUDGE DEMO</span>
        <h2>Reliable demo state</h2>
        <p>Reset the lottery or seed known tickets with a revealed winning number for a fast end-to-end presentation.</p>
        {message ? <div className="demo-message">{message}</div> : null}
        {error ? <div className="demo-error">{error}</div> : null}
      </div>

      <div className="demo-actions">
        <button className="secondary-button" type="button" onClick={handleReset} disabled={isBusy}>
          {busyAction === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
          <span>Reset demo</span>
        </button>
        <button className="primary-button" type="button" onClick={handleSeed} disabled={isBusy}>
          {busyAction === 'seed' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <DatabaseZap className="h-4 w-4" aria-hidden="true" />}
          <span>Seed tickets</span>
        </button>
      </div>
    </section>
  )
}

export default DemoControls