import { Check, Copy, Download, Loader2, Lock, Send } from 'lucide-react'
import { useState } from 'react'
import { buyTicketProof, generateNonce } from '../midnight/api'
import { API_BASE, DEFAULT_LOTTERY_ID } from '../midnight/config'

function BuyTicketView({ lotteryId, roundStatus, onTicketCreated }) {
  const activeLotteryId = lotteryId ?? DEFAULT_LOTTERY_ID
  const isClosed = roundStatus && roundStatus !== 'open'
  const [ticketNumber, setTicketNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [proofResult, setProofResult] = useState(null)
  const [receiptCopied, setReceiptCopied] = useState(false)
  const [error, setError] = useState('')

  const parsedTicket = Number(ticketNumber)
  const canSubmit = Number.isInteger(parsedTicket) && parsedTicket >= 1 && parsedTicket <= 1000 && !loading && !isClosed

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError('')
    setProofResult(null)
    setReceiptCopied(false)

    const ticketId = crypto.randomUUID ? crypto.randomUUID() : `ticket-${Date.now()}`
    const nonce = generateNonce()

    try {
      const proof = await buyTicketProof(null, {
        ticket_id: ticketId,
        lottery_id: activeLotteryId,
        ticket_number: parsedTicket,
        nonce,
      })

      const res = await fetch(`${API_BASE}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          lottery_id: activeLotteryId,
          ticket_number: parsedTicket,
          nonce,
          nickname: nickname.trim() || null,
          commit_hash: proof.commitHash,
          proof_hash: proof.proofHash,
          zk_mode: proof.mode,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? 'Backend rejected ticket')
      }

      const saved = await res.json()
      const ticket = { ...saved, nonce, ticket_number: parsedTicket }
      setProofResult({ ...proof, ...ticket })
      setTicketNumber('')
      setNickname('')
      onTicketCreated?.(ticket)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function copyReceipt() {
    if (!proofResult) return
    try {
      await navigator.clipboard.writeText(formatReceipt(proofResult))
      setReceiptCopied(true)
      window.setTimeout(() => setReceiptCopied(false), 1800)
    } catch {
      setError('Unable to copy receipt in this browser')
    }
  }

  function downloadReceipt() {
    if (!proofResult) return
    const blob = new Blob([formatReceipt(proofResult)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `confidential-lottery-${proofResult.ticket_id}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="module-section">
      <div className="module-grid">
        <div className="editorial-card" data-tour="buy-form">
          <p className="section-kicker">Private Ticket Mint</p>
          <h2 className="section-title">Buy a hidden-number ticket</h2>
          <p className="section-copy">
            Pick a number from 1 to 1000. The commitment is public; the number and nonce stay encrypted off-chain and private in the circuit witness.
          </p>

          {isClosed ? (
            <div className="alert-card alert-error" style={{ marginBottom: '16px' }}>
              Ticket sales are closed — this round is <strong>{roundStatus}</strong>.
            </div>
          ) : null}

          <form className="form-stack" onSubmit={handleSubmit}>
            <label className="field-label">
              Ticket number
              <input
                className="lottery-input"
                type="number"
                min="1"
                max="1000"
                inputMode="numeric"
                value={ticketNumber}
                onChange={(event) => setTicketNumber(event.target.value)}
                placeholder="1-1000"
              />
            </label>

            <label className="field-label">
              Nickname
              <input
                className="lottery-input"
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Optional"
                maxLength={80}
              />
            </label>

            <button className="primary-button" type="submit" disabled={!canSubmit}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              <span>{loading ? 'Generating proof' : 'Buy Ticket'}</span>
            </button>
          </form>
        </div>

        <div className="side-stack">
          <div className="soft-card callout-card">
            <div className="callout-title">
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span>Your number is hidden on-chain</span>
            </div>
            <p>
              The contract receives only `ticket_id`, `lottery_id`, `commit_hash`, and winner status as disclosed ledger fields.
            </p>
          </div>

          {error ? (
            <div className="alert-card alert-error">{error}</div>
          ) : null}

          {proofResult ? (
            <div className="output-card" data-tour="proof-output">
              <ResultRow label="Ticket ID" value={proofResult.ticket_id} />
              <ResultRow label="Commit hash" value={proofResult.commitHash ?? proofResult.commit_hash} />
              <ResultRow label="Proof hash" value={proofResult.proofHash ?? proofResult.proof_hash} />
              <ResultRow label="Private nonce" value={proofResult.nonce} />
              <div className="status-row">
                <span className="status-pill status-blue">mode: {proofResult.mode ?? proofResult.zk_mode}</span>
                <span className="status-pill status-emerald">status: {proofResult.status}</span>
              </div>
              <div className="receipt-actions">
                <button className="secondary-button" type="button" onClick={copyReceipt}>
                  {receiptCopied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  <span>{receiptCopied ? 'Copied' : 'Copy receipt'}</span>
                </button>
                <button className="secondary-button" type="button" onClick={downloadReceipt}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Download receipt</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-card" data-tour="proof-output">
              Proof output will appear here after the ticket is committed.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function formatReceipt(ticket) {
  return [
    'Confidential Lottery Ticket Receipt',
    `Lottery ID: ${ticket.lottery_id}`,
    `Ticket ID: ${ticket.ticket_id}`,
    `Ticket number: ${ticket.ticket_number}`,
    `Private nonce: ${ticket.nonce}`,
    `Commit hash: ${ticket.commitHash ?? ticket.commit_hash}`,
    `Proof hash: ${ticket.proofHash ?? ticket.proof_hash}`,
    `ZK mode: ${ticket.mode ?? ticket.zk_mode}`,
    `Status: ${ticket.status}`,
    '',
    'Keep this receipt private. The ticket number and nonce are needed to submit a winner proof.',
  ].join('\n')
}

function ResultRow({ label, value }) {
  return (
    <div className="result-row">
      <div>{label}</div>
      <div>{value}</div>
    </div>
  )
}

export default BuyTicketView
