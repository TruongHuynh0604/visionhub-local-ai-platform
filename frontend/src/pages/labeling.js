import { state, setProject, setTask, setStorageMode } from '../state.js';
import { Topbar } from '../components/topbar.js';
import { LabelingCanvas } from '../labeling/canvas.js';
import { ClassPanel, BoxList } from '../labeling/classes.js';
import {
  LOCAL_PROJECT_ID,
  listLocalImages,
  readLocalClasses,
  readLocalClassification,
  reconnectLocalRootFolder,
  writeLocalClassification,
} from '../local/file-system.js';

let canvasTool = null;
let lastBoxes = [];
let lastSelected = null;
let clsValue = null;
let localLabelingStatus = '';

export async function LabelingPage() {
  setStorageMode('local');
  setProject(LOCAL_PROJECT_ID);
  await loadLocalProjectData(false);

  return `
    ${Topbar('Labeling', 'Local-only YOLO labeling. Images and labels are read/written directly from your selected PC folder.')}
    <div class="labeling-layout">
      <aside class="card pad stack">
        <h3>Storage</h3>
        <div class="mode-banner"><strong>Local PC folder only</strong><br>${escapeHtml(state.localRootName || localLabelingStatus || 'Reconnect required')}<br><span class="muted">Server save/upload is disabled.</span></div>
        <div class="row">
          <button id="reconnectLocalBtn" class="btn small primary">Reconnect folder</button>
          <a href="#/datasets" class="btn small">Folder setup</a>
        </div>

        <h3>Dataset</h3>
        ${projectSelectHtml()}
        <select id="taskSelect" class="select"><option ${state.currentTask === 'Detection' ? 'selected' : ''}>Detection</option><option ${state.currentTask === 'Classification' ? 'selected' : ''}>Classification</option></select>
        <div class="mode-banner"><strong>${state.currentTask}</strong><br>${state.currentTask === 'Detection' ? 'Draw, move, 8-point resize, group move, copy, delete, class menu, OK/NG toggle and auto-save YOLO txt.' : 'BBox tools are disabled. Select one image-level class.'}</div>
        <h3>Images</h3>
        <div class="image-list">${imageListHtml()}</div>
      </aside>
      <main class="canvas-wrap card">
        <canvas id="labelCanvas"></canvas>
        <div class="canvas-help">Detection: drag blank area draw • wheel zoom • middle mouse/Alt+drag pan • Ctrl+click multi-select • Ctrl+A select all • Space labels • right-click toggles _OK/_NG • ↓/C/X on box</div>
      </main>
      <aside class="card pad tool-panel">
        <h3>Classes</h3>
        <div id="classPanel"></div>
        <div id="classificationPanel"></div>
        <h3>Objects</h3>
        <div id="boxList"></div>
        <div class="row">
          <button id="saveBtn" class="btn primary">Save local now</button>
          <span id="saveStatus" class="muted">Ready</span>
        </div>
      </aside>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function loadLocalProjectData(requestPermission = false) {
  localLabelingStatus = '';
  try {
    const result = await reconnectLocalRootFolder({ requestPermission });
    if (!result || result.permission !== 'granted') {
      state.localFsReady = false;
      state.localRootHandle = null;
      state.classes = [];
      state.images = [];
      localLabelingStatus = result ? `Folder permission is ${result.permission}. Click Reconnect folder.` : 'No local folder selected. Go to Datasets and select a folder.';
      return;
    }
    state.localRootHandle = result.handle;
    state.localRootName = result.handle.name;
    state.localFsReady = true;
    setProject(LOCAL_PROJECT_ID);
    state.classes = await readLocalClasses(result.handle);
    state.images = await listLocalImages(result.handle);
    state.currentImageIndex = Math.min(state.currentImageIndex, Math.max(0, state.images.length - 1));
    localLabelingStatus = `Connected: ${result.handle.name}`;
  } catch (err) {
    state.localFsReady = false;
    state.classes = [];
    state.images = [];
    localLabelingStatus = `Local folder error: ${err.message || err}`;
    console.error('[local-fs] labeling load failed', err);
  }
}

function projectSelectHtml() {
  return `<select id="projectSelect" class="select"><option value="${LOCAL_PROJECT_ID}" selected>Local PC folder: ${escapeHtml(state.localRootName || 'not connected')}</option></select>`;
}

function imageListHtml() {
  if (!state.images.length) {
    return `<div class="empty">${escapeHtml(localLabelingStatus || 'No images found. Put image files into the selected folder /images, then reconnect or refresh.')}</div>`;
  }
  return state.images.map((img, i) => `
    <button class="image-item ${i === state.currentImageIndex ? 'active' : ''}" data-image-index="${i}">
      <img class="image-thumb" src="${img.url}" />
      <span><b>${img.filename}</b><br><span class="muted">${img.width || '?'} × ${img.height || '?'}</span></span>
    </button>`).join('');
}

export function bindLabelingPage(refresh) {
  document.getElementById('reconnectLocalBtn')?.addEventListener('click', async () => {
    setStorageMode('local');
    setProject(LOCAL_PROJECT_ID);
    await loadLocalProjectData(true);
    await refresh();
  });

  document.getElementById('projectSelect')?.addEventListener('change', async () => {
    setStorageMode('local');
    setProject(LOCAL_PROJECT_ID);
    state.currentImageIndex = 0;
    await refresh();
  });

  document.getElementById('taskSelect')?.addEventListener('change', async e => { setTask(e.target.value); await refresh(); });
  document.querySelectorAll('[data-image-index]').forEach(btn => btn.addEventListener('click', async () => {
    state.currentImageIndex = Number(btn.dataset.imageIndex); await refresh();
  }));

  const canvas = document.getElementById('labelCanvas');
  if (canvas && state.localFsReady && state.images[state.currentImageIndex]) {
    canvasTool = new LabelingCanvas(canvas, {
      classes: state.classes,
      onChange: (boxes, selectedId) => { lastBoxes = boxes; lastSelected = selectedId; renderSidePanels(); },
      onSaved: () => { const s = document.getElementById('saveStatus'); if (s) s.textContent = `Saved local ${new Date().toLocaleTimeString()}`; },
    });
    canvasTool.activeClassId = 0;
    canvasTool.load(LOCAL_PROJECT_ID, state.images[state.currentImageIndex], state.currentTask).then(async () => {
      if (state.currentTask === 'Classification') await loadClassificationValue();
      renderSidePanels();
    }).catch(err => {
      console.error('[labeling] canvas load failed', err);
      const s = document.getElementById('saveStatus'); if (s) s.textContent = 'Load failed';
    });
  } else {
    lastBoxes = [];
    lastSelected = null;
    setTimeout(renderSidePanels, 0);
  }

  document.getElementById('saveBtn')?.addEventListener('click', async () => {
    if (!state.localFsReady) return alert('Reconnect local folder first.');
    if (state.currentTask === 'Detection') await canvasTool?.save();
    else await saveClassificationValue();
  });
}

async function loadClassificationValue() {
  const img = state.images[state.currentImageIndex];
  if (!img || !state.localRootHandle) return;
  clsValue = await readLocalClassification(state.localRootHandle, img.filename);
}

async function saveClassificationValue() {
  const img = state.images[state.currentImageIndex];
  if (!img || !state.localRootHandle) return;
  await writeLocalClassification(state.localRootHandle, img.filename, clsValue);
  const s = document.getElementById('saveStatus'); if (s) s.textContent = `Saved local ${new Date().toLocaleTimeString()}`;
}

function renderSidePanels() {
  const classPanel = document.getElementById('classPanel');
  const boxList = document.getElementById('boxList');
  const clsPanel = document.getElementById('classificationPanel');
  if (!classPanel || !boxList || !clsPanel) return;

  if (!state.classes.length) {
    classPanel.innerHTML = '<div class="empty">No classes. Open Datasets, select a local folder, then edit classes.txt.</div>';
    boxList.innerHTML = '<div class="empty">No local image loaded.</div>';
    clsPanel.innerHTML = '';
    return;
  }

  if (state.currentTask === 'Detection') {
    clsPanel.innerHTML = '';
    classPanel.innerHTML = ClassPanel(state.classes, canvasTool?.activeClassId ?? 0, lastSelected, id => canvasTool?.setActiveClass(id));
    boxList.innerHTML = BoxList(lastBoxes, state.classes, lastSelected, id => canvasTool?.selectBox(id), id => canvasTool?.deleteBox(id));
  } else {
    classPanel.innerHTML = '<div class="mode-banner">Image-level selector is active. Detection tools are disabled.</div>';
    boxList.innerHTML = '<div class="empty">No detection boxes in classification mode.</div>';
    clsPanel.innerHTML = `<div class="class-list">${state.classes.map((name, i) => `<button class="class-chip ${clsValue === i ? 'active' : ''}" data-cls-id="${i}">${i}. ${name}<span>${clsValue === i ? 'Selected' : ''}</span></button>`).join('')}</div>`;
    setTimeout(() => document.querySelectorAll('[data-cls-id]').forEach(btn => btn.addEventListener('click', async () => { clsValue = Number(btn.datasetClsId || btn.dataset.clsId); renderSidePanels(); await saveClassificationValue(); })), 0);
  }
}
