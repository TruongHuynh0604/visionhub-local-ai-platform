from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import FRONTEND_DIR, DATA_DIR
from .routers import datasets, annotations, training, models

app = FastAPI(title="VisionHub Local AI Platform", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets.router)
app.include_router(annotations.router)
app.include_router(training.router)
app.include_router(models.router)

app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")
app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")
app.mount("/styles", StaticFiles(directory=str(FRONTEND_DIR / "styles")), name="styles")
app.mount("/src", StaticFiles(directory=str(FRONTEND_DIR / "src")), name="src")

@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")

@app.get("/health")
def health():
    return {"ok": True}
