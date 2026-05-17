// Browser layer for Midnight proof generation.
// The browser calls midnight-service because Midnight's SDK uses Node.js WASM modules.

import { API_BASE, DEFAULT_LOTTERY_ID, MIDNIGHT_SERVICE } from './config'

export async function buyTicketProof(_walletApi, ticketData) {
  const { ticket_id, lottery_id, ticket_number, nonce } = ticketData

  try {
    const res = await fetch(`${MIDNIGHT_SERVICE}/buy-ticket-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id, lottery_id, ticket_number, nonce }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      const serviceError = new Error(err.error ?? `Service error ${res.status}`)
      serviceError.status = res.status
      throw serviceError
    }
    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('ZK proof generation timed out (>90s)')
    if (err.status && err.status < 500) throw err
    console.warn('[ConfidentialLottery] Midnight service unreachable, using client mock:', err.message)
  }

  return generateBuyTicketMock(ticketData)
}

export async function revealWinnerProof(_walletApi, revealData) {
  const { ticket_id, drawn_number, ticket_number, nonce } = revealData

  try {
    const res = await fetch(`${MIDNIGHT_SERVICE}/reveal-winner-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id, drawn_number, ticket_number, nonce }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      const serviceError = new Error(err.error ?? `Service error ${res.status}`)
      serviceError.status = res.status
      throw serviceError
    }
    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('ZK proof generation timed out (>90s)')
    if (err.status && err.status < 500) throw err
    console.warn('[ConfidentialLottery] Midnight service unreachable, using client mock:', err.message)
  }

  return generateRevealWinnerMock(revealData)
}

async function generateBuyTicketMock({ ticket_id, lottery_id, ticket_number, nonce }) {
  const ticketNumber = Number(ticket_number)
  if (!Number.isInteger(ticketNumber) || ticketNumber <= 0 || ticketNumber > 1000) {
    throw new Error('ticket_number must be between 1 and 1000')
  }
  const commitHash = await sha256(`${ticketNumber}${nonce}`)
  const proofHash = await sha256(`${ticket_id}${lottery_id}${commitHash}MIDNIGHT_ZK`)
  return { proofHash, commitHash, contractAddress: null, txHash: null, mode: 'mock' }
}

async function generateRevealWinnerMock({ ticket_id, drawn_number, ticket_number, nonce }) {
  const drawnNumber = Number(drawn_number)
  const ticketNumber = Number(ticket_number)
  if (drawnNumber !== ticketNumber) throw new Error('ticket does not match draw')
  const proofHash = await sha256(`${ticket_id}${drawnNumber}${ticketNumber}${nonce}WINNER_ZK`)
  return { proofHash, isWinner: 1, contractAddress: null, txHash: null, mode: 'mock' }
}

export async function checkMidnightService() {
  try {
    const res = await fetch(`${MIDNIGHT_SERVICE}/health`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { serviceUp: false, proofServerUp: false, zkMode: 'mock' }
    const data = await res.json()
    return {
      serviceUp: true,
      proofServerUp: data.zk_mode === 'real',
      contractCompiled: data.contract_compiled,
      networkId: data.network_id,
      zkMode: data.zk_mode ?? 'mock',
      contractAddress: data.contract_address ?? null,
      paramsS3Reachable: Boolean(data.params_s3_reachable),
      paramsCached: Boolean(data.params_cached),
      proofServer: data.proof_server ?? 'unknown',
    }
  } catch {
    return { serviceUp: false, proofServerUp: false, zkMode: 'mock' }
  }
}

export async function resetDemo(lotteryId = DEFAULT_LOTTERY_ID) {
  const res = await fetch(`${API_BASE}/api/demo/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lottery_id: lotteryId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Unable to reset demo')
  }
  return res.json()
}

export async function seedDemo(lotteryId = DEFAULT_LOTTERY_ID) {
  const res = await fetch(`${API_BASE}/api/demo/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lottery_id: lotteryId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Unable to seed demo')
  }
  return res.json()
}

export async function getAuditTimeline(lotteryId = DEFAULT_LOTTERY_ID) {
  const res = await fetch(`${API_BASE}/api/audit/timeline?lottery_id=${encodeURIComponent(lotteryId)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Unable to load audit timeline')
  }
  return res.json()
}

export function generateNonce() {
  const words = new BigUint64Array(1)
  crypto.getRandomValues(words)
  return words[0].toString()
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Round management API
// ---------------------------------------------------------------------------

export async function getRounds() {
  const res = await fetch(`${API_BASE}/api/rounds`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Unable to load rounds')
  }
  return res.json()
}

export async function getCurrentRound() {
  const res = await fetch(`${API_BASE}/api/rounds/current`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Unable to load current round')
  }
  return res.json()
}

export async function createRound(data) {
  const res = await fetch(`${API_BASE}/api/rounds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Unable to create round')
  }
  return res.json()
}

export async function lockRound(lotteryId) {
  const res = await fetch(`${API_BASE}/api/rounds/${encodeURIComponent(lotteryId)}/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Unable to lock round')
  }
  return res.json()
}

export async function archiveRound(lotteryId) {
  const res = await fetch(`${API_BASE}/api/rounds/${encodeURIComponent(lotteryId)}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? 'Unable to archive round')
  }
  return res.json()
}
