from __future__ import annotations

from pathlib import Path
import json
import re
import time
from typing import Dict, List, Optional
from fastapi import HTTPException, UploadFile
from PIL import Image

from ..config import PROJECTS_DIR, IMAGE_EXTENSIONS


def safe_slug(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "project"


def project_dir(project_id: str) -> Path:
    path = PROJECTS_DIR / safe_slug(project_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")
    return path


def create_project(name: str, classes: List[str], task_type: str = "Detection") -> Dict:
    base = safe_slug(name)
    pid = base
    i = 2
    while (PROJECTS_DIR / pid).exists():
        pid = f"{base}-{i}"
        i += 1

    pdir = PROJECTS_DIR / pid
    for folder in ["images", "labels", "labels_cls", "jobs"]:
        (pdir / folder).mkdir(parents=True, exist_ok=True)

    clean_classes = normalize_classes(classes)
    meta = {
        "id": pid,
        "name": name,
        "task_type": task_type,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    write_json(pdir / "meta.json", meta)
    write_classes(pdir, clean_classes)
    return meta | {"classes": clean_classes, "image_count": 0}


def normalize_classes(classes: List[str]) -> List[str]:
    cleaned = []
    for item in classes:
        name = str(item).strip()
        if name and name not in cleaned:
            cleaned.append(name)
    return cleaned or ["OK", "NG"]


def list_projects() -> List[Dict]:
    projects = []
    for pdir in sorted(PROJECTS_DIR.iterdir()):
        if not pdir.is_dir():
            continue
        meta = read_json(pdir / "meta.json", default={})
        if not meta:
            continue
        projects.append(meta | {
            "classes": read_classes(pdir),
            "image_count": len(list_images(pdir.name)),
        })
    return projects


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read_classes(pdir: Path) -> List[str]:
    path = pdir / "classes.txt"
    if not path.exists():
        return ["OK", "NG"]
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_classes(pdir: Path, classes: List[str]) -> List[str]:
    clean = normalize_classes(classes)
    (pdir / "classes.txt").write_text("\n".join(clean) + "\n", encoding="utf-8")
    meta = read_json(pdir / "meta.json", default={}) or {}
    meta["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    write_json(pdir / "meta.json", meta)
    return clean


def list_images(project_id: str) -> List[Dict]:
    pdir = project_dir(project_id)
    images_dir = pdir / "images"
    results = []
    for path in sorted(images_dir.iterdir()):
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        width = height = None
        try:
            with Image.open(path) as im:
                width, height = im.size
        except Exception:
            pass
        results.append({
            "filename": path.name,
            "url": f"/data/projects/{project_id}/images/{path.name}",
            "width": width,
            "height": height,
            "label_url": f"/api/projects/{project_id}/images/{path.name}/annotations",
        })
    return results


def image_path(project_id: str, filename: str) -> Path:
    pdir = project_dir(project_id)
    path = (pdir / "images" / Path(filename).name).resolve()
    if not path.exists() or path.suffix.lower() not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=404, detail="Image not found")
    return path


async def save_uploaded_images(project_id: str, files: List[UploadFile]) -> List[Dict]:
    pdir = project_dir(project_id)
    saved = []
    for file in files:
        original = Path(file.filename or "image.jpg").name
        suffix = Path(original).suffix.lower()
        if suffix not in IMAGE_EXTENSIONS:
            continue
        target = pdir / "images" / original
        stem = target.stem
        i = 2
        while target.exists():
            target = pdir / "images" / f"{stem}-{i}{suffix}"
            i += 1
        target.write_bytes(await file.read())
        saved.append({"filename": target.name, "size": target.stat().st_size})
    return saved
