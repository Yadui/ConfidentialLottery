import hashlib
import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).parent / ".env")

app = FastAPI(title="Confidential Lottery API")

_ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3006,http://127.0.0.1:3006,http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

DB_FILE = Path(__file__).parent / "lottery.db"
_ENV_FILE = Path(__file__).parent / ".env"
DEFAULT_LOTTERY_ID = os.getenv("LOTTERY_ID", "midnight-hackathon-2026")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_or_create_fernet() -> Fernet:
    key = os.getenv("LOTTERY_ENCRYPTION_KEY", "")
    if key:
        return Fernet(key.encode())

    new_key = Fernet.generate_key().decode()
    existing = _ENV_FILE.read_text() if _ENV_FILE.exists() else ""
    lines = [ln for ln in existing.splitlines() if not ln.startswith("LOTTERY_ENCRYPTION_KEY=")]
    lines.append(f"LOTTERY_ENCRYPTION_KEY={new_key}")
    _ENV_FILE.write_text("\n".join(lines) + "\n")
    os.environ["LOTTERY_ENCRYPTION_KEY"] = new_key
    print("Generated LOTTERY_ENCRYPTION_KEY and saved it to backend/.env")
    return Fernet(new_key.encode())


_fernet = _get_or_create_fernet()


def _enc(value: str) -> bytes:
    return _fernet.encrypt(value.encode())


def _dec(blob: bytes) -> str:
    return _fernet.decrypt(blob).decode()


def _ticket_commit_hash(ticket_number: int, nonce: str) -> str:
    return hashlib.sha256(f"{ticket_number}{nonce}".encode()).hexdigest()


def _db_init() -> None:
    with sqlite3.connect(DB_FILE) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS tickets (
                ticket_id         TEXT PRIMARY KEY,
                lottery_id        TEXT NOT NULL,
                commit_hash       TEXT NOT NULL,
                ticket_number_enc BLOB NOT NULL,
                nonce_enc         BLOB NOT NULL,
                nickname_enc      BLOB,
                status            TEXT NOT NULL DEFAULT 'pending',
                proof_hash        TEXT,
                zk_mode           TEXT DEFAULT 'mock',
                created_at        TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS draws (
                draw_id           TEXT PRIMARY KEY,
                lottery_id        TEXT NOT NULL,
                drawn_number_enc  BLOB NOT NULL,
                status            TEXT NOT NULL,
                created_at        TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS claims (
                claim_id          TEXT PRIMARY KEY,
                ticket_id         TEXT UNIQUE NOT NULL,
                lottery_id        TEXT NOT NULL,
                proof_hash        TEXT NOT NULL,
                zk_mode           TEXT DEFAULT 'mock',
                is_winner         INTEGER NOT NULL,
                claimed_at        TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rounds (
                lottery_id   TEXT PRIMARY KEY,
                name         TEXT NOT NULL,
                ticket_min   INTEGER NOT NULL DEFAULT 1,
                ticket_max   INTEGER NOT NULL DEFAULT 1000,
                status       TEXT NOT NULL DEFAULT 'open',
                created_at   TEXT NOT NULL,
                locked_at    TEXT,
                archived_at  TEXT
            );
            """
        )
    with sqlite3.connect(DB_FILE) as conn:
        if not conn.execute(
            "SELECT 1 FROM rounds WHERE lottery_id = ?", (DEFAULT_LOTTERY_ID,)
        ).fetchone():
            conn.execute(
                "INSERT INTO rounds (lottery_id, name, ticket_min, ticket_max, status, created_at) VALUES (?,?,?,?,?,?)",
                (DEFAULT_LOTTERY_ID, "Hackathon 2026", 1, 1000, "open", _now_iso()),
            )


def _row_to_public_ticket(row: sqlite3.Row) -> dict:
    return {
        "ticket_id": row["ticket_id"],
        "lottery_id": row["lottery_id"],
        "commit_hash": row["commit_hash"],
        "status": row["status"],
        "proof_hash": row["proof_hash"],
        "zk_mode": row["zk_mode"],
        "created_at": row["created_at"],
    }


def _get_ticket(ticket_id: str) -> Optional[sqlite3.Row]:
    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT * FROM tickets WHERE ticket_id = ?",
            (ticket_id,),
        ).fetchone()


def _get_current_draw(lottery_id: Optional[str] = None) -> Optional[sqlite3.Row]:
    lottery = lottery_id or DEFAULT_LOTTERY_ID
    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            """
            SELECT * FROM draws
            WHERE lottery_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (lottery,),
        ).fetchone()


def _ticket_count(lottery_id: str) -> int:
    with sqlite3.connect(DB_FILE) as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM tickets WHERE lottery_id = ?",
            (lottery_id,),
        ).fetchone()[0]


def _get_round(lottery_id: str) -> Optional[sqlite3.Row]:
    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            "SELECT * FROM rounds WHERE lottery_id = ?",
            (lottery_id,),
        ).fetchone()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
    return f"{slug}-{secrets.token_hex(3)}" if slug else f"round-{secrets.token_hex(4)}"


