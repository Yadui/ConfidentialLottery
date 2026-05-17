import { CheckCircle2, CircleDashed, Network, ShieldCheck } from 'lucide-react'

function ProofTransparencyPanel({ midnightStatus }) {
  const serviceUp = Boolean(midnightStatus?.serviceUp)
  const contractCompiled = Boolean(midnightStatus?.contractCompiled)
  const contractAddress = midnightStatus?.contractAddress
  const paramsReady = Boolean(midnightStatus?.paramsS3Reachable || midnightStatus?.paramsCached)
  const zkMode = midnightStatus?.zkMode ?? 'mock'

  const rows = [
    { label: 'ZK mode', value: zkMode, good: zkMode === 'real' },
    { label: 'Service', value: serviceUp ? 'online' : 'mock fallback', good: serviceUp },
    { label: 'Contract', value: contractCompiled ? 'compiled' : 'not compiled', good: contractCompiled },
    { label: 'Deployment', value: contractAddress ? shorten(contractAddress) : 'not deployed', good: Boolean(contractAddress) },
    { label: 'Network', value: midnightStatus?.networkId ?? 'preview', good: true },
    { label: 'SRS params', value: paramsReady ? (midnightStatus?.paramsCached ? 'cached' : 'reachable') : 'unavailable', good: paramsReady },
  ]

  return (
    <section className="transparency-panel" data-tour="proof-transparency">
      <div className="transparency-heading">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        <div>
          <span className="badge-pill">PROOF STATUS</span>
          <h2>ZK transparency</h2>
        </div>
      </div>

      <div className="transparency-grid">
        {rows.map((row) => (
          <div key={row.label} className="transparency-row">
            <div>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            {row.good ? <CheckCircle2 className="h-4 w-4 text-[var(--semantic-up)]" aria-hidden="true" /> : <CircleDashed className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />}
          </div>
        ))}
      </div>

      <div className="proof-server-line">
        <Network className="h-4 w-4" aria-hidden="true" />
        <span>{midnightStatus?.proofServer ?? 'inline proof service'}</span>
      </div>
    </section>
  )
}

function shorten(value) {
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

export default ProofTransparencyPanel