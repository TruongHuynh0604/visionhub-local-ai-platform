# Run VisionHub online with GitHub Codespaces

This project is a FastAPI + static frontend application. GitHub Pages is not enough for the full app because the backend handles project data, image upload, labeling files, training jobs, and model listing.

Use GitHub Codespaces for online testing.

## Start the web app

1. Open the repository on GitHub.
2. Click **Code**.
3. Click **Codespaces**.
4. Click **Create codespace on main**.
5. Wait until setup finishes.
6. The dev container will run `bash run_codespaces.sh` automatically.
7. Open the **Ports** tab.
8. Open port **8000**, labeled **VisionHub Web**.

The forwarded URL will look similar to:

```text
https://<codespace-name>-8000.app.github.dev
```

Send that URL to ChatGPT for UI review.

## Make the port public

By default, the forwarded port can be private. To share it:

1. Open the **Ports** tab.
2. Right-click port **8000**.
3. Select **Port Visibility**.
4. Select **Public**.
5. Copy the forwarded URL.

## Important notes

- Codespaces is good for UI testing, uploads, labeling, API checks, and small demo data.
- Do not use Codespaces for large YOLO training jobs.
- Real YOLO training should run on a local GPU PC, Google Colab, RunPod, Vast.ai, or an internal GPU server.
- Runtime data is stored inside `backend/data`. Codespaces storage is not intended as permanent production storage.
