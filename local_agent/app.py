from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

APP_VERSION = "0.1.0-local-training-agent"
BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
PROJECT_ID_RE = re.compile(r"^[a-zA-Z0-9._-]{1,100}$")

DEFAULT_CONFIG = {
    "host": "127.0.0.1",
    "port": 8765,
    "workspace_dir": "D:/VisionHub_Workspace",
    "token": "visionhub-local-dev-token",
    "allowed_origins": ["*"],
}

TRAIN_CODE = r'''
from pathlib import Path
import json
import os
import random
import shutil
import sys

from ultralytics import YOLO

PROJECT = Path(os.environ["VISIONHUB_PROJECT_DIR"]).resolve()
SRC_IMAGES = PROJECT / "images"
SRC_LABELS = PROJECT / "labels" / "detection"
EXPORT_DIR = PROJECT / "exports" / "yolo_train"
DATA_YAML = PROJECT / "data.yaml"
RUNS_DIR = PROJECT / "runs"
LOGS_DIR = PROJECT / "logs"

MODEL = os.environ.get("VISIONHUB_MODEL", "yolo11n.pt")
EPOCHS = int(os.environ.get("VISIONHUB_EPOCHS", "30"))
IMGSZ = int(os.environ.get("VISIONHUB_IMGSZ", "640"))
BATCH = int(os.environ.get("VISIONHUB_BATCH", "8"))
WORKERS = int(os.environ.get("VISIONHUB_WORKERS", "2"))
DEVICE = os.environ.get("VISIONHUB_DEVICE", "").strip()
VAL_RATIO = float(os.environ.get("VISIONHUB_VAL_RATIO", "0.2"))
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif", ".tif", ".tiff"}


def read_classes():
    class_file = PROJECT / "classes.txt"
    if not class_file.exists():
        class_file.write_text("OK\nNG\n", encoding="utf-8")
    names = [x.strip() for x in class_file.read_text(encoding="utf-8").splitlines() if x.strip()]
    if not names:
        raise RuntimeError("classes.txt is empty")
    return names


def copy_one(image_path: Path, image_dst_dir: Path, label_dst_dir: Path):
    image_dst_dir.mkdir(parents=True, exist_ok=True)
    label_dst_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(image_path, image_dst_dir / image_path.name)
    src_label = SRC_LABELS / (image_path.stem + ".txt")
    dst_label = label_dst_dir / (image_path.stem + ".txt")
    if src_label.exists():
        shutil.copy2(src_label, dst_label)
    else:
        dst_label.write_text("", encoding="utf-8")


def prepare_dataset(classes):
    if EXPORT_DIR.exists():
        shutil.rmtree(EXPORT_DIR)
    SRC_IMAGES.mkdir(parents=True, exist_ok=True)
    SRC_LABELS.mkdir(parents=True, exist_ok=True)
    images = sorted([p for p in SRC_IMAGES.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS])
    if not images:
        raise RuntimeError("No images found in project/images")

    random.seed(42)
    random.shuffle(images)
    if len(images) >= 5:
        val_count = max(1, int(len(images) * VAL_RATIO))
        val_images = images[:val_count]
        train_images = images[val_count:]
    else:
        train_images = images
        val_images = images

    for img in train_images:
        copy_one(img, EXPORT_DIR / "images" / "train", EXPORT_DIR / "labels" / "train")
    for img in val_images:
        copy_one(img, EXPORT_DIR / "images" / "val", EXPORT_DIR / "labels" / "val")

    names_lines = ["names:"] + ["  {}: {}".format(i, repr(name)) for i, name in enumerate(classes)]
    yaml_text = "\n".join([
        "path: " + EXPORT_DIR.as_posix(),
        "train: images/train",
        "val: images/val",
        *names_lines,
        "",
    ])
    DATA_YAML.write_text(yaml_text, encoding="utf-8")
    print("Dataset prepared:", EXPORT_DIR, flush=True)
    print("Train images:", len(train_images), "Val images:", len(val_images), flush=True)
    print("Classes:", ", ".join(classes), flush=True)


def main():
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    classes = read_classes()
    prepare_dataset(classes)
    kwargs = dict(
        data=str(DATA_YAML),
        epochs=EPOCHS,
        imgsz=IMGSZ,
        batch=BATCH,
        workers=WORKERS,
        project=str(RUNS_DIR),
        name="train",
        exist_ok=True,
        plots=True,
    )
    if DEVICE:
        kwargs["device"] = DEVICE
    print("Training config:", json.dumps(kwargs, indent=2), flush=True)
    model = YOLO(MODEL)
    model.train(**kwargs)
    print("Training completed. Results:", RUNS_DIR / "train", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("TRAINING_ERROR:", exc, file=sys.stderr, flush=True)
        raise
'''


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        save_config(DEFAULT_CONFIG.copy())
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        data = DEFAULT_CONFIG.copy()
    merged = DEFAULT_CONFIG.copy()
    merged.update(data or {})
    return merged


