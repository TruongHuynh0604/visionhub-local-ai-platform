from fastapi import APIRouter, UploadFile, File
from typing import List

from ..schemas import ProjectCreate, ProjectUpdateClasses
from ..services.storage import create_project, list_projects, project_dir, read_classes, write_classes, list_images, save_uploaded_images
from ..services.yolo_io import project_statistics, export_detection_dataset_yaml, export_classification_folders

router = APIRouter(prefix="/api/projects", tags=["projects"])

@router.get("")
def get_projects():
    return {"projects": list_projects()}

@router.post("")
def post_project(payload: ProjectCreate):
    return create_project(payload.name, payload.classes, payload.task_type)

@router.get("/{project_id}/classes")
def get_classes(project_id: str):
    return {"classes": read_classes(project_dir(project_id))}

@router.put("/{project_id}/classes")
def put_classes(project_id: str, payload: ProjectUpdateClasses):
    return {"classes": write_classes(project_dir(project_id), payload.classes)}

@router.get("/{project_id}/images")
def get_images(project_id: str):
    return {"images": list_images(project_id)}

@router.post("/{project_id}/images")
async def upload_images(project_id: str, files: List[UploadFile] = File(...)):
    return {"saved": await save_uploaded_images(project_id, files), "images": list_images(project_id)}

@router.get("/{project_id}/stats")
def get_stats(project_id: str):
    return project_statistics(project_id)

@router.post("/{project_id}/export/detection")
def export_detection(project_id: str, split_ratio: float = 0.8):
    path = export_detection_dataset_yaml(project_id, split_ratio)
    return {"dataset_yaml": str(path)}

@router.post("/{project_id}/export/classification")
def export_classification(project_id: str, split_ratio: float = 0.8):
    path = export_classification_folders(project_id, split_ratio)
    return {"dataset_dir": str(path)}
