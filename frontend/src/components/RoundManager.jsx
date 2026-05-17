import { Archive, CheckCircle2, Loader2, Lock, PlusCircle, RefreshCw, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { archiveRound, createRound, getRounds, lockRound } from '../midnight/api'

const STATUS_LABELS = {
  open: 'Open',
  locked: 'Locked',
  revealed: 'Revealed',
  claimed: 'Claimed',
  archived: 'Archived',
}

function RoundManager({ selectedRoundId, onRoundSelect, onRoundChange }) {
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [newName, setNewName] = useState('')
  const [newMin, setNewMin] = useState('1')
  const [newMax, setNewMax] = useState('1000')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await getRounds()
      setRounds(data.rounds ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError('')
    try {
      const round = await createRound({
        name: newName.trim(),
        ticket_min: parseInt(newMin, 10) || 1,
        ticket_max: parseInt(newMax, 10) || 1000,
      })
      setNewName('')
      setNewMin('1')
      setNewMax('1000')
      setShowForm(false)
      await load()
      onRoundSelect?.(round.lottery_id)
      onRoundChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleLock(lotteryId) {
    setActionBusy(`${lotteryId}:lock`)
    setError('')
    try {
      await lockRound(lotteryId)
      await load()
      onRoundChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionBusy('')
    }
  }

  async function handleArchive(lotteryId) {
    setActionBusy(`${lotteryId}:archive`)
    setError('')
    try {
      await archiveRound(lotteryId)
      if (lotteryId === selectedRoundId) {
        const remaining = rounds.filter((r) => r.lottery_id !== lotteryId && r.status !== 'archived')
        if (remaining.length > 0) onRoundSelect?.(remaining[0].lottery_id)
      }
      await load()
      onRoundChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setActionBusy('')
    }
  }

  const activeRounds = rounds.filter((r) => r.status !== 'archived')
  const archivedRounds = rounds.filter((r) => r.status === 'archived')

  return (
    <section className="module-section round-manager-section" data-tour="round-manager">
      <div className="section-toolbar">
        <div>
          <p className="section-kicker">Operator Console</p>
          <h2 className="section-title">Round manager</h2>
          <p className="section-copy wide">
            Create and manage lottery rounds. Each round has its own tickets, draw, and audit trail.
          </p>
        </div>
        <div className="action-row">
          <button className="secondary-button" type="button" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => setShowForm((v) => !v)}
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            <span>New round</span>
          </button>
        </div>
      </div>

      {error ? <div className="alert-card alert-error section-alert">{error}</div> : null}

      {showForm ? (
        <form className="round-create-form editorial-card compact-card" onSubmit={handleCreate}>
          <p className="round-form-heading">Create new lottery round</p>
          <div className="round-form-fields">
            <label className="round-form-label">
              <span>Round name</span>
              <input
                className="ticket-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Q3 2026 Draw"
                required
              />
            </label>
            <label className="round-form-label round-form-label--narrow">
              <span>Min #</span>
              <input
                className="ticket-input"
                type="number"
                value={newMin}
                onChange={(e) => setNewMin(e.target.value)}
                min="1"
                max="1000"
              />
            </label>
            <label className="round-form-label round-form-label--narrow">
              <span>Max #</span>
              <input
                className="ticket-input"
                type="number"
                value={newMax}
                onChange={(e) => setNewMax(e.target.value)}
                min="1"
                max="1000"
              />
            </label>
          </div>
          <div className="demo-actions" style={{ marginTop: '16px' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={creating || !newName.trim()}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
              )}
              <span>Create round</span>
            </button>
          </div>
        </form>
      ) : null}

      {loading && rounds.length === 0 ? (
        <div className="rounds-loading">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Loading rounds…</span>
        </div>
      ) : (
        <div className="rounds-grid">
          {activeRounds.length === 0 && !showForm ? (
            <div className="rounds-empty">No active rounds. Create one above.</div>
          ) : (
            activeRounds.map((round) => (
              <RoundCard
                key={round.lottery_id}
                round={round}
                isSelected={round.lottery_id === selectedRoundId}
                actionBusy={actionBusy}
                onSelect={() => onRoundSelect?.(round.lottery_id)}
                onLock={() => handleLock(round.lottery_id)}
                onArchive={() => handleArchive(round.lottery_id)}
              />
            ))
          )}

          {archivedRounds.length > 0 && (
            <>
              <p className="rounds-section-label">Archived</p>
              {archivedRounds.map((round) => (
                <RoundCard
                  key={round.lottery_id}
                  round={round}
                  isSelected={round.lottery_id === selectedRoundId}
                  actionBusy={actionBusy}
                  onSelect={() => onRoundSelect?.(round.lottery_id)}
                  onLock={null}
                  onArchive={null}
                />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function RoundCard({ round, isSelected, actionBusy, onSelect, onLock, onArchive }) {
  const lockBusy = actionBusy === `${round.lottery_id}:lock`
  const archiveBusy = actionBusy === `${round.lottery_id}:archive`

  return (
    <div className={`round-card${isSelected ? ' round-card--selected' : ''}`}>
      <button className="round-card-body" type="button" onClick={onSelect}>
        <div className="round-card-top">
          <span className="round-card-name">{round.name}</span>
          <span className={`round-status-badge round-status-${round.status}`}>
            {STATUS_LABELS[round.status] ?? round.status}
          </span>
        </div>
        <div className="round-card-meta">
          <span className="round-card-id">{round.lottery_id}</span>
          <span className="round-card-tickets">
            {round.tickets_sold} ticket{round.tickets_sold !== 1 ? 's' : ''}
          </span>
          <span className="round-card-range">
            #{round.ticket_min}–#{round.ticket_max}
          </span>
        </div>
        {round.winner ? (
          <div className="round-card-winner">
            <Trophy className="h-3 w-3" aria-hidden="true" />
            <span>
              Winner: {round.winner.ticket_id.length > 14
                ? `${round.winner.ticket_id.slice(0, 14)}…`
                : round.winner.ticket_id}
            </span>
            <span className="round-card-proof">
              {round.winner.proof_hash.slice(0, 10)}…
            </span>
          </div>
        ) : null}
        {isSelected ? (
          <div className="round-card-selected-indicator">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Active round</span>
          </div>
        ) : null}
      </button>

      {(onLock || onArchive) ? (
        <div className="round-card-actions">
          {onLock && round.status === 'open' ? (
            <button
              className="secondary-button round-action-btn"
              type="button"
              onClick={(e) => { e.stopPropagation(); onLock() }}
              disabled={lockBusy || archiveBusy}
              title="Lock ticket sales"
            >
              {lockBusy
                ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                : <Lock className="h-3 w-3" aria-hidden="true" />}
              <span>Lock</span>
            </button>
          ) : null}
          {onArchive ? (
            <button
              className="secondary-button round-action-btn"
              type="button"
              onClick={(e) => { e.stopPropagation(); onArchive() }}
              disabled={lockBusy || archiveBusy}
              title="Archive round"
            >
              {archiveBusy
                ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                : <Archive className="h-3 w-3" aria-hidden="true" />}
              <span>Archive</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default RoundManager
