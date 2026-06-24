from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
import json
import subprocess
import sys
import threading
import time
import uuid
from typing import Dict, List, Optional

from ..config import RUNS_DIR
from ..schemas import TrainingStartRequest
from .storage import project_dir, read_json, write_json
from .yolo_io import export_detection_dataset_yaml, export_classification_folders


@dataclass
class TrainingJob:
    id: str
    project_id: str
    task: str
    status: str
    command: List[str]
    created_at: str
    log_path: str
    returncode: Optional[int] = None


JOBS: Dict[str, TrainingJob] = {}


def start_training_job(req: TrainingStartRequest) -> Dict:
    pdir = project_dir(req.project_id)
    job_id = uuid.uuid4().hex[:12]
    job_dir = pdir / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    log_path = job_dir / "train.log"

    if req.task == "detect":
        data_path = export_detection_dataset_yaml(req.project_id, req.split_ratio)
        command = [
            sys.executable, "-m", "ultralytics", "detect", "train",
            f"data={data_path}",
            f"model={req.model}",
            f"epochs={req.epochs}",
            f"imgsz={req.imgsz}",
            f"batch={req.batch}",
            f"workers={req.workers}",
            f"project={RUNS_DIR}",
            f"name={req.project_id}_{job_id}",
            "exist_ok=True",
        ]
    else:
        data_path = export_classification_folders(req.project_id, req.split_ratio)
        command = [
            sys.executable, "-m", "ultralytics", "classify", "train",
            f"data={data_path}",
            f"model={req.model}",
            f"epochs={req.epochs}",
            f"imgsz={req.imgsz}",
            f"batch={req.batch}",
            f"workers={req.workers}",
            f"project={RUNS_DIR}",
            f"name={req.project_id}_{job_id}",
            "exist_ok=True",
        ]
    if req.device:
        command.append(f"device={req.device}")

    job = TrainingJob(
        id=job_id,
        project_id=req.project_id,
        task=req.task,
        status="queued",
        command=command,
        created_at=time.strftime("%Y-%m-%d %H:%M:%S"),
        log_path=str(log_path),
    )
    JOBS[job_id] = job
    write_json(job_dir / "job.json", asdict(job))

    thread = threading.Thread(target=_run_job, args=(job, job_dir), daemon=True)
    thread.start()
    return asdict(job)


def _run_job(job: TrainingJob, job_dir: Path) -> None:
    job.status = "running"
    _persist(job, job_dir)
    with open(job.log_path, "w", encoding="utf-8", errors="ignore") as log:
        log.write("VisionHub local training job\n")
        log.write("Command:\n")
        log.write(" ".join(job.command) + "\n\n")
        log.flush()
        try:
            proc = subprocess.Popen(job.command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="ignore")
            assert proc.stdout is not None
            for line in proc.stdout:
                log.write(line)
                log.flush()
            job.returncode = proc.wait()
            job.status = "completed" if job.returncode == 0 else "failed"
        except ModuleNotFoundError as exc:
            log.write(f"Ultralytics module not installed: {exc}\n")
            log.write("Install with: pip install ultralytics\n")
            job.status = "failed"
            job.returncode = -1
        except FileNotFoundError as exc:
            log.write(f"Command failed: {exc}\n")
            job.status = "failed"
            job.returncode = -1
        except Exception as exc:
            log.write(f"Unexpected error: {type(exc).__name__}: {exc}\n")
            job.status = "failed"
            job.returncode = -1
    _persist(job, job_dir)


def _persist(job: TrainingJob, job_dir: Path) -> None:
    write_json(job_dir / "job.json", asdict(job))


def load_jobs(project_id: Optional[str] = None) -> List[Dict]:
    jobs = [asdict(j) for j in JOBS.values()]
    # Also read jobs created before server reload.
    for pdir in (Path(project_dir(project_id)) / "jobs",) if project_id else []:
        if pdir.exists():
            for job_json in pdir.glob("*/job.json"):
                data = read_json(job_json, default=None)
                if data and data.get("id") not in {j["id"] for j in jobs}:
                    jobs.append(data)
    jobs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return jobs


def get_job(project_id: str, job_id: str) -> Dict:
    if job_id in JOBS:
        data = asdict(JOBS[job_id])
    else:
        pdir = project_dir(project_id)
        data = read_json(pdir / "jobs" / job_id / "job.json", default=None)
        if not data:
            raise FileNotFoundError(job_id)
    log_text = ""
    path = Path(data.get("log_path", ""))
    if path.exists():
        log_text = path.read_text(encoding="utf-8", errors="ignore")[-12000:]
    data["log_tail"] = log_text
    return data