_db_init()


class TicketRequest(BaseModel):
    ticket_id: Optional[str] = None
    lottery_id: str = Field(default=DEFAULT_LOTTERY_ID, min_length=1)
    ticket_number: int = Field(gt=0, le=1000)
    nonce: str = Field(min_length=1)
    nickname: Optional[str] = Field(default=None, max_length=80)
    commit_hash: Optional[str] = Field(default=None, min_length=64, max_length=64)
    proof_hash: Optional[str] = None
    zk_mode: Optional[str] = "mock"


class DrawRequest(BaseModel):
    lottery_id: str = Field(default=DEFAULT_LOTTERY_ID, min_length=1)
    drawn_number: Optional[int] = Field(default=None, gt=0, le=1000)


class ClaimRequest(BaseModel):
    ticket_id: str = Field(min_length=1)
    ticket_number: int = Field(gt=0, le=1000)
    nonce: str = Field(min_length=1)
    proof_hash: str = Field(min_length=16)
    is_winner: int = Field(ge=0, le=1)
    drawn_number: Optional[int] = Field(default=None, gt=0, le=1000)
    zk_mode: Optional[str] = "mock"


class RoundCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    lottery_id: Optional[str] = Field(default=None, min_length=1, max_length=80)
    ticket_min: int = Field(default=1, ge=1, le=1000)
    ticket_max: int = Field(default=1000, ge=1, le=1000)


class DemoRequest(BaseModel):
    lottery_id: str = Field(default=DEFAULT_LOTTERY_ID, min_length=1)


def _reset_lottery(lottery_id: str) -> dict:
    with sqlite3.connect(DB_FILE) as conn:
        deleted_claims = conn.execute(
            "DELETE FROM claims WHERE lottery_id = ?",
            (lottery_id,),
        ).rowcount
        deleted_draws = conn.execute(
            "DELETE FROM draws WHERE lottery_id = ?",
            (lottery_id,),
        ).rowcount
        deleted_tickets = conn.execute(
            "DELETE FROM tickets WHERE lottery_id = ?",
            (lottery_id,),
        ).rowcount

    return {
        "tickets": deleted_tickets,
        "draws": deleted_draws,
        "claims": deleted_claims,
    }


def _demo_tickets(lottery_id: str) -> list[dict]:
    return [
        {
            "ticket_id": f"demo-{lottery_id}-alpha",
            "lottery_id": lottery_id,
            "ticket_number": 137,
            "nonce": "900100137",
            "nickname": "Alpha desk",
        },
        {
            "ticket_id": f"demo-{lottery_id}-bravo",
            "lottery_id": lottery_id,
            "ticket_number": 512,
            "nonce": "900100512",
            "nickname": "Bravo desk",
        },
        {
            "ticket_id": f"demo-{lottery_id}-charlie",
            "lottery_id": lottery_id,
            "ticket_number": 905,
            "nonce": "900100905",
            "nickname": "Charlie desk",
        },
        {
            "ticket_id": f"demo-{lottery_id}-delta",
            "lottery_id": lottery_id,
            "ticket_number": 288,
            "nonce": "900100288",
            "nickname": "Delta desk",
        },
    ]


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "backend", "lottery_id": DEFAULT_LOTTERY_ID}


