from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..config import DATA_DIR

router = APIRouter(prefix="/api/debug", tags=["debug"])

DEBUG_DIR = DATA_DIR / "debug"
CLIENT_LOGS_FILE = DEBUG_DIR / "client_logs.jsonl"
MAX_READ_LINES = 500
MAX_SAVE_LINES = 250


class ClientLog(BaseModel):
    id: str | None = None
    ts: str | None = None
    level: str = "log"
    source: str | None = None
    route: str | None = None
    url: str | None = None
    message: str | None = None
    args: list[Any] = Field(default_factory=list)
    session_id: str | None = None
    userAgent: str | None = None


class ClientLogBatch(BaseModel):
    session_id: str | None = None
    logs: list[ClientLog] = Field(default_factory=list)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tail_jsonl(path, limit: int) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    output = []
    for line in lines[-max(1, min(limit, MAX_READ_LINES)) :]:
        try:
            output.append(json.loads(line))
        except json.JSONDecodeError:
            output.append({"received_at": None, "level": "error", "message": line})
    return output


@router.post("/client-logs")
def save_client_logs(payload: ClientLogBatch):
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    logs = payload.logs[-MAX_SAVE_LINES:]
    received_at = _utc_now()

    with CLIENT_LOGS_FILE.open("a", encoding="utf-8") as f:
        for log in logs:
            record = log.model_dump()
            record["received_at"] = received_at
            record["session_id"] = record.get("session_id") or payload.session_id
            f.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")

    return {
        "ok": True,
        "saved": len(logs),
        "file": str(CLIENT_LOGS_FILE),
        "received_at": received_at,
    }


@router.get("/client-logs")
def get_client_logs(limit: int = 120):
    logs = _tail_jsonl(CLIENT_LOGS_FILE, limit)
    return {
        "ok": True,
        "count": len(logs),
        "logs": logs,
        "file": str(CLIENT_LOGS_FILE),
    }


@router.delete("/client-logs")
def clear_client_logs():
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    CLIENT_LOGS_FILE.write_text("", encoding="utf-8")
    return {"ok": True, "cleared": True, "file": str(CLIENT_LOGS_FILE)}


@router.get("/diagnostics")
def diagnostics():
    return {
        "ok": True,
        "timestamp": _utc_now(),
        "data_dir": str(DATA_DIR),
        "debug_dir_exists": DEBUG_DIR.exists(),
        "client_logs_file_exists": CLIENT_LOGS_FILE.exists(),
        "client_logs_tail_count": len(_tail_jsonl(CLIENT_LOGS_FILE, 20)),
    }
