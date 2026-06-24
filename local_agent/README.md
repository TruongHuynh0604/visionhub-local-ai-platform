# VisionHub Local Training Agent

This agent lets the Render-hosted VisionHub web UI start YOLO training on your own PC while keeping all images, labels, models and logs inside your local workspace.

## 1. Start the agent

```bat
cd local_agent
run_agent.bat
```

The agent runs at:

```text
http://127.0.0.1:8765
```

Keep the command window open while training.

## 2. Configure the workspace

Your web workspace and the agent workspace must be the same folder.

Example:

```text
D:\VisionHub_Workspace
```

The folder must contain projects like:

```text
D:\VisionHub_Workspace\projects\3dc\images
D:\VisionHub_Workspace\projects\3dc\labels\detection
D:\VisionHub_Workspace\projects\3dc\classes.txt
```

You can set this from the web page:

```text
Training -> Agent workspace path on PC -> Save Agent Workspace
```

or edit:

```text
local_agent/config.json
```

## 3. Train from the web

Open:

```text
https://visionhub-local-ai-platform.onrender.com/#/training
```

Then click:

```text
Check Local Agent
Start Local Training
Refresh Status / Log
```

## Notes

- The web UI sends only parameters such as project id, model, epochs and image size.
- It does not upload images, labels, logs or models to Render/GitHub/server.
- The agent does not run raw shell commands from the browser.
- The agent only trains inside the configured workspace folder.
- Training code is inside the local agent, not generated into each project as `Train_local.py`.

## Package as EXE later

After the Python agent is stable, it can be packaged as an EXE with PyInstaller:

```bat
pip install pyinstaller
pyinstaller --onefile --name VisionHub_Local_Agent app.py
```
