import { state, setProject, setStorageMode } from '../state.js';
import { Topbar } from '../components/topbar.js';
import {
  getActiveLocalProjectId,
  getLocalProjectSummary,
  isFileSystemAccessSupported,
  listLocalProjects,
  reconnectLocalRootFolder,
  setActiveLocalProjectId,
} from '../local/file-system.js';

let localProjects = [];
let localSummary = null;
let localStatus = '';

export async function TrainingPage() {
  setStorageMode('local');
  try {
    await loadLocalTrainingInfo(false);
  } catch (err) {
    console.error('[training] local page load failed', err);
    localStatus = `Local training page failed: ${err.message || err}`;
  }

  return `
    ${Topbar('Training', 'Local-only YOLO training preparation. Data stays on your PC workspace. Browser prepares scripts; Python training runs on your PC.')}
    <div class="grid two">
      <section class="card pad stack">
        <h2>Local training package</h2>
        <p class="muted">VisionHub no longer starts training on Render/server. This page creates <b>Train_local.py</b>, <b>data.yaml</b> and <b>README_TRAINING.md</b> inside the selected local project folder. Run the script on your PC to train with local data.</p>
        ${capabilityHtml()}
        ${projectSelectHtml()}
        <select id="task" class="select"><option value="detect">Detection</option></select>
        <input id="model" class="input" value="yolo11n.pt" placeholder="model, e.g. yolo11n.pt or D:/models/best.pt" />
        <div class="grid two"><input id="epochs" class="input" type="number" value="30" /><input id="imgsz" class="input" type="number" value="640" /></div>
        <div class="grid two"><input id="batch" class="input" type="number" value="8" /><input id="workers" class="input" type="number" value="2" /></div>
        <input id="device" class="input" placeholder="device, empty/cpu/0" />
        <button id="prepareTrainingBtn" class="btn primary">Prepare local Train.py + data.yaml</button>
        <a class="btn" href="#/datasets">Open Datasets</a>
      </section>

      <section class="card pad stack">
        <h2>Current local project</h2>
        ${projectSummaryHtml()}
        <h3>How to run on PC</h3>
        <pre class="code">cd /d YOUR_WORKSPACE\\projects\\${escapeHtml(activeProjectId() || 'project-id')}
pip install ultralytics
python Train_local.py</pre>
        <p class="muted">The generated Python script exports YOLO structure under <b>exports/yolo_train</b>, then trains into <b>runs/train</b>. Images and labels are never uploaded to Render/GitHub.</p>
      </section>
    </div>
    <section class="card pad" style="margin-top:16px">
      <h2>Local training log</h2>
      <pre id="trainingLocalLog" class="code log-box">${escapeHtml(localStatus || 'Reconnect/select a local workspace first.')}</pre>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function activeProjectId() {
  return state.selectedProjectId || getActiveLocalProjectId();
}

async function loadLocalTrainingInfo(requestPermission = false) {
  localProjects = [];
  localSummary = null;
  state.projects = [];

  if (!isFileSystemAccessSupported()) {
    localStatus = 'File System Access API is not available. Use Chrome or Edge over HTTPS.';
    return;
  }

  const result = await reconnectLocalRootFolder({ requestPermission });
  if (!result) {
    localStatus = 'No local workspace selected. Go to Datasets and select/create a workspace folder first.';
    return;
  }
  if (result.permission !== 'granted') {
    localStatus = `Saved workspace found, but permission is ${result.permission}. Go to Datasets or click Prepare and allow read/write permission.`;
    state.localRootHandle = result.handle;
    state.localFsReady = false;
    return;
  }

  state.localRootHandle = result.handle;
  state.localRootName = result.handle.name;
  state.localFsReady = true;
  localProjects = await listLocalProjects(result.handle);
  state.projects = localProjects;

  const selected = localProjects.find(p => p.id === activeProjectId()) || localProjects[0];
  if (selected) {
    setActiveLocalProjectId(selected.id);
    setProject(selected.id);
    localSummary = await getLocalProjectSummary(result.handle, selected.id);
  }

  localStatus = [
    `Connected workspace: ${result.handle.name}`,
    `Active project: ${localSummary ? `${localSummary.name} (${localSummary.id})` : 'none'}`,
    `Images: ${localSummary?.image_count ?? 0}`,
    `Classes: ${(localSummary?.classes || []).join(', ') || 'none'}`,
    'Training is local-only. This page does not call /api/training or upload data to server.',
  ].join('\n');
}

function capabilityHtml() {
  if (!isFileSystemAccessSupported()) return '<div class="empty">Use Chrome or Edge. This feature needs browser local folder read/write support.</div>';
  return `<div class="mode-banner"><strong>ACTIVE: Local PC training only</strong><br>Workspace: ${escapeHtml(state.localRootName || 'not selected')}<br>Project: ${escapeHtml(localSummary?.name || activeProjectId())}<br><span class="muted">Render/GitHub only serves the UI. YOLO training runs on your PC.</span></div>`;
}

function projectSelectHtml() {
  if (!localProjects.length) return '<div class="empty">No local project found. Go to Datasets → Create local project.</div>';
  return `
    <label class="muted">Active local project</label>
    <select id="projectSelect" class="select">
      ${localProjects.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === activeProjectId() ? 'selected' : ''}>${escapeHtml(p.name)} — ${escapeHtml(p.id)}</option>`).join('')}
    </select>`;
}

