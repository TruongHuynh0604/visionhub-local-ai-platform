# File Map / Module Links

## Run files

- `run_local.bat`: Windows one-click local run.
- `run_local.sh`: Linux/macOS local run.

## Backend

- `backend/app/main.py`: FastAPI app, static frontend serving, route registration.
- `backend/app/config.py`: local path configuration.
- `backend/app/schemas.py`: API request/response models.

### Backend routers

- `backend/app/routers/datasets.py`: projects, upload images, class list, stats, export.
- `backend/app/routers/annotations.py`: detection YOLO labels and classification labels.
- `backend/app/routers/training.py`: start training and read job logs.
- `backend/app/routers/models.py`: scan trained `.pt` models from local runs.

### Backend services

- `backend/app/services/storage.py`: project folders, images, metadata, classes.
- `backend/app/services/yolo_io.py`: `DetectionLabelAdapter`, `ClassificationLabelAdapter`, YOLO export/split.
- `backend/app/services/training_runner.py`: background local training runner.

## Frontend

- `frontend/index.html`: app entry.
- `frontend/styles/base.css`: global UI.
- `frontend/styles/sidebar.css`: sidebar and enlarged icon style.
- `frontend/styles/labeling.css`: labeling canvas layout.
- `frontend/src/main.js`: frontend router and page linking.
- `frontend/src/api.js`: API client.
- `frontend/src/state.js`: shared frontend state.

### Frontend components

- `frontend/src/components/icons.js`: SVG icons.
- `frontend/src/components/sidebar.js`: sidebar navigation.
- `frontend/src/components/topbar.js`: page header.

### Frontend labeling

- `frontend/src/pages/labeling.js`: labeling page shell and mode switching.
- `frontend/src/labeling/canvas.js`: detection bbox canvas logic.
- `frontend/src/labeling/classes.js`: class selector and object list UI.

### Frontend pages

- `frontend/src/pages/home.js`
- `frontend/src/pages/datasets.js`
- `frontend/src/pages/projects.js`
- `frontend/src/pages/training.js`
- `frontend/src/pages/models.js`
- `frontend/src/pages/deploy.js`
- `frontend/src/pages/integrations.js`
- `frontend/src/pages/support.js`
- `frontend/src/pages/trash.js`
