from pathlib import Path
from fastapi import APIRouter
from ..config import RUNS_DIR

router = APIRouter(prefix="/api/models", tags=["models"])

@router.get("")
def list_models():
    models = []
    for path in RUNS_DIR.rglob("*.pt"):
        stat = path.stat()
        models.append({
            "name": path.name,
            "path": str(path),
            "run": path.parent.parent.name if path.parent.name == "weights" else path.parent.name,
            "size_mb": round(stat.st_size / 1024 / 1024, 2),
            "modified": int(stat.st_mtime),
        })
    models.sort(key=lambda x: x["modified"], reverse=True)
    return {"models": models}
