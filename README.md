# VisionHub Local AI Platform V2

Local-first Vision AI platform prototype inspired by modern YOLO dataset/training workflows.  
This is **not** an Ultralytics copy and does not use Ultralytics branding/assets. It is built for local development and Codex upgrades.

## Main modules

- **Projects / Datasets**: create local projects, upload images, manage class list.
- **Labeling**: detection bbox labeling with YOLO txt compatibility, keyboard shortcuts, auto-save, stats.
- **Classification**: image-level class selection, saved separately from detection labels.
- **Training**: local training launcher for Ultralytics YOLO if installed, with job log polling.
- **Models**: list local training outputs.
- **Modular code**: each feature is separated into its own file for easier Codex review.

## Quick start Windows

```bat
cd visionhub_local_ai_platform_v2
run_local.bat
```

Then open:

```text
http://127.0.0.1:8000
```

## Quick start Linux/macOS

```bash
cd visionhub_local_ai_platform_v2
chmod +x run_local.sh
./run_local.sh
```

## Install YOLO training support

The UI and API run without Ultralytics installed. For real training:

```bash
pip install ultralytics
```

Then use the **Training** page.

## Data layout

```text
backend/data/projects/<project_id>/
  meta.json
  classes.txt
  images/
  labels/          # YOLO detection txt files
  labels_cls/      # image-level classification txt files
  dataset.yaml     # generated for detection training
  jobs/            # training logs/status
```

## Notes

- Old YOLO txt files are supported because detection labels are read directly from `labels/<image_stem>.txt`.
- Detection labels save in YOLO bbox format: `class_id x_center y_center width height` normalized 0..1.
- Classification labels save as one class id per image in `labels_cls/<image_stem>.txt`.
- This is a local MVP. Authentication, permissions, cloud storage, and production training queue should be added later.
