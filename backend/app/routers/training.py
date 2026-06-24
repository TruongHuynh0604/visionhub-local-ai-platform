from fastapi import APIRouter, HTTPException

from ..schemas import TrainingStartRequest
from ..services.training_runner import start_training_job, load_jobs, get_job

router = APIRouter(prefix="/api/training", tags=["training"])

@router.post("/start")
def start(payload: TrainingStartRequest):
    return start_training_job(payload)

@router.get("/jobs")
def jobs(project_id: str | None = None):
    return {"jobs": load_jobs(project_id)}

@router.get("/jobs/{project_id}/{job_id}")
def job_detail(project_id: str, job_id: str):
    try:
        return get_job(project_id, job_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Job not found")
