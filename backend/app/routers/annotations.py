from fastapi import APIRouter

from ..schemas import DetectionAnnotationPayload, ClassificationPayload
from ..services.yolo_io import DetectionLabelAdapter, ClassificationLabelAdapter

router = APIRouter(prefix="/api/projects/{project_id}/images/{filename}", tags=["annotations"])

@router.get("/annotations")
def get_detection_annotations(project_id: str, filename: str):
    return {"boxes": DetectionLabelAdapter.load(project_id, filename)}

@router.put("/annotations")
def put_detection_annotations(project_id: str, filename: str, payload: DetectionAnnotationPayload):
    boxes = [box.model_dump() for box in payload.boxes]
    DetectionLabelAdapter.save(project_id, filename, boxes)
    return {"saved": True, "boxes": DetectionLabelAdapter.load(project_id, filename)}

@router.get("/classification")
def get_classification(project_id: str, filename: str):
    return {"class_id": ClassificationLabelAdapter.load(project_id, filename)}

@router.put("/classification")
def put_classification(project_id: str, filename: str, payload: ClassificationPayload):
    ClassificationLabelAdapter.save(project_id, filename, payload.class_id)
    return {"saved": True, "class_id": ClassificationLabelAdapter.load(project_id, filename)}
