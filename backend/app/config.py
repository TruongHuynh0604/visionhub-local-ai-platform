from pathlib import Path
import os

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "frontend"
DATA_DIR = Path(os.environ.get("VISIONHUB_DATA_DIR", PROJECT_ROOT / "backend" / "data")).resolve()
PROJECTS_DIR = DATA_DIR / "projects"
RUNS_DIR = DATA_DIR / "runs"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}

for directory in [DATA_DIR, PROJECTS_DIR, RUNS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)
