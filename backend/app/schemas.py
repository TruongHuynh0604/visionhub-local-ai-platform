from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    classes: List[str] = Field(default_factory=lambda: ["OK", "NG"])
    task_type: Literal["Detection", "Classification"] = "Detection"

class ProjectUpdateClasses(BaseModel):
    classes: List[str]

class BBoxLabel(BaseModel):
    id: Optional[str] = None
    class_id: int
    x: float
    y: float
    w: float
    h: float

class DetectionAnnotationPayload(BaseModel):
    boxes: List[BBoxLabel]

class ClassificationPayload(BaseModel):
    class_id: Optional[int] = None

class TrainingStartRequest(BaseModel):
    project_id: str
    task: Literal["detect", "classify"] = "detect"
    model: str = "yolo11n.pt"
    epochs: int = 30
    imgsz: int = 640
    batch: int = 8
    device: str = ""
    workers: int = 2
    split_ratio: float = 0.8