def save_config(config: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")


CONFIG = load_config()

app = FastAPI(title="VisionHub Local Training Agent", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CONFIG.get("allowed_origins") or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_network_access_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


class AgentConfigUpdate(BaseModel):
    workspace_dir: str = Field(..., min_length=2)


class TrainStartRequest(BaseModel):
    project_id: str
    task: str = "detect"
    model: str = "yolo11n.pt"
    epochs: int = Field(30, ge=1, le=10000)
    imgsz: int = Field(640, ge=64, le=4096)
    batch: int = Field(8, ge=-1, le=4096)
    workers: int = Field(2, ge=0, le=64)
    device: str = ""
    val_ratio: float = Field(0.2, ge=0.01, le=0.9)


class JobState:
    def __init__(self):
        self.lock = threading.Lock()
        self.process: Optional[subprocess.Popen] = None
        self.project_id: Optional[str] = None
        self.project_dir: Optional[Path] = None
        self.log_path: Optional[Path] = None
        self.started_at: Optional[str] = None
        self.finished_at: Optional[str] = None
        self.returncode: Optional[int] = None
        self.status: str = "idle"
        self.message: str = "No training job has been started."


JOB = JobState()


def expected_token() -> str:
    return str(CONFIG.get("token") or "")


def verify_token(x_visionhub_token: Optional[str], authorization: Optional[str]) -> None:
    token = expected_token()
    if not token:
        return
    supplied = x_visionhub_token or ""
    if not supplied and authorization and authorization.lower().startswith("bearer "):
        supplied = authorization.split(" ", 1)[1]
    if supplied != token:
        raise HTTPException(status_code=401, detail="Invalid Local Agent token.")


def auth_headers(
    x_visionhub_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
) -> None:
    verify_token(x_visionhub_token, authorization)


def workspace_dir() -> Path:
    return Path(str(CONFIG.get("workspace_dir") or "")).expanduser().resolve()


def project_dir_for(project_id: str) -> Path:
    if not PROJECT_ID_RE.match(project_id or ""):
        raise HTTPException(status_code=400, detail="Invalid project_id. Use only letters, numbers, dot, underscore and dash.")
    root = workspace_dir()
    project_dir = (root / "projects" / project_id).resolve()
    try:
        project_dir.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Project path escapes workspace_dir.")
    return project_dir


def count_images(project_dir: Path) -> int:
    image_dir = project_dir / "images"
    if not image_dir.exists():
        return 0
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif", ".tif", ".tiff"}
    return sum(1 for p in image_dir.iterdir() if p.is_file() and p.suffix.lower() in exts)


def read_classes(project_dir: Path) -> list[str]:
    class_file = project_dir / "classes.txt"
    if not class_file.exists():
        return []
    return [x.strip() for x in class_file.read_text(encoding="utf-8").splitlines() if x.strip()]


def update_job_status_from_process() -> None:
    with JOB.lock:
        if JOB.process is None:
            return
        rc = JOB.process.poll()
        if rc is None:
            JOB.status = "running"
            JOB.message = "Training is running."
            return
        JOB.returncode = rc
        JOB.finished_at = JOB.finished_at or datetime.now().isoformat(timespec="seconds")
        if rc == 0:
            JOB.status = "completed"
            JOB.message = "Training completed successfully."
        else:
            JOB.status = "failed"
            JOB.message = f"Training exited with code {rc}."


def status_payload() -> dict:
    update_job_status_from_process()
    with JOB.lock:
        return {
            "status": JOB.status,
            "message": JOB.message,
            "project_id": JOB.project_id,
            "project_dir": str(JOB.project_dir) if JOB.project_dir else None,
            "log_path": str(JOB.log_path) if JOB.log_path else None,
            "started_at": JOB.started_at,
            "finished_at": JOB.finished_at,
            "returncode": JOB.returncode,
            "running": JOB.process is not None and JOB.process.poll() is None,
        }


def log_reader(process: subprocess.Popen, log_path: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8", errors="replace") as f:
        f.write(f"\n===== VisionHub training started {datetime.now().isoformat(timespec='seconds')} =====\n")
        if process.stdout:
            for line in process.stdout:
                f.write(line)
                f.flush()
        rc = process.wait()
        f.write(f"\n===== VisionHub training finished rc={rc} {datetime.now().isoformat(timespec='seconds')} =====\n")
        f.flush()
    update_job_status_from_process()


@app.get("/health")
def health():
    update_job_status_from_process()
    root = workspace_dir()
    return {
        "ok": True,
        "version": APP_VERSION,
        "workspace_dir": str(root),
        "workspace_exists": root.exists(),
        "training_running": JOB.process is not None and JOB.process.poll() is None,
    }


@app.get("/api/agent/config")
def get_config(_: None = Header(default=None), x_visionhub_token: Optional[str] = Header(default=None), authorization: Optional[str] = Header(default=None)):
    verify_token(x_visionhub_token, authorization)
    root = workspace_dir()
    return {
        "workspace_dir": str(root),
        "workspace_exists": root.exists(),
        "token_enabled": bool(expected_token()),
        "version": APP_VERSION,
    }


@app.post("/api/agent/config")
def update_config(req: AgentConfigUpdate, x_visionhub_token: Optional[str] = Header(default=None), authorization: Optional[str] = Header(default=None)):
    verify_token(x_visionhub_token, authorization)
    global CONFIG
    root = Path(req.workspace_dir).expanduser().resolve()
    CONFIG["workspace_dir"] = str(root)
    save_config(CONFIG)
    return {
        "ok": True,
        "workspace_dir": str(root),
        "workspace_exists": root.exists(),
        "message": "Workspace path saved in local_agent/config.json.",
    }


@app.post("/api/train/start")
def start_training(req: TrainStartRequest, x_visionhub_token: Optional[str] = Header(default=None), authorization: Optional[str] = Header(default=None)):
    verify_token(x_visionhub_token, authorization)
    if req.task != "detect":
        raise HTTPException(status_code=400, detail="Only detection training is supported in this agent version.")

    root = workspace_dir()
    if not root.exists():
        raise HTTPException(status_code=400, detail=f"workspace_dir does not exist: {root}")

    project_dir = project_dir_for(req.project_id)
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {project_dir}")
    if count_images(project_dir) == 0:
        raise HTTPException(status_code=400, detail="No images found in project/images.")
    if not read_classes(project_dir):
        raise HTTPException(status_code=400, detail="classes.txt is empty or missing.")

    with JOB.lock:
        if JOB.process is not None and JOB.process.poll() is None:
            raise HTTPException(status_code=409, detail=f"Training is already running for project {JOB.project_id}.")

        logs_dir = project_dir / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        log_path = logs_dir / "agent_train.log"
        env = os.environ.copy()
        env.update({
            "PYTHONUNBUFFERED": "1",
            "VISIONHUB_PROJECT_DIR": str(project_dir),
            "VISIONHUB_MODEL": req.model,
            "VISIONHUB_EPOCHS": str(req.epochs),
            "VISIONHUB_IMGSZ": str(req.imgsz),
            "VISIONHUB_BATCH": str(req.batch),
            "VISIONHUB_WORKERS": str(req.workers),
            "VISIONHUB_DEVICE": req.device,
            "VISIONHUB_VAL_RATIO": str(req.val_ratio),
        })
        process = subprocess.Popen(
            [sys.executable, "-u", "-c", TRAIN_CODE],
            cwd=str(project_dir),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
        JOB.process = process
        JOB.project_id = req.project_id
        JOB.project_dir = project_dir
        JOB.log_path = log_path
        JOB.started_at = datetime.now().isoformat(timespec="seconds")
        JOB.finished_at = None
        JOB.returncode = None
        JOB.status = "running"
        JOB.message = "Training started."
        threading.Thread(target=log_reader, args=(process, log_path), daemon=True).start()

    return {
        "ok": True,
        "status": "running",
        "message": "Local YOLO training started.",
        "project_id": req.project_id,
        "project_dir": str(project_dir),
        "log_path": str(log_path),
        "images": count_images(project_dir),
        "classes": read_classes(project_dir),
        "note": "No data was uploaded to Render/GitHub/server.",
    }


@app.get("/api/train/status")
def train_status(x_visionhub_token: Optional[str] = Header(default=None), authorization: Optional[str] = Header(default=None)):
    verify_token(x_visionhub_token, authorization)
    return status_payload()


@app.get("/api/train/log", response_class=PlainTextResponse)
def train_log(tail: int = 200, x_visionhub_token: Optional[str] = Header(default=None), authorization: Optional[str] = Header(default=None)):
    verify_token(x_visionhub_token, authorization)
    update_job_status_from_process()
    log_path = JOB.log_path
    if not log_path or not log_path.exists():
        return ""
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[-max(1, min(tail, 2000)):])


@app.post("/api/train/stop")
def stop_training(x_visionhub_token: Optional[str] = Header(default=None), authorization: Optional[str] = Header(default=None)):
    verify_token(x_visionhub_token, authorization)
    with JOB.lock:
        process = JOB.process
        if process is None or process.poll() is not None:
            update_job_status_from_process()
            return {"ok": True, **status_payload(), "message": "No running training process."}
        if os.name == "nt":
            process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            process.terminate()
        JOB.status = "stopping"
        JOB.message = "Stop signal sent."
    return {"ok": True, **status_payload()}


if __name__ == "__main__":
    import uvicorn

    host = str(CONFIG.get("host") or "127.0.0.1")
    port = int(CONFIG.get("port") or 8765)
    print("======================================")
    print(" VisionHub Local Training Agent")
    print("======================================")
    print(f"URL:       http://{host}:{port}")
    print(f"Workspace: {workspace_dir()}")
    print(f"Token:     {expected_token() or '(disabled)'}")
    print("======================================")
    uvicorn.run(app, host=host, port=port)
