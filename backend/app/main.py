from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import FRONTEND_DIR, DATA_DIR
from .routers import datasets, annotations, training, models, debug

APP_VERSION = "2.1.0-local-multiproject"
NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers.update(NO_CACHE_HEADERS)
        return response


app = FastAPI(title="VisionHub Local AI Platform", version=APP_VERSION)

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
app.include_router(debug.router)

app.mount("/data", NoCacheStaticFiles(directory=str(DATA_DIR)), name="data")
app.mount("/assets", NoCacheStaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")
app.mount("/styles", NoCacheStaticFiles(directory=str(FRONTEND_DIR / "styles")), name="styles")
app.mount("/src", NoCacheStaticFiles(directory=str(FRONTEND_DIR / "src")), name="src")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html", headers=NO_CACHE_HEADERS)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/version")
def version():
    return {"version": APP_VERSION, "frontend_cache": "disabled"}