@app.post("/api/demo/reset")
async def reset_demo(demo: DemoRequest):
    deleted = _reset_lottery(demo.lottery_id)
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            "UPDATE rounds SET status = 'open', locked_at = NULL WHERE lottery_id = ? AND status != 'archived'",
            (demo.lottery_id,),
        )
    return {
        "status": "reset",
        "lottery_id": demo.lottery_id,
        "deleted": deleted,
    }


@app.post("/api/demo/seed")
async def seed_demo(demo: DemoRequest):
    _reset_lottery(demo.lottery_id)
    seed_tickets = _demo_tickets(demo.lottery_id)
    winner_ticket = seed_tickets[2]

    public_tickets = []
    with sqlite3.connect(DB_FILE) as conn:
        for ticket in seed_tickets:
            commit_hash = _ticket_commit_hash(ticket["ticket_number"], ticket["nonce"])
            proof_hash = hashlib.sha256(
                f"{ticket['ticket_id']}{ticket['lottery_id']}{commit_hash}DEMO_BUY_TICKET".encode()
            ).hexdigest()
            created_at = _now_iso()
            conn.execute(
                """
                INSERT INTO tickets (
                    ticket_id, lottery_id, commit_hash, ticket_number_enc,
                    nonce_enc, nickname_enc, status, proof_hash, zk_mode, created_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    ticket["ticket_id"],
                    ticket["lottery_id"],
                    commit_hash,
                    _enc(str(ticket["ticket_number"])),
                    _enc(ticket["nonce"]),
                    _enc(ticket["nickname"]),
                    "pending",
                    proof_hash,
                    "mock",
                    created_at,
                ),
            )
            public_tickets.append(
                {
                    **ticket,
                    "commit_hash": commit_hash,
                    "proof_hash": proof_hash,
                    "zk_mode": "mock",
                    "status": "pending",
                    "created_at": created_at,
                }
            )

        draw_id = str(uuid.uuid4())
        draw_created_at = _now_iso()
        conn.execute(
            """
            INSERT INTO draws (draw_id, lottery_id, drawn_number_enc, status, created_at)
            VALUES (?,?,?,?,?)
            """,
            (
                draw_id,
                demo.lottery_id,
                _enc(str(winner_ticket["ticket_number"])),
                "revealed",
                draw_created_at,
            ),
        )
        conn.execute(
            "UPDATE rounds SET status = 'revealed' WHERE lottery_id = ? AND status IN ('open', 'locked')",
            (demo.lottery_id,),
        )

    return {
        "status": "seeded",
        "lottery_id": demo.lottery_id,
        "tickets": public_tickets,
        "winner_candidate": public_tickets[2],
        "draw": {
            "draw_id": draw_id,
            "lottery_id": demo.lottery_id,
            "status": "revealed",
            "drawn_number": winner_ticket["ticket_number"],
            "created_at": draw_created_at,
        },
    }


@app.get("/api/audit/timeline")
async def audit_timeline(lottery_id: Optional[str] = None):
    lottery = lottery_id or DEFAULT_LOTTERY_ID
    events = []

    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        tickets = conn.execute(
            """
            SELECT ticket_id, lottery_id, commit_hash, status, proof_hash, zk_mode, created_at
            FROM tickets
            WHERE lottery_id = ?
            """,
            (lottery,),
        ).fetchall()
        draws = conn.execute(
            """
            SELECT draw_id, lottery_id, status, created_at
            FROM draws
            WHERE lottery_id = ?
            """,
            (lottery,),
        ).fetchall()
        claims = conn.execute(
            """
            SELECT claim_id, ticket_id, lottery_id, proof_hash, zk_mode, is_winner, claimed_at
            FROM claims
            WHERE lottery_id = ?
            """,
            (lottery,),
        ).fetchall()

    for ticket in tickets:
        events.append(
            {
                "id": f"ticket:{ticket['ticket_id']}",
                "type": "ticket",
                "title": "Ticket committed",
                "description": "Public commitment accepted; private ticket data remains encrypted.",
                "timestamp": ticket["created_at"],
                "status": ticket["status"],
                "ticket_id": ticket["ticket_id"],
                "proof_hash": ticket["proof_hash"],
                "commit_hash": ticket["commit_hash"],
                "zk_mode": ticket["zk_mode"],
            }
        )

    for draw in draws:
        events.append(
            {
                "id": f"draw:{draw['draw_id']}",
                "type": "draw",
                "title": "Draw revealed",
                "description": "The selected number was sealed in encrypted backend state and published to the draw board.",
                "timestamp": draw["created_at"],
                "status": draw["status"],
                "draw_id": draw["draw_id"],
            }
        )

    for claim in claims:
        events.append(
            {
                "id": f"claim:{claim['claim_id']}",
                "type": "claim",
                "title": "Winner proof accepted",
                "description": "A submitted proof matched the private ticket data to the current draw.",
                "timestamp": claim["claimed_at"],
                "status": "winner" if claim["is_winner"] else "rejected",
                "ticket_id": claim["ticket_id"],
                "proof_hash": claim["proof_hash"],
                "zk_mode": claim["zk_mode"],
            }
        )

    events.sort(key=lambda event: event["timestamp"], reverse=True)
    return {"lottery_id": lottery, "events": events}


@app.post("/api/tickets")
async def submit_ticket(ticket: TicketRequest):
    round_row = _get_round(ticket.lottery_id)
    if round_row and round_row["status"] != "open":
        raise HTTPException(
            status_code=409,
            detail=f"round '{ticket.lottery_id}' is {round_row['status']} — ticket sales are closed",
        )
    ticket_id = ticket.ticket_id or str(uuid.uuid4())
    commit_hash = _ticket_commit_hash(ticket.ticket_number, ticket.nonce)
    if ticket.commit_hash and ticket.commit_hash != commit_hash:
        raise HTTPException(status_code=422, detail="commit_hash does not match ticket_number and nonce")

    created_at = _now_iso()
    nickname_blob = _enc(ticket.nickname) if ticket.nickname else None

    with sqlite3.connect(DB_FILE) as conn:
        try:
            conn.execute(
                """
                INSERT INTO tickets (
                    ticket_id, lottery_id, commit_hash, ticket_number_enc,
                    nonce_enc, nickname_enc, status, proof_hash, zk_mode, created_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    ticket_id,
                    ticket.lottery_id,
                    commit_hash,
                    _enc(str(ticket.ticket_number)),
                    _enc(ticket.nonce),
                    nickname_blob,
                    "pending",
                    ticket.proof_hash,
                    ticket.zk_mode or "mock",
                    created_at,
                ),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="ticket_id already exists")

    return {
        "ticket_id": ticket_id,
        "lottery_id": ticket.lottery_id,
        "commit_hash": commit_hash,
        "status": "pending",
        "proof_hash": ticket.proof_hash,
        "zk_mode": ticket.zk_mode or "mock",
        "created_at": created_at,
    }


