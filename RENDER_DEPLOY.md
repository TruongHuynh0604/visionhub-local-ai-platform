# Deploy VisionHub to Render

Use this when GitHub Codespaces works on your laptop but external testers cannot open the `*.app.github.dev` URL.

## What was added

- `render.yaml`: Render Blueprint for a Python web service.
- `run_render.sh`: production-style startup script for FastAPI/Uvicorn.

## Deploy steps

1. Go to Render dashboard.
2. Choose **New +**.
3. Choose **Blueprint**.
4. Connect GitHub if needed.
5. Select this repository:

   ```text
   TruongHuynh0604/visionhub-local-ai-platform
   ```

6. Render will detect `render.yaml`.
7. Create the service.
8. Wait until build and deploy finish.

## Expected public URL

Render will give a public URL similar to:

```text
https://visionhub-local-ai-platform.onrender.com
```

Send that URL back to ChatGPT for live testing.

## Notes

- This is good for UI testing and small upload/labeling tests.
- The free Render filesystem is not permanent. Runtime data stored under `/tmp/visionhub_data` may be lost after restart.
- Real YOLO training with large datasets should run on a GPU machine, Colab, RunPod, Vast.ai, or local workstation.
