import { Clock3, Dice5, Hash, Loader2, RefreshCw, Shuffle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getAuditTimeline } from '../midnight/api'
import { API_BASE, DEFAULT_LOTTERY_ID } from '../midnight/config'

function LiveDrawView({ lotteryId, roundStatus, refreshKey, onDrawComplete }) {
  const activeLotteryId = lotteryId ?? DEFAULT_LOTTERY_ID
  const [tickets, setTickets] = useState([])
  const [draw, setDraw] = useState(null)
  const [claim, setClaim] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [ticketsRes, drawRes, claimRes] = await Promise.all([
        fetch(`${API_BASE}/api/tickets?lottery_id=${encodeURIComponent(activeLotteryId)}`),
        fetch(`${API_BASE}/api/draw/current?lottery_id=${encodeURIComponent(activeLotteryId)}`),
        fetch(`${API_BASE}/api/claim/result?lottery_id=${encodeURIComponent(activeLotteryId)}`),
      ])
      if (!ticketsRes.ok || !drawRes.ok || !claimRes.ok) throw new Error('Unable to load lottery state')
      const ticketsBody = await ticketsRes.json()
      setTickets(ticketsBody.tickets ?? [])
      setDraw(await drawRes.json())
      setClaim(await claimRes.json())
      const timeline = await getAuditTimeline(activeLotteryId)
      setEvents(timeline.events ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [refreshKey, activeLotteryId])

  async function runDraw() {
    setDrawing(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lottery_id: activeLotteryId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? 'Draw failed')
      }
      const nextDraw = await res.json()
      setDraw(nextDraw)
      onDrawComplete?.()
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setDrawing(false)
    }
  }

  const drawVisible = draw?.status === 'revealed' && draw.drawn_number
  const canDraw = !drawing && tickets.length > 0 && !['revealed', 'claimed', 'archived'].includes(roundStatus)
  const drawDisabledReason = tickets.length === 0
    ? 'Buy at least one ticket before drawing'
    : ['revealed', 'claimed', 'archived'].includes(roundStatus)
      ? `Round is already ${roundStatus}`
      : null

  return (
    <section className="module-section">
      <div className="section-toolbar">
        <div>
          <p className="section-kicker">Public Commit Board</p>
          <h2 className="section-title">Live draw</h2>
          <p className="section-copy wide">
            Ticket commitments are visible for auditability; selected numbers stay hidden until the winner proves their match.
          </p>
        </div>

        <div className="action-row" data-tour="draw-actions">
          <button className="secondary-button" type="button" onClick={refresh} disabled={loading || drawing}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={runDraw}
            disabled={!canDraw}
            title={drawDisabledReason ?? undefined}
          >
            {drawing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Shuffle className="h-4 w-4" aria-hidden="true" />}
            <span>{drawing ? 'Drawing' : 'Run Draw'}</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="alert-card alert-error section-alert">{error}</div>
      ) : null}

      <RandomnessPanel />

      <div className="draw-grid">
        <div className="editorial-card compact-card">
          <div className="card-title-row">
            <Hash className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
            <span>Current lottery</span>
          </div>
          <dl className="info-list">
            <InfoRow label="Lottery ID" value={draw?.lottery_id ?? activeLotteryId} />
            <InfoRow label="Tickets sold" value={draw?.tickets_sold ?? tickets.length} />
            <InfoRow label="Draw status" value={draw?.status ?? 'pending'} />
            <InfoRow label="Drawn number" value={drawVisible ? draw.drawn_number : 'sealed'} highlight={Boolean(drawVisible)} />
            <InfoRow label="Winner" value={claim?.winner_ticket_id ?? 'pending'} />
          </dl>
        </div>

        <div className="commit-table">
          <div className="commit-header commit-grid">
            <span>UUID</span>
            <span>Commit hash</span>
            <span>Status</span>
          </div>

          <div className="commit-body">
            {tickets.length === 0 ? (
              <div className="commit-empty">No ticket commitments yet.</div>
            ) : (
              tickets.map((ticket) => (
                <div key={ticket.ticket_id} className="commit-row commit-grid">
                  <span>{ticket.ticket_id}</span>
                  <span>{ticket.commit_hash}</span>
                  <span className={ticket.status === 'winner' ? 'status-pill status-emerald' : 'status-pill status-slate'}>{ticket.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <AuditTimeline events={events} />
    </section>
  )
}

function RandomnessPanel() {
  return (
    <div className="randomness-panel" data-tour="randomness-story">
      <div className="callout-title">
        <Dice5 className="h-4 w-4" aria-hidden="true" />
        <span>Randomness model</span>
      </div>
      <p>
        Live draws use backend cryptographic randomness via Python secrets. The demo seed pins one known revealed number for judging; production would replace the draw source with a Midnight-compatible oracle or VRF-backed circuit input.
      </p>
    </div>
  )
}

function AuditTimeline({ events }) {
  return (
    <div className="audit-panel" data-tour="audit-timeline">
      <div className="audit-heading">
        <div className="callout-title">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          <span>Public audit timeline</span>
        </div>
        <span className="badge-pill">{events.length} EVENTS</span>
      </div>

      <div className="timeline-list">
        {events.length === 0 ? (
          <div className="timeline-empty">No public events yet.</div>
        ) : (
          events.map((event) => <TimelineEvent key={event.id} event={event} />)
        )}
      </div>
    </div>
  )
}

function TimelineEvent({ event }) {
  return (
    <article className="timeline-event">
      <div className="timeline-dot" />
      <div>
        <div className="timeline-title-row">
          <h3>{event.title}</h3>
          <time>{formatTimestamp(event.timestamp)}</time>
        </div>
        <p>{event.description}</p>
        <div className="timeline-meta">
          <span className="status-pill status-slate">{event.type}</span>
          <span className="status-pill status-blue">{event.status}</span>
          {event.zk_mode ? <span className="status-pill status-slate">{event.zk_mode}</span> : null}
        </div>
      </div>
    </article>
  )
}

function formatTimestamp(value) {
  if (!value) return 'pending'
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function InfoRow({ label, value, highlight }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd className={highlight ? 'is-positive' : ''}>{value}</dd>
    </div>
  )
}

export default LiveDrawView
