import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { revealWinnerProof } from '../midnight/api'
import { API_BASE, DEFAULT_LOTTERY_ID } from '../midnight/config'

function WinnerProofView({ lotteryId, lastTicket, refreshKey, onClaimCreated }) {
  const activeLotteryId = lotteryId ?? DEFAULT_LOTTERY_ID
  const [ticketId, setTicketId] = useState('')
  const [ticketNumber, setTicketNumber] = useState('')
  const [nonce, setNonce] = useState('')
  const [draw, setDraw] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [drawLoading, setDrawLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!lastTicket) return
    setTicketId(lastTicket.ticket_id ?? '')
    setTicketNumber(String(lastTicket.ticket_number ?? ''))
    setNonce(lastTicket.nonce ?? '')
  }, [lastTicket])

  async function loadDraw() {
    setDrawLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/draw/current?lottery_id=${encodeURIComponent(activeLotteryId)}`)
      if (!res.ok) throw new Error('Unable to load current draw')
      setDraw(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setDrawLoading(false)
    }
  }

  useEffect(() => {
    loadDraw()
  }, [refreshKey, activeLotteryId])

  async function handleClaim(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    const parsedTicket = Number(ticketNumber)
    try {
      if (!draw?.drawn_number) throw new Error('Draw is not revealed yet')
      if (!ticketId.trim()) throw new Error('ticket_id is required')
      if (!Number.isInteger(parsedTicket) || parsedTicket < 1 || parsedTicket > 1000) {
        throw new Error('ticket_number must be between 1 and 1000')
      }
      if (!nonce.trim()) throw new Error('nonce is required')

      const proof = await revealWinnerProof(null, {
        ticket_id: ticketId.trim(),
        drawn_number: draw.drawn_number,
        ticket_number: parsedTicket,
        nonce: nonce.trim(),
      })

      const claimRes = await fetch(`${API_BASE}/api/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId.trim(),
          ticket_number: parsedTicket,
          nonce: nonce.trim(),
          drawn_number: draw.drawn_number,
          proof_hash: proof.proofHash,
          is_winner: proof.isWinner,
          zk_mode: proof.mode,
        }),
      })

      if (!claimRes.ok) {
        const body = await claimRes.json().catch(() => ({ detail: claimRes.statusText }))
        throw new Error(body.detail ?? 'Claim rejected')
      }

      const claim = await claimRes.json()
      setResult({ ...proof, ...claim })
      onClaimCreated?.(claim)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="module-section">
      <div className="module-grid">
        <div className="editorial-card" data-tour="claim-form">
          <p className="section-kicker">Private Reveal</p>
          <h2 className="section-title">Winner proof</h2>
          <p className="section-copy">
            The claim circuit proves `drawn_number == ticket_number` while preserving every non-winning ticket commitment.
          </p>

          <div className="draw-input-panel">
            <div className="card-title-row">
              <KeyRound className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
              <span>Draw input</span>
            </div>
            <div className="draw-input-list">
              <div>
                <span>Status</span>
                <span className="status-pill status-blue">{drawLoading ? 'loading' : draw?.status ?? 'pending'}</span>
              </div>
              <div>
                <span>Drawn number</span>
                <span className="mono-value">{draw?.drawn_number ?? 'sealed'}</span>
              </div>
            </div>
          </div>

          <form className="form-stack" onSubmit={handleClaim}>
            <label className="field-label">
              Ticket ID
              <input
                className="lottery-input"
                type="text"
                value={ticketId}
                onChange={(event) => setTicketId(event.target.value)}
                placeholder="UUID"
              />
            </label>

            <label className="field-label">
              Original number
              <input
                className="lottery-input"
                type="number"
                min="1"
                max="1000"
                value={ticketNumber}
                onChange={(event) => setTicketNumber(event.target.value)}
                placeholder="1-1000"
              />
            </label>

            <label className="field-label">
              Nonce
              <input
                className="lottery-input"
                type="text"
                value={nonce}
                onChange={(event) => setNonce(event.target.value)}
                placeholder="Private nonce"
              />
            </label>

            <button className="primary-button" type="submit" disabled={loading || drawLoading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              <span>{loading ? 'Proving' : 'Reveal Winner Proof'}</span>
            </button>
          </form>
        </div>

        <div className="side-stack">
          {error ? (
            <div className="alert-card alert-error">{error}</div>
          ) : null}

          {result ? (
            <div className="output-card success-card">
              <div className="success-title">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                <span>ZK proof result: is_winner: {result.isWinner ?? result.is_winner}</span>
              </div>
              <div className="result-stack">
                <ResultRow label="Winner ticket" value={result.ticket_id} />
                <ResultRow label="Proof hash" value={result.proofHash ?? result.proof_hash} />
                <ResultRow label="Mode" value={result.mode ?? result.zk_mode} />
              </div>
            </div>
          ) : (
            <div className="empty-card">
              A successful reveal will show the winning ticket ID and proof hash here.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ResultRow({ label, value }) {
  return (
    <div className="result-row">
      <div>{label}</div>
      <div>{value}</div>
    </div>
  )
}

export default WinnerProofView
