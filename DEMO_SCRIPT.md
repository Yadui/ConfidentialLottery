# Confidential Lottery Demo Recording Script

Target length: 4-6 minutes

Audience: hackathon judges, Midnight builders, privacy/ZK reviewers

Recording goal: show a polished end-to-end lottery flow while clearly separating what is already implemented, what runs through Midnight proof tooling, and what remains a demo-mode fallback.

## Pre-Recording Setup

1. Start the app from the project root:

   ```sh
   npm start
   ```

2. Open the frontend:

   ```text
   http://localhost:3006
   ```

3. If the tutorial opens, either use it briefly or click `Skip` before recording the main flow.

4. For a clean judge demo, click `Reset demo`, then `Seed tickets`.

5. Keep these known seeded winner values ready:

   ```text
   Ticket ID: demo-midnight-hackathon-2026-charlie
   Ticket number: 905
   Nonce: 900100905
   Drawn number: 905
   ```

## Recording Script

### 0:00 - 0:25 Opening

On screen: dark hero section and top navigation.

Voiceover:

> This is Confidential Lottery, a privacy-preserving lottery prototype built for Midnight. The idea is simple: players can buy tickets without revealing their selected number, the public can audit commitments and draws, and only the eventual winner needs to reveal a proof that their hidden ticket matches the drawn number.

> The product is framed like an institutional crypto workflow: public commitments, private witnesses, and a clear audit trail.

### 0:25 - 0:55 Architecture Overview

On screen: slowly scroll to the demo controls and proof transparency panel.

Voiceover:

> The app has three moving parts. The React frontend drives the user journey. A FastAPI backend stores tickets, draws, and claims, encrypting private ticket data with Fernet and keeping public state in SQLite. A separate Midnight service runs the Node-only Midnight proof tooling.

> That Midnight service loads the compiled Compact contract, the Compact runtime, the Midnight ledger WASM module, and `zkir-v2`. When available, it uses the compiled prover and verifier material for the `buy_ticket` and `reveal_winner` circuits. If the local environment cannot generate a real proof, the app transparently falls back to mock mode so the demo stays runnable.

### 0:55 - 1:30 Midnight Technical Details

On screen: focus on `ZK transparency` panel.

Voiceover:

> The contract is written in Compact. Its public ledger fields are intentionally minimal: `ticket_id`, `lottery_id`, `commit_hash`, and `is_winner`.

> The private values are the player’s `ticket_number`, a private `nonce`, and later the `drawn_number`. The first circuit, `buy_ticket`, proves the ticket number is in range, from 1 to 1000, while disclosing only the ticket ID, lottery ID, commitment hash, and a pending winner status.

> The second circuit, `reveal_winner`, proves `drawn_number == ticket_number`. It discloses the ticket ID and sets `is_winner` to 1, without exposing other ticket numbers.

> This panel shows the live proof mode, whether the contract compiled, whether there is a deployed contract address, the Midnight network ID, and whether the structured reference string parameters are reachable or cached.

Optional if the panel says `real`:

> In this run, proof generation is using the real local Midnight proof path.

Optional if the panel says `mock`:

> In this run, proof generation is in mock fallback mode. The UI makes that explicit, which is important for judging and for honest demo conditions.

### 1:30 - 2:05 Judge Demo Mode

On screen: click `Reset demo`, then `Seed tickets`.

Voiceover:

> For a hackathon demo, reliability matters. The judge demo controls let me reset the round and seed a known state. This creates four ticket commitments and reveals a draw number of 905, so I can demonstrate the full winner proof path without depending on luck.

> In a normal player flow, users would buy their own ticket and the draw would use backend cryptographic randomness. For production, this randomness source should be replaced with a Midnight-compatible oracle or VRF-backed draw input.

### 2:05 - 2:50 Buy Ticket Flow

On screen: go to `Buy Ticket`, enter a ticket number such as `137`, enter an optional nickname, click `Buy Ticket`.

Voiceover:

> Here is the player flow. A player chooses a number between 1 and 1000. The app generates a private nonce and creates a commitment hash from the ticket number and nonce.

> The public side receives the ticket ID, lottery ID, commitment hash, proof hash, ZK mode, and status. The private ticket number and nonce are encrypted by the backend, and the receipt is shown only to the player.

> The receipt can be copied or downloaded. That matters because the player needs the ticket ID, original number, and nonce later to submit the winner proof.

On screen: click `Copy receipt` or `Download receipt`.

Voiceover:

> This receipt is private. The commitment is public, but the number and nonce should be treated like claim credentials.

### 2:50 - 3:35 Live Draw and Public Audit Trail

On screen: go to `Live Draw`. Show current lottery, commit table, randomness panel, and audit timeline.

Voiceover:

> The live draw page is the public board. Anyone can see ticket commitments and status, but not the hidden ticket numbers.

> The randomness panel is deliberately explicit: today, live draws use Python’s `secrets` module on the backend. The seeded demo pins a known result for recording. A production version should source randomness from an oracle, VRF, or another verifiable Midnight-compatible mechanism.

> Below that is the public audit timeline. It records ticket commitments, draw reveals, and accepted winner proofs as timestamped events. This gives judges and users a clear way to inspect the lifecycle of a lottery round.

### 3:35 - 4:30 Winner Proof Flow

On screen: click `Seed tickets` if not already seeded, then navigate to `Winner Proof`. Confirm fields are prefilled with the seeded winner: ticket ID `demo-midnight-hackathon-2026-charlie`, original number `905`, nonce `900100905`. Click `Reveal Winner Proof`.

Voiceover:

> Now we submit the winner proof. The seeded winning ticket is number 905, and the current draw is also 905. The proof service checks the private inputs and produces a winner proof result.

> The backend then validates the claim against encrypted ticket data, recomputes the commitment, checks that the drawn number matches, and records the claim as the winning ticket.

> The key privacy property is that non-winning tickets do not need to disclose their numbers. Only the winner proves the equality relation needed to claim.

On screen: show result card with proof hash and winner status.

Voiceover:

> The result shows the winning ticket ID, proof hash, and whether this run used real or mock proof mode.

### 4:30 - 5:10 Closing Summary

On screen: return to proof transparency panel or audit timeline.

Voiceover:

> To summarize, Confidential Lottery demonstrates a privacy-preserving draw workflow on top of Midnight concepts: Compact circuits, private witness inputs, disclosed ledger fields, proof generation, and public auditability.

> The current prototype includes a polished user experience, guided onboarding, demo-mode seeding, receipt export, proof transparency, encrypted backend state, and a public audit timeline.

> The next production step is deployment: publish the Compact contract, replace demo randomness with a verifiable randomness source, and connect claims to a deployed Midnight contract address instead of local proof mode.

## Short 90-Second Version

Use this if the submission platform requires a shorter video.

> Confidential Lottery is a privacy-preserving lottery app built around Midnight. Players buy tickets by choosing a hidden number. The public sees only a ticket ID, lottery ID, commitment hash, and status. The number and nonce stay private.

> The Compact contract has two circuits. `buy_ticket` proves a ticket number is valid without revealing it. `reveal_winner` proves the drawn number equals the player’s original hidden number. The app uses a Node Midnight service to load the compiled contract, Compact runtime, ledger WASM, and `zkir-v2` prover material, with an explicit mock fallback when real proof generation is unavailable.

> For judging, I can seed a reliable demo state. This creates four tickets and reveals draw number 905. The winner proof page is prefilled with the known winning ticket, and submitting it records a verified winner claim.

> The app also includes proof transparency, receipt export, a public audit timeline, and a clear randomness note. The result is a demoable, judge-friendly Midnight privacy workflow: public auditability without exposing every player’s ticket number.

## Technical Talking Points

- Compact source: `contract/src/lottery.compact`
- Public ledger fields: `ticket_id`, `lottery_id`, `commit_hash`, `is_winner`
- Private witness inputs: `ticket_number`, `nonce`, `drawn_number`
- Circuits: `buy_ticket`, `reveal_winner`
- Runtime bridge: `midnight-service/index.js`
- Proof dependencies: Compact runtime, ledger WASM, `zkir-v2`, prover/verifier keys, ZKIR files
- Network target: Midnight `preview` by default
- Backend privacy: ticket number and nonce encrypted with Fernet before SQLite persistence
- Demo transparency: UI displays real vs mock proof mode and whether a deployed contract address is configured

## Presenter Notes

- Do not overclaim deployment if `contract_address` is `null`. Say: “compiled and locally proven, not deployed yet.”
- If `ZK mode` says `mock`, say the demo is in fallback mode and point to the transparency panel.
- If `ZK mode` says `real`, say the local Midnight proof path is active.
- Use `Seed tickets` before recording the winner proof flow so the demo lands predictably.
- Mention production randomness honestly: backend `secrets` now, oracle/VRF later.