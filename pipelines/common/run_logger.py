import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pipelines.common.config import runs_path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_path() -> Path:
    p = runs_path()
    p.mkdir(parents=True, exist_ok=True)
    return p / "run_log.jsonl"


def _append(record: dict) -> None:
    with open(_log_path(), "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def create_run(
    run_type: str,
    target_kind: str,
    target_ref: str,
    parent_run_id: Optional[str] = None,
    max_attempts: int = 3,
    input_ref: Optional[str] = None,
) -> str:
    run_id = str(uuid.uuid4())
    _append({
        "run_id": run_id,
        "parent_run_id": parent_run_id,
        "run_type": run_type,
        "target_kind": target_kind,
        "target_ref": target_ref,
        "status": "pending",
        "attempt": 1,
        "max_attempts": max_attempts,
        "error_class": None,
        "error_message": None,
        "started_at": _now(),
        "completed_at": None,
        "input_ref": input_ref,
        "output_ref": None,
    })
    return run_id


def update_run(
    run_id: str,
    status: str,
    output_ref: Optional[str] = None,
    error_class: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    _append({
        "run_id": run_id,
        "status": status,
        "output_ref": output_ref,
        "error_class": error_class,
        "error_message": error_message,
        "completed_at": _now() if status in ("completed", "failed", "dlq") else None,
        "_event": "status_update",
    })


def mark_processing(run_id: str) -> None:
    _append({"run_id": run_id, "status": "processing", "_event": "status_update"})


def mark_completed(run_id: str, output_ref: Optional[str] = None) -> None:
    update_run(run_id, "completed", output_ref=output_ref)


def mark_failed(run_id: str, error: Exception) -> None:
    update_run(
        run_id,
        "failed",
        error_class=type(error).__name__,
        error_message=str(error),
    )
