// Confidential Lottery Midnight Service
// Node.js bridge between the React frontend and Midnight's Node-only ZK SDK.

import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '..')

function _loadLocalEnv() {
  try {
    const envPath = resolve(__dir, '.env')
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    // no local .env is fine
  }
}
_loadLocalEnv()

function _loadContractAddress() {
  if (process.env.CONTRACT_ADDRESS) return process.env.CONTRACT_ADDRESS
  const addrFile = resolve(ROOT, 'contract', 'deployed-address.json')
  if (!existsSync(addrFile)) return null
  try {
    const data = JSON.parse(readFileSync(addrFile, 'utf8'))
    const env = process.env.MIDNIGHT_ENV ?? 'preview'
    return data[env]?.contractAddress ?? null
  } catch {
    return null
  }
}
let _contractAddress = _loadContractAddress()

let _zkReady = null
let _zkDeps = null
const _paramsCache = new Map()

const MIDNIGHT_ENV = process.env.MIDNIGHT_ENV ?? 'preview'
const NETWORK_CONFIGS = {
  preview: {
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
    node: 'wss://rpc.preview.midnight.network',
    proofServer: process.env.PROOF_SERVER_URL ?? 'http://localhost:6301',
  },
  preprod: {
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
    node: 'wss://rpc.preprod.midnight.network',
    proofServer: process.env.PROOF_SERVER_URL ?? 'http://localhost:6301',
  },
}
const netConfig = NETWORK_CONFIGS[MIDNIGHT_ENV] ?? NETWORK_CONFIGS.preview

async function _makeKmProvider(keyMaterial) {
  return {
    lookupKey: async () => ({
      proverKey: new Uint8Array(keyMaterial.proverKey),
      verifierKey: new Uint8Array(keyMaterial.verifierKey),
      ir: new Uint8Array(keyMaterial.ir),
    }),
    getParams: async (k) => {
      if (_paramsCache.has(k)) return _paramsCache.get(k)
      const S3 = 'https://midnight-s3-fileshare-dev-eu-west-1.s3.eu-west-1.amazonaws.com'
      console.log(`[ZK] Fetching SRS params k=${k} from S3...`)
      const resp = await fetch(`${S3}/bls_midnight_2p${k}`, { signal: AbortSignal.timeout(30000) })
      if (!resp.ok) throw new Error(`S3 params fetch failed: ${resp.status}`)
      const buf = new Uint8Array(await resp.arrayBuffer())
      console.log(`[ZK] Cached SRS params k=${k} (${buf.length} bytes)`)
      _paramsCache.set(k, buf)
      return buf
    },
  }
}

async function loadZKDeps() {
  if (_zkReady !== null) return _zkReady
  try {
    const contractIndex = resolve(ROOT, 'contract/dist/lottery/contract/index.js')
    if (!existsSync(contractIndex)) {
      throw new Error('contract/dist/lottery is missing; run npm run compile:contract')
    }

    const [runtimeMod, ledgerMod, contractMod, zkirMod, networkMod] = await Promise.all([
      import(resolve(ROOT, 'node_modules/@midnight-ntwrk/compact-runtime/dist/index.js')),
      import(resolve(__dir, 'node_modules/@midnight-ntwrk/ledger-v8/midnight_ledger_wasm_fs.js')),
      import(contractIndex),
      import(resolve(__dir, 'node_modules/@midnight-ntwrk/zkir-v2/midnight_zkir_wasm_fs.js')),
      import('@midnight-ntwrk/midnight-js-network-id'),
    ])

    networkMod.setNetworkId(netConfig.networkId)

    const KEYS = resolve(ROOT, 'contract/dist/lottery/keys')
    const ZKIR = resolve(ROOT, 'contract/dist/lottery/zkir')
    const Contract = contractMod.Contract ?? contractMod.default?.Contract
    if (!Contract) throw new Error('compiled contract module did not export Contract')

    _zkDeps = {
      runtime: runtimeMod,
      ledger: ledgerMod,
      zkir: zkirMod,
      Contract,
      buyTicketKeyMaterial: {
        proverKey: readFileSync(resolve(KEYS, 'buy_ticket.prover')),
        verifierKey: readFileSync(resolve(KEYS, 'buy_ticket.verifier')),
        ir: readFileSync(resolve(ZKIR, 'buy_ticket.bzkir')),
      },
      revealWinnerKeyMaterial: {
        proverKey: readFileSync(resolve(KEYS, 'reveal_winner.prover')),
        verifierKey: readFileSync(resolve(KEYS, 'reveal_winner.verifier')),
        ir: readFileSync(resolve(ZKIR, 'reveal_winner.bzkir')),
      },
    }
    console.log(
      '[ZK] Proof dependencies loaded - buy_ticket prover:',
      _zkDeps.buyTicketKeyMaterial.proverKey.length,
      'bytes, reveal_winner prover:',
      _zkDeps.revealWinnerKeyMaterial.proverKey.length,
      'bytes',
    )
    _zkReady = true
  } catch (err) {
    console.warn('[ZK] Failed to load proof dependencies:', err.message)
    _zkReady = false
  }
  return _zkReady
}

const app = express()
const _MS_ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3006,http://127.0.0.1:3006,http://localhost:5173,http://127.0.0.1:5173').split(',')
app.use(cors({ origin: _MS_ALLOWED_ORIGINS }))
app.use(express.json({ limit: '1mb' }))

function _ticketCommitHash(ticketNumber, nonce) {
  return crypto.createHash('sha256').update(`${ticketNumber}${nonce}`).digest('hex')
}

function _parseTicketNumber(value, fieldName) {
  const number = Number(value)
  if (!Number.isInteger(number)) throw new Error(`${fieldName} must be an integer`)
  if (number <= 0) throw new Error(`${fieldName} must be > 0`)
  if (number > 1000) throw new Error(`${fieldName} must be <= 1000`)
  return number
}

function _parseUint64(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${fieldName} is required`)
  }
  try {
    const n = BigInt(String(value))
    if (n < 0n || n > 18446744073709551615n) {
      throw new Error(`${fieldName} must fit Uint<64>`)
    }
    return n
  } catch (err) {
    if (err.message.includes('Uint<64>')) throw err
    throw new Error(`${fieldName} must be a Uint<64> value`)
  }
}

function _newCircuitContext(runtime, Contract) {
  const dummyCoinPubKey = { bytes: new Uint8Array(32) }
  const addr = runtime.sampleContractAddress()
  const contract = new Contract({})
  const { currentContractState } = contract.initialState({
    initialZswapLocalState: { coinPublicKey: dummyCoinPubKey },
    initialPrivateState: {},
  })
  const ctx = runtime.createCircuitContext(
    addr,
    dummyCoinPubKey,
    currentContractState.data,
    {},
  )
  return { contract, ctx }
}

function _proofDataToPreimage(ledger, proofData) {
  if (ledger.proofDataIntoSerializedPreimage) {
    return ledger.proofDataIntoSerializedPreimage(
      proofData.input,
      proofData.output,
      proofData.publicTranscript,
      proofData.privateTranscriptOutputs,
      null,
    )
  }
  return ledger.serializeProofData(proofData)
}

async function _runProof(circuitName, circuitArgs, keyMaterial) {
  const { runtime, ledger, zkir, Contract } = _zkDeps
  const { contract, ctx } = _newCircuitContext(runtime, Contract)
  const { proofData } = contract.circuits[circuitName](ctx, ...circuitArgs)
  const preimage = _proofDataToPreimage(ledger, proofData)
  const kmProvider = await _makeKmProvider(keyMaterial)
  const t0 = Date.now()
  const proofBytes = await zkir.prove(preimage, kmProvider)
  const ms = Date.now() - t0
  const proofHash = crypto.createHash('sha256').update(proofBytes).digest('hex')
  return { proofHash, proofBytes, ms }
}

app.get('/health', async (_req, res) => {
  const zkReady = await loadZKDeps()
  let paramsReachable = false
  try {
    const r = await fetch('https://midnight-s3-fileshare-dev-eu-west-1.s3.eu-west-1.amazonaws.com/bls_midnight_2p9', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    })
    paramsReachable = r.ok
  } catch {
    // offline is fine; cached params or mock mode can still be used
  }

  const paramsCached = _paramsCache.has(9)
  res.json({
    status: 'ok',
    midnight_env: MIDNIGHT_ENV,
    network_id: netConfig.networkId,
    contract_compiled: zkReady,
    contract_address: _contractAddress ?? null,
    params_s3_reachable: paramsReachable,
    params_cached: paramsCached,
    zk_mode: zkReady && (paramsCached || paramsReachable) ? 'real' : 'mock',
    proof_server: 'inline (zkir-v2 + S3 params)',
  })
})

app.post('/buy-ticket-proof', async (req, res) => {
  const { ticket_id, lottery_id, ticket_number, nonce, commit_hash } = req.body

  if (!ticket_id || !lottery_id) {
    return res.status(400).json({ error: 'ticket_id and lottery_id are required' })
  }

  let ticketNumber
  let nonceBig
  try {
    ticketNumber = _parseTicketNumber(ticket_number, 'ticket_number')
    nonceBig = _parseUint64(nonce, 'nonce')
  } catch (err) {
    return res.status(422).json({ error: err.message })
  }

  const commitHash = _ticketCommitHash(ticketNumber, String(nonce))
  if (commit_hash && commit_hash !== commitHash) {
    return res.status(422).json({ error: 'commit_hash does not match ticket_number and nonce' })
  }

  const zkReady = await loadZKDeps()
  if (zkReady) {
    try {
      const { proofHash, proofBytes, ms } = await _runProof(
        'buy_ticket',
        [ticket_id, lottery_id, commitHash, BigInt(ticketNumber), nonceBig],
        _zkDeps.buyTicketKeyMaterial,
      )

      console.log(`[ZK] buy_ticket proof generated (${proofBytes.length} bytes, ${ms}ms) ticket=${ticket_id}`)
      return res.json({
        proofHash,
        commitHash,
        contractAddress: _contractAddress ?? null,
        txHash: null,
        mode: 'real',
        proofBytes: Buffer.from(proofBytes).toString('base64'),
        proofSizeBytes: proofBytes.length,
        proofGeneratedMs: ms,
      })
    } catch (err) {
      console.warn('[ZK] buy_ticket proof failed, falling back to mock:', err.message)
    }
  }

  const raw = `${ticket_id}${lottery_id}${commitHash}MIDNIGHT_ZK`
  const proofHash = crypto.createHash('sha256').update(raw).digest('hex')
  return res.json({ proofHash, commitHash, contractAddress: null, txHash: null, mode: 'mock' })
})

app.post('/reveal-winner-proof', async (req, res) => {
  const { ticket_id, drawn_number, ticket_number, nonce } = req.body

  if (!ticket_id) {
    return res.status(400).json({ error: 'ticket_id is required' })
  }

  let drawnNumber
  let ticketNumber
  let nonceBig
  try {
    drawnNumber = _parseTicketNumber(drawn_number, 'drawn_number')
    ticketNumber = _parseTicketNumber(ticket_number, 'ticket_number')
    nonceBig = _parseUint64(nonce, 'nonce')
  } catch (err) {
    return res.status(422).json({ error: err.message })
  }

  if (drawnNumber !== ticketNumber) {
    return res.status(422).json({ error: 'ticket does not match draw', isWinner: 0 })
  }

  const zkReady = await loadZKDeps()
  if (zkReady) {
    try {
      const { proofHash, proofBytes, ms } = await _runProof(
        'reveal_winner',
        [ticket_id, BigInt(drawnNumber), BigInt(ticketNumber), nonceBig],
        _zkDeps.revealWinnerKeyMaterial,
      )

      console.log(`[ZK] reveal_winner proof generated (${proofBytes.length} bytes, ${ms}ms) ticket=${ticket_id}`)
      return res.json({
        proofHash,
        isWinner: 1,
        contractAddress: _contractAddress ?? null,
        txHash: null,
        mode: 'real',
        proofBytes: Buffer.from(proofBytes).toString('base64'),
        proofSizeBytes: proofBytes.length,
        proofGeneratedMs: ms,
      })
    } catch (err) {
      console.warn('[ZK] reveal_winner proof failed, falling back to mock:', err.message)
    }
  }

  const raw = `${ticket_id}${drawnNumber}${ticketNumber}${nonce}WINNER_ZK`
  const proofHash = crypto.createHash('sha256').update(raw).digest('hex')
  return res.json({ proofHash, isWinner: 1, contractAddress: null, txHash: null, mode: 'mock' })
})

app.get('/contract-address', (_req, res) => {
  _contractAddress = _loadContractAddress()
  if (!_contractAddress) {
    return res.status(404).json({
      error: 'Contract not deployed yet. Run: npm run compile:contract and deploy with your Midnight tooling.',
      network: MIDNIGHT_ENV,
    })
  }
  res.json({ contractAddress: _contractAddress, network: MIDNIGHT_ENV, networkId: netConfig.networkId })
})

app.get('/proof-server-status', (_req, res) => {
  res.json({ reachable: true, inline: true, params_cached: _paramsCache.has(9) })
})

const PORT = process.env.PORT ?? 3007
app.listen(PORT, () => {
  const addr = _contractAddress ? `  contract: ${_contractAddress}` : '  contract: (not deployed)'
  console.log(`[ConfidentialLottery] Midnight service running on http://localhost:${PORT}`)
  console.log(`[ConfidentialLottery] Network: ${MIDNIGHT_ENV} (${netConfig.networkId})`)
  console.log('[ConfidentialLottery] ZK proofs: inline via zkir-v2 with mock fallback')
  console.log(addr)
})