@app.get("/api/tickets")
async def list_tickets(lottery_id: Optional[str] = None):
    query = "SELECT * FROM tickets"
    params: tuple = ()
    if lottery_id:
        query += " WHERE lottery_id = ?"
        params = (lottery_id,)
    query += " ORDER BY created_at DESC"

    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(query, params).fetchall()

    return {"tickets": [_row_to_public_ticket(row) for row in rows]}


@app.post("/api/draw")
async def run_draw(draw: DrawRequest):
    if _ticket_count(draw.lottery_id) == 0:
        raise HTTPException(
            status_code=409,
            detail="no tickets in this round — buy at least one ticket before drawing",
        )
    round_row = _get_round(draw.lottery_id)
    if round_row and round_row["status"] in ("revealed", "claimed", "archived"):
        raise HTTPException(
            status_code=409,
            detail=f"round is already {round_row['status']}",
        )

    drawn_number = draw.drawn_number or (secrets.randbelow(1000) + 1)
    draw_id = str(uuid.uuid4())
    created_at = _now_iso()

    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            """
            INSERT INTO draws (draw_id, lottery_id, drawn_number_enc, status, created_at)
            VALUES (?,?,?,?,?)
            """,
            (draw_id, draw.lottery_id, _enc(str(drawn_number)), "revealed", created_at),
        )
        conn.execute(
            "UPDATE rounds SET status = 'revealed' WHERE lottery_id = ? AND status IN ('open', 'locked')",
            (draw.lottery_id,),
        )

    return {
        "draw_id": draw_id,
        "lottery_id": draw.lottery_id,
        "status": "revealed",
        "drawn_number": drawn_number,
        "created_at": created_at,
    }