function projectSummaryHtml() {
  if (!localSummary) return '<div class="empty">No active local project. Open Datasets and create/select one.</div>';
  return `<table class="table"><tbody>
    <tr><td><b>Name</b></td><td>${escapeHtml(localSummary.name)}</td></tr>
    <tr><td><b>ID</b></td><td><code>${escapeHtml(localSummary.id)}</code></td></tr>
    <tr><td><b>Images</b></td><td>${localSummary.image_count}</td></tr>
    <tr><td><b>Classes</b></td><td>${localSummary.classes.map(escapeHtml).join(', ')}</td></tr>
    <tr><td><b>Image folder</b></td><td><code>projects/${escapeHtml(localSummary.id)}/images</code></td></tr>
    <tr><td><b>Label folder</b></td><td><code>projects/${escapeHtml(localSummary.id)}/labels/detection</code></td></tr>
  </tbody></table>`;
}

export function bindTrainingPage(refresh) {
  document.getElementById('projectSelect')?.addEventListener('change', async e => {
    setActiveLocalProjectId(e.target.value);
    setProject(e.target.value);
    await refresh();
  });

  document.getElementById('prepareTrainingBtn')?.addEventListener('click', async () => {
    const log = document.getElementById('trainingLocalLog');
    try {
      if (log) log.textContent = 'Preparing local training files...';
      await loadLocalTrainingInfo(true);
      if (!state.localRootHandle || !state.localFsReady) throw new Error('Reconnect local workspace and allow read/write permission first.');
      const projectId = activeProjectId();
      if (!projectId) throw new Error('Create/select local project first.');
      const options = {
        model: document.getElementById('model').value.trim() || 'yolo11n.pt',
        epochs: Number(document.getElementById('epochs').value || 30),
        imgsz: Number(document.getElementById('imgsz').value || 640),
        batch: Number(document.getElementById('batch').value || 8),
        workers: Number(document.getElementById('workers').value || 2),
        device: document.getElementById('device').value.trim(),
      };
      const result = await createLocalTrainingFiles(state.localRootHandle, projectId, options);
      if (log) log.textContent = result.message;
      console.info('[training] local training package prepared', result);
    } catch (err) {
      console.error('[training] prepare local training failed', err);
      if (log) log.textContent = `ERROR: ${err.message || err}`;
    }
  });
}

async function requestReadWritePermission(handle) {
  if (!handle) return false;
  if (!handle.queryPermission || !handle.requestPermission) return true;
  let permission = await handle.queryPermission({ mode: 'readwrite' });
  if (permission === 'granted') return true;
  permission = await handle.requestPermission({ mode: 'readwrite' });
  return permission === 'granted';
}

async function getDirectoryByPath(rootHandle, path, create = true) {
  const parts = path.split('/').filter(Boolean);
  let dir = rootHandle;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

async function readTextFileFromDir(dirHandle, fileName, fallback = '') {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return fallback;
  }
}

async function writeTextFileToDir(dirHandle, fileName, text) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function countProjectImages(projectDir) {
  const imagesDir = await getDirectoryByPath(projectDir, 'images', true);
  let count = 0;
  for await (const [name, handle] of imagesDir.entries()) {
    if (handle.kind === 'file' && /\.(jpg|jpeg|png|bmp|webp|gif|tif|tiff)$/i.test(name)) count += 1;
  }
  return count;
}

async function createLocalTrainingFiles(rootHandle, projectId, options) {
  const ok = await requestReadWritePermission(rootHandle);
  if (!ok) throw new Error('Read/write permission was not granted.');

  const projectDir = await getDirectoryByPath(rootHandle, `projects/${projectId}`, true);
  await getDirectoryByPath(projectDir, 'images', true);
  await getDirectoryByPath(projectDir, 'labels/detection', true);
  await getDirectoryByPath(projectDir, 'exports', true);
  await getDirectoryByPath(projectDir, 'runs', true);

  const imageCount = await countProjectImages(projectDir);
  if (imageCount === 0) throw new Error(`No images found in /projects/${projectId}/images. Upload images in Datasets first.`);

  const classesText = await readTextFileFromDir(projectDir, 'classes.txt', 'OK\nNG\n');
  const classes = classesText.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!classes.length) throw new Error('classes.txt is empty. Add at least one class in Datasets or Labeling.');

  const dataYaml = [
    'path: exports/yolo_train',
    'train: images/train',
    'val: images/val',
    'names:',
    ...classes.map((name, idx) => `  ${idx}: ${JSON.stringify(name)}`),
    '',
  ].join('\n');

  const trainPy = buildTrainScript(classes, options);
  const readme = buildTrainingReadme(projectId, imageCount, classes, options);

  await writeTextFileToDir(projectDir, 'data.yaml', dataYaml);
  await writeTextFileToDir(projectDir, 'Train_local.py', trainPy);
  await writeTextFileToDir(projectDir, 'README_TRAINING.md', readme);

  return {
    projectId,
    imageCount,
    classes,
    files: ['Train_local.py', 'data.yaml', 'README_TRAINING.md'],
    message: [
      `Prepared local YOLO training package for project: ${projectId}`,
      `Images found: ${imageCount}`,
      `Classes: ${classes.join(', ')}`,
      '',
      'Files created inside the project folder:',
      '- Train_local.py',
      '- data.yaml',
      '- README_TRAINING.md',
      '',
      'Run on your PC:',
      `cd /d YOUR_WORKSPACE\\projects\\${projectId}`,
      'pip install ultralytics',
      'python Train_local.py',
      '',
      'No data was uploaded to Render/GitHub/server.',
    ].join('\n'),
  };
}

function buildTrainScript(classes, options) {
  const model = options.model || 'yolo11n.pt';
  const device = options.device || '';
  return `from pathlib import Path
import json
import random
import shutil
from ultralytics import YOLO

PROJECT = Path(__file__).resolve().parent
SRC_IMAGES = PROJECT / "images"
SRC_LABELS = PROJECT / "labels" / "detection"
EXPORT_DIR = PROJECT / "exports" / "yolo_train"
DATA_YAML = PROJECT / "data.yaml"
RUNS_DIR = PROJECT / "runs"

CLASSES = ${JSON.stringify(classes, null, 2)}
MODEL = ${JSON.stringify(model)}
EPOCHS = ${Number(options.epochs || 30)}
IMGSZ = ${Number(options.imgsz || 640)}
BATCH = ${Number(options.batch || 8)}
WORKERS = ${Number(options.workers || 2)}
DEVICE = ${JSON.stringify(device)}
VAL_RATIO = 0.2
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif", ".tif", ".tiff"}


def copy_one(image_path: Path, image_dst_dir: Path, label_dst_dir: Path):
    image_dst_dir.mkdir(parents=True, exist_ok=True)
    label_dst_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(image_path, image_dst_dir / image_path.name)
    src_label = SRC_LABELS / (image_path.stem + ".txt")
    dst_label = label_dst_dir / (image_path.stem + ".txt")
    if src_label.exists():
        shutil.copy2(src_label, dst_label)
    else:
        dst_label.write_text("", encoding="utf-8")


def prepare_dataset():
    if EXPORT_DIR.exists():
        shutil.rmtree(EXPORT_DIR)

    images = sorted([p for p in SRC_IMAGES.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS])
    if not images:
        raise RuntimeError("No images found in ./images")

    random.seed(42)
    random.shuffle(images)

    if len(images) >= 5:
        val_count = max(1, int(len(images) * VAL_RATIO))
        val_images = images[:val_count]
        train_images = images[val_count:]
    else:
        train_images = images
        val_images = images

    for img in train_images:
        copy_one(img, EXPORT_DIR / "images" / "train", EXPORT_DIR / "labels" / "train")
    for img in val_images:
        copy_one(img, EXPORT_DIR / "images" / "val", EXPORT_DIR / "labels" / "val")

    names_lines = ["names:"] + ["  {}: {}".format(i, repr(name)) for i, name in enumerate(CLASSES)]
    yaml_text = "\n".join([
        "path: " + EXPORT_DIR.as_posix(),
        "train: images/train",
        "val: images/val",
        *names_lines,
        "",
    ])
    DATA_YAML.write_text(yaml_text, encoding="utf-8")
    print("Dataset prepared:", EXPORT_DIR)
    print("Train images:", len(train_images), "Val images:", len(val_images))


def main():
    prepare_dataset()
    model = YOLO(MODEL)
    kwargs = dict(
        data=str(DATA_YAML),
        epochs=EPOCHS,
        imgsz=IMGSZ,
        batch=BATCH,
        workers=WORKERS,
        project=str(RUNS_DIR),
        name="train",
        exist_ok=True,
        plots=True,
    )
    if DEVICE:
        kwargs["device"] = DEVICE
    print("Training config:", json.dumps(kwargs, indent=2))
    model.train(**kwargs)
    print("Training completed. Results:", RUNS_DIR / "train")


if __name__ == "__main__":
    main()
`;
}

function buildTrainingReadme(projectId, imageCount, classes, options) {
  return `# VisionHub Local Training

Project: ${projectId}
Images: ${imageCount}
Classes: ${classes.join(', ')}
Model: ${options.model || 'yolo11n.pt'}

## Run on Windows

\`\`\`bat
cd /d <YOUR_WORKSPACE>\\projects\\${projectId}
pip install ultralytics
python Train_local.py
\`\`\`

The script copies local data from:

\`\`\`text
images/
labels/detection/
\`\`\`

into YOLO training format:

\`\`\`text
exports/yolo_train/images/train
exports/yolo_train/images/val
exports/yolo_train/labels/train
exports/yolo_train/labels/val
\`\`\`

Training results are saved in:

\`\`\`text
runs/train
\`\`\`

No image, label, model or training data is uploaded to Render/GitHub/server.
`;
}
