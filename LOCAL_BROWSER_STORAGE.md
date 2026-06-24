# VisionHub Local Browser Storage

This mode uses the browser File System Access API so the web UI can label images while data remains on the user's PC drive.

## Browser requirement

Use Chrome or Edge on HTTPS. Render works because the site is served over HTTPS.

## Folder selection flow

1. Open VisionHub.
2. Go to `Datasets`.
3. Click `Select / create local data folder`.
4. Pick or create a folder on the PC drive, for example `D:\\VisionHub_Data`.
5. Allow read/write permission.

VisionHub then automatically checks and creates missing folders/files.

## Auto-created structure

```text
VisionHub_Data/
  images/                  Put original images here
  labels/
    detection/             YOLO .txt labels are saved here
    classification/        Classification labels.json is saved here
  projects/
  exports/
  models/
  runs/
  logs/
  trash/
  tmp/
  classes.txt              One class per line
  project.json             Local project metadata
```

## Labeling workflow

1. Put images into `VisionHub_Data/images`.
2. Refresh the web page or click `Reconnect folder`.
3. Go to `Labeling`.
4. Choose `Local PC` mode.
5. Draw detection boxes.
6. Labels auto-save to:

```text
VisionHub_Data/labels/detection/<image_name>.txt
```

The label format is YOLO normalized format:

```text
class_id x_center y_center width height
```

## Classification mode

In `Labeling`, select task `Classification`.

The web saves image-level labels to:

```text
VisionHub_Data/labels/classification/labels.json
```

## Notes

- The web cannot access any local folder until the user selects it and grants permission.
- The browser may ask for permission again after reopening the website.
- This mode is for labeling and local data safety. Real YOLO training should still run on local GPU/cloud GPU later.
