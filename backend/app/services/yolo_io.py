from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional
import random
import shutil
import yaml
from fastapi import HTTPException

from .storage import project_dir, image_path, list_images, read_classes


class DetectionLabelAdapter:
    """Backward-compatible YOLO bbox txt adapter."""

    @staticmethod
    def label_path(project_id: str, filename: str) -> Path:
        pdir = project_dir(project_id)
        stem = Path(filename).stem
        return pdir / "labels" / f"{stem}.txt"

    @classmethod
    def load(cls, project_id: str, filename: str) -> List[Dict]:
        image_path(project_id, filename)
        path = cls.label_path(project_id, filename)
        boxes: List[Dict] = []
        if not path.exists():
            return boxes
        for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
            parts = line.strip().split()
            if len(parts) < 5:
                continue
            try:
                class_id = int(float(parts[0]))
                x, y, w, h = [float(v) for v in parts[1:5]]
            except ValueError:
                continue
            boxes.append({
                "id": f"box-{idx+1}",
                "class_id": class_id,
                "x": clamp01(x),
                "y": clamp01(y),
                "w": clamp01(w),
                "h": clamp01(h),
            })
        return boxes

    @classmethod
    def save(cls, project_id: str, filename: str, boxes: List[Dict]) -> None:
        image_path(project_id, filename)
        path = cls.label_path(project_id, filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        lines = []
        for box in boxes:
            class_id = int(box.get("class_id", 0))
            x = clamp01(float(box.get("x", 0)))
            y = clamp01(float(box.get("y", 0)))
            w = clamp01(float(box.get("w", 0)))
            h = clamp01(float(box.get("h", 0)))
            if w <= 0 or h <= 0:
                continue
            lines.append(f"{class_id} {x:.6f} {y:.6f} {w:.6f} {h:.6f}")
        path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


class ClassificationLabelAdapter:
    @staticmethod
    def label_path(project_id: str, filename: str) -> Path:
        pdir = project_dir(project_id)
        stem = Path(filename).stem
        return pdir / "labels_cls" / f"{stem}.txt"

    @classmethod
    def load(cls, project_id: str, filename: str) -> Optional[int]:
        image_path(project_id, filename)
        path = cls.label_path(project_id, filename)
        if not path.exists():
            return None
        text = path.read_text(encoding="utf-8").strip()
        if text == "":
            return None
        try:
            return int(float(text.split()[0]))
        except ValueError:
            return None

    @classmethod
    def save(cls, project_id: str, filename: str, class_id: Optional[int]) -> None:
        image_path(project_id, filename)
        path = cls.label_path(project_id, filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        if class_id is None:
            if path.exists():
                path.unlink()
            return
        path.write_text(str(int(class_id)) + "\n", encoding="utf-8")


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def project_statistics(project_id: str) -> Dict:
    pdir = project_dir(project_id)
    classes = read_classes(pdir)
    object_counts = {name: 0 for name in classes}
    image_counts = {name: 0 for name in classes}
    labeled_images = 0
    classification_counts = {name: 0 for name in classes}

    for item in list_images(project_id):
        filename = item["filename"]
        boxes = DetectionLabelAdapter.load(project_id, filename)
        if boxes:
            labeled_images += 1
        used = set()
        for box in boxes:
            cid = int(box.get("class_id", -1))
            if 0 <= cid < len(classes):
                object_counts[classes[cid]] += 1
                used.add(classes[cid])
        for name in used:
            image_counts[name] += 1
        cls_id = ClassificationLabelAdapter.load(project_id, filename)
        if cls_id is not None and 0 <= cls_id < len(classes):
            classification_counts[classes[cls_id]] += 1

    return {
        "image_total": len(list_images(project_id)),
        "detection_labeled_images": labeled_images,
        "object_counts": object_counts,
        "image_counts": image_counts,
        "classification_counts": classification_counts,
    }


def export_detection_dataset_yaml(project_id: str, split_ratio: float = 0.8) -> Path:
    pdir = project_dir(project_id)
    images = list_images(project_id)
    random.Random(42).shuffle(images)
    split = int(len(images) * split_ratio)
    train = images[:split]
    val = images[split:] or images[:1]

    export_root = pdir / "export_detect"
    if export_root.exists():
        shutil.rmtree(export_root)
    for subset in ["train", "val"]:
        (export_root / "images" / subset).mkdir(parents=True, exist_ok=True)
        (export_root / "labels" / subset).mkdir(parents=True, exist_ok=True)

    def copy_items(items, subset):
        for item in items:
            src_img = image_path(project_id, item["filename"])
            dst_img = export_root / "images" / subset / src_img.name
            shutil.copy2(src_img, dst_img)
            src_label = DetectionLabelAdapter.label_path(project_id, item["filename"])
            dst_label = export_root / "labels" / subset / f"{src_img.stem}.txt"
            if src_label.exists():
                shutil.copy2(src_label, dst_label)
            else:
                dst_label.write_text("", encoding="utf-8")

    copy_items(train, "train")
    copy_items(val, "val")

    classes = read_classes(pdir)
    data = {
        "path": str(export_root.resolve()),
        "train": "images/train",
        "val": "images/val",
        "names": {i: name for i, name in enumerate(classes)},
    }
    yaml_path = pdir / "dataset.yaml"
    yaml_path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    return yaml_path


def export_classification_folders(project_id: str, split_ratio: float = 0.8) -> Path:
    pdir = project_dir(project_id)
    classes = read_classes(pdir)
    export_root = pdir / "export_classify"
    if export_root.exists():
        shutil.rmtree(export_root)
    for subset in ["train", "val"]:
        for name in classes:
            (export_root / subset / safe_folder(name)).mkdir(parents=True, exist_ok=True)

    grouped = {i: [] for i in range(len(classes))}
    for item in list_images(project_id):
        cls_id = ClassificationLabelAdapter.load(project_id, item["filename"])
        if cls_id is not None and 0 <= cls_id < len(classes):
            grouped[cls_id].append(item["filename"])

    rng = random.Random(42)
    for cls_id, filenames in grouped.items():
        rng.shuffle(filenames)
        split = int(len(filenames) * split_ratio)
        train = filenames[:split]
        val = filenames[split:] or filenames[:1]
        for subset, names in [("train", train), ("val", val)]:
            for filename in names:
                src = image_path(project_id, filename)
                shutil.copy2(src, export_root / subset / safe_folder(classes[cls_id]) / src.name)
    return export_root


def safe_folder(name: str) -> str:
    return "".join(c if c.isalnum() or c in "_-" else "_" for c in name).strip("_") or "class"