@app.get("/api/draw/current")
async def current_draw(lottery_id: Optional[str] = None):
    lottery = lottery_id or DEFAULT_LOTTERY_ID
    row = _get_current_draw(lottery)
    if not row:
        return {
            "lottery_id": lottery,
            "status": "pending",
            "draw_id": None,
            "drawn_number": None,
            "tickets_sold": _ticket_count(lottery),
        }

    drawn_number = int(_dec(row["drawn_number_enc"])) if row["status"] == "revealed" else None
    return {
        "lottery_id": row["lottery_id"],
        "status": row["status"],
        "draw_id": row["draw_id"],
        "drawn_number": drawn_number,
        "created_at": row["created_at"],
        "tickets_sold": _ticket_count(row["lottery_id"]),
    }


@app.post("/api/claim")
async def submit_claim(claim: ClaimRequest):
    if claim.is_winner != 1:
        raise HTTPException(status_code=422, detail="ZK proof result is not a winning proof")

    ticket = _get_ticket(claim.ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="ticket_id not found")

    draw = _get_current_draw(ticket["lottery_id"])
    if not draw:
        raise HTTPException(status_code=409, detail="draw has not been run yet")

    drawn_number = int(_dec(draw["drawn_number_enc"]))
    if claim.drawn_number is not None and claim.drawn_number != drawn_number:
        raise HTTPException(status_code=422, detail="drawn_number does not match the current draw")

    stored_ticket_number = int(_dec(ticket["ticket_number_enc"]))
    stored_nonce = _dec(ticket["nonce_enc"])
    if stored_ticket_number != claim.ticket_number or stored_nonce != claim.nonce:
        raise HTTPException(status_code=422, detail="private ticket data does not match encrypted ticket")

    commit_hash = _ticket_commit_hash(claim.ticket_number, claim.nonce)
    if commit_hash != ticket["commit_hash"]:
        raise HTTPException(status_code=422, detail="ticket commitment check failed")

    if claim.ticket_number != drawn_number:
        raise HTTPException(status_code=422, detail="ticket does not match draw")

    claim_id = str(uuid.uuid4())
    claimed_at = _now_iso()
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO claims (
                claim_id, ticket_id, lottery_id, proof_hash, zk_mode, is_winner, claimed_at
            ) VALUES (?,?,?,?,?,?,?)
            """,
            (
                claim_id,
                claim.ticket_id,
                ticket["lottery_id"],
                claim.proof_hash,
                claim.zk_mode or "mock",
                1,
                claimed_at,
            ),
        )
        conn.execute(
            "UPDATE tickets SET status = 'winner' WHERE ticket_id = ?",
            (claim.ticket_id,),
        )
        conn.execute(
            "UPDATE rounds SET status = 'claimed' WHERE lottery_id = ? AND status = 'revealed'",
            (ticket["lottery_id"],),
        )

    return {
        "claim_id": claim_id,
        "ticket_id": claim.ticket_id,
        "lottery_id": ticket["lottery_id"],
        "status": "winner",
        "is_winner": 1,
        "proof_verified": True,
        "zk_mode": claim.zk_mode or "mock",
        "claimed_at": claimed_at,
    }


@app.get("/api/claim/result")
async def claim_result(lottery_id: Optional[str] = None):
    query = "SELECT * FROM claims WHERE is_winner = 1"
    params: tuple = ()
    if lottery_id:
        query += " AND lottery_id = ?"
        params = (lottery_id,)
    query += " ORDER BY claimed_at DESC LIMIT 1"

    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(query, params).fetchone()

    if not row:
        return {"status": "pending", "winner_ticket_id": None, "lottery_id": lottery_id or DEFAULT_LOTTERY_ID}

    return {
        "status": "winner",
        "winner_ticket_id": row["ticket_id"],
        "lottery_id": row["lottery_id"],
        "proof_hash": row["proof_hash"],
        "zk_mode": row["zk_mode"],
        "claimed_at": row["claimed_at"],
    }


# ---------------------------------------------------------------------------
# Round management endpoints
# ---------------------------------------------------------------------------


def _row_to_round(row: sqlite3.Row, tickets_sold: int = 0, winner: Optional[dict] = None) -> dict:
    return {
        "lottery_id": row["lottery_id"],
        "name": row["name"],
        "ticket_min": row["ticket_min"],
        "ticket_max": row["ticket_max"],
        "status": row["status"],
        "created_at": row["created_at"],
        "locked_at": row["locked_at"],
        "archived_at": row["archived_at"],
        "tickets_sold": tickets_sold,
        "winner": winner,
    }


def _round_winner(lottery_id: str) -> Optional[dict]:
    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT ticket_id, proof_hash, claimed_at FROM claims WHERE lottery_id = ? AND is_winner = 1 ORDER BY claimed_at DESC LIMIT 1",
            (lottery_id,),
        ).fetchone()
    return dict(row) if row else None


@app.get("/api/rounds")
async def list_rounds():
    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM rounds ORDER BY created_at DESC").fetchall()
    return {
        "rounds": [
            _row_to_round(row, _ticket_count(row["lottery_id"]), _round_winner(row["lottery_id"]))
            for row in rows
        ]
    }


@app.post("/api/rounds")
async def create_round(req: RoundCreateRequest):
    if req.ticket_min > req.ticket_max:
        raise HTTPException(status_code=422, detail="ticket_min must be <= ticket_max")
    lottery_id = req.lottery_id or _slugify(req.name)
    created_at = _now_iso()
    with sqlite3.connect(DB_FILE) as conn:
        try:
            conn.execute(
                "INSERT INTO rounds (lottery_id, name, ticket_min, ticket_max, status, created_at) VALUES (?,?,?,?,?,?)",
                (lottery_id, req.name, req.ticket_min, req.ticket_max, "open", created_at),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail=f"round '{lottery_id}' already exists")
    return {
        "lottery_id": lottery_id,
        "name": req.name,
        "ticket_min": req.ticket_min,
        "ticket_max": req.ticket_max,
        "status": "open",
        "created_at": created_at,
        "tickets_sold": 0,
        "winner": None,
    }


@app.get("/api/rounds/current")
async def current_round():
    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM rounds WHERE status != 'archived' ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    if not row:
        return {
            "lottery_id": DEFAULT_LOTTERY_ID,
            "name": "Default",
            "ticket_min": 1,
            "ticket_max": 1000,
            "status": "open",
            "created_at": None,
            "locked_at": None,
            "archived_at": None,
            "tickets_sold": _ticket_count(DEFAULT_LOTTERY_ID),
            "winner": None,
        }
    return _row_to_round(row, _ticket_count(row["lottery_id"]), _round_winner(row["lottery_id"]))


@app.post("/api/rounds/{lottery_id}/lock")
async def lock_round(lottery_id: str):
    round_row = _get_round(lottery_id)
    if not round_row:
        raise HTTPException(status_code=404, detail=f"round '{lottery_id}' not found")
    if round_row["status"] != "open":
        raise HTTPException(status_code=409, detail=f"round is already {round_row['status']}")
    locked_at = _now_iso()
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            "UPDATE rounds SET status = 'locked', locked_at = ? WHERE lottery_id = ?",
            (locked_at, lottery_id),
        )
    return {"lottery_id": lottery_id, "status": "locked", "locked_at": locked_at}


@app.post("/api/rounds/{lottery_id}/archive")
async def archive_round(lottery_id: str):
    round_row = _get_round(lottery_id)
    if not round_row:
        raise HTTPException(status_code=404, detail=f"round '{lottery_id}' not found")
    if round_row["status"] == "archived":
        raise HTTPException(status_code=409, detail="round is already archived")
    archived_at = _now_iso()
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            "UPDATE rounds SET status = 'archived', archived_at = ? WHERE lottery_id = ?",
            (archived_at, lottery_id),
        )
    return {"lottery_id": lottery_id, "status": "archived", "archived_at": archived_at}

