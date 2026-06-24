@echo off
setlocal
cd /d "%~dp0"

echo ======================================
echo  VisionHub Local Training Agent
echo ======================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo Creating Python virtual environment...
    py -3 -m venv .venv
    if errorlevel 1 (
        echo Failed to create virtual environment. Make sure Python 3.10+ is installed.
        pause
        exit /b 1
    )
)

call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip
pip install -r requirements.txt

echo.
echo Starting agent at http://127.0.0.1:8765
echo Keep this window open while training from the web.
echo.
python app.py
pause
