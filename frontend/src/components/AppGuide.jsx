import { BookOpen, CheckCircle2, Layers3, LockKeyhole, Rocket, X, Zap } from 'lucide-react'

const guideSections = [
  {
    icon: BookOpen,
    label: 'WHAT',
    title: 'What the app is',
    body: 'Confidential Lottery is a privacy-preserving lottery workflow. Players commit hidden ticket numbers, operators run a public draw, and the winner proves their private number matches the draw without exposing every other ticket.',
    bullets: [
      'Buy Ticket creates a public commitment and private receipt.',
      'Live Draw shows commitments, draw state, randomness notes, and audit events.',
      'Winner Proof verifies the winning claim from the original ticket data and nonce.',
    ],
  },
  {
    icon: LockKeyhole,
    label: 'WHY',
    title: 'Why it matters',
    body: 'Most lottery demos force users to trust the operator or reveal their pick. This app keeps the player number private while preserving an auditable public trail for commitments, draws, and claims.',
    bullets: [
      'Players keep their number and nonce private until a claim is needed.',
      'Observers can audit public commitments and winner status.',
      'Judges can see real/mock proof status instead of guessing what is running.',
    ],
  },
  {
    icon: Zap,
    label: 'HOW',
    title: 'How to demo it',
    body: 'Use the judge demo controls for a predictable run. Reset the round, seed tickets, then submit the prefilled winner proof for ticket number 905.',
    bullets: [
      'Click Reset demo, then Seed tickets.',
      'Seeded winner: demo-midnight-hackathon-2026-charlie, number 905, nonce 900100905.',
      'Use Buy Ticket for a manual receipt flow, or Winner Proof for the seeded claim flow.',
    ],
  },
  {
    icon: Layers3,
    label: 'MIDNIGHT',
    title: 'Midnight technical path',
    body: 'The Compact contract exposes minimal ledger state and keeps ticket values as private witnesses. The Node Midnight service loads the compiled contract, Compact runtime, ledger WASM, zkir-v2, and prover material.',
    bullets: [
      'Public ledger fields: ticket_id, lottery_id, commit_hash, is_winner.',
      'Private witness inputs: ticket_number, nonce, drawn_number.',
      'Circuits: buy_ticket proves valid range; reveal_winner proves drawn_number equals ticket_number.',
    ],
  },
  {
    icon: CheckCircle2,
    label: 'VERIFY',
    title: 'What to inspect',
    body: 'Use the ZK transparency panel and audit timeline to explain what happened during the run and whether proof generation is real or fallback.',
    bullets: [
      'ZK transparency shows mode, service, contract compilation, deployment, network, and SRS params.',
      'Receipt export preserves the private claim data for the player.',
      'Audit timeline records ticket commits, draw reveals, and accepted winner proofs.',
    ],
  },
  {
    icon: Rocket,
    label: 'NEXT',
    title: 'Future plans',
    body: 'The prototype is strong for a hackathon demo. The production path is about deployment, verifiable randomness, wallet integration, and stronger operational boundaries.',
    bullets: [
      'Deploy the Compact contract and surface the live contract address.',
      'Replace backend draw randomness with oracle or VRF-backed randomness.',
      'Add wallet signing, round management, multi-lottery support, and permanent proof receipts.',
    ],
  },
]

function AppGuide({ open, onClose }) {
  if (!open) return null

  return (
    <div className="app-guide-layer" role="dialog" aria-modal="true" aria-labelledby="app-guide-title">
      <button className="app-guide-backdrop" type="button" aria-label="Close app guide" onClick={onClose} />

      <section className="app-guide-panel">
        <div className="app-guide-header">
          <div>
            <span className="badge-pill">APP GUIDE</span>
            <h2 id="app-guide-title">Confidential Lottery guide</h2>
            <p>
              A complete guide to what the app does, why the privacy model matters, how to run the demo, and where the Midnight integration goes next.
            </p>
          </div>
          <button className="icon-button guide-close-button" type="button" aria-label="Close app guide" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="app-guide-summary">
          <div>
            <span>Demo round</span>
            <strong>midnight-hackathon-2026</strong>
          </div>
          <div>
            <span>Seeded draw</span>
            <strong>905</strong>
          </div>
          <div>
            <span>Core privacy promise</span>
            <strong>commit first, reveal only winner proof</strong>
          </div>
        </div>

        <div className="app-guide-grid">
          {guideSections.map(({ icon: Icon, label, title, body, bullets }) => (
            <article className="app-guide-card" key={title}>
              <div className="app-guide-card-heading">
                <span className="app-guide-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="badge-pill">{label}</span>
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
              <ul>
                {bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default AppGuide