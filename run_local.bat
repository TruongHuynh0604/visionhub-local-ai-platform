@echo off
setlocal
cd /d %~dp0
if not exist .venv (
  python -m venv .venv
)
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r backend\requirements.txt
set VISIONHUB_DATA_DIR=%cd%\backend\data
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
