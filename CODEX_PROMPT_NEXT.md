# Codex Upgrade Prompt

You are upgrading `visionhub_local_ai_platform_v2`, a local-first Vision AI dataset/labeling/training platform.

## Current goal

Continue from the existing modular implementation. Do not rewrite everything unless necessary. Keep every feature in separate files and link/import modules clearly.

## Must keep

- Sidebar UI style, with large icons similar in scale to YOLO-style dashboards.
- Local FastAPI backend.
- Static modular frontend served by FastAPI.
- YOLO detection label compatibility.
- Detection labels saved as YOLO txt normalized bbox format.
- Old txt loading support.
- Classification saved separately under `labels_cls`.
- Local training launcher that can call Ultralytics YOLO when installed.

## Upgrade priorities

1. Improve Labeling Canvas
   - Add zoom/pan.
   - Add multi-select.
   - Add undo/redo stack.
   - Add polygon/segmentation adapter without breaking detection.
   - Add classification mode that disables bbox tools.

2. Improve Training
   - Add train/val split controls.
   - Add export preview.
   - Add confusion matrix and metrics loader from `runs`.
   - Add stop job endpoint.
   - Add GPU/device selector.

3. Improve Dataset Management
   - Add image search/filter.
   - Add class statistics by image and by object count.
   - Add import/export zip.
   - Add dataset versioning.

4. Refactor architecture
   - Keep adapters:
     - `DetectionLabelAdapter`
     - `ClassificationLabelAdapter`
     - future `SegmentationLabelAdapter`
   - Keep UI components small.
   - Keep API services small.

## Coding rules

- One feature per file when practical.
- No hardcoded Windows-only paths inside app code.
- Maintain backward-compatible YOLO txt format.
- Do not copy protected Ultralytics assets, icons, text, logo, or branding.
- Use `VisionHub` or neutral factory vision naming.
