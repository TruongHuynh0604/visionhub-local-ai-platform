import { state, setProject, setTask, setStorageMode } from '../state.js';
import { Topbar } from '../components/topbar.js';
import { LabelingCanvas } from '../labeling/canvas.js';
import { ClassPanel, BoxList } from '../labeling/classes.js';
import {
  getActiveLocalProjectId,
  listLocalImages,
  listLocalProjects,
  readLocalClasses,
  readLocalClassification,
  reconnectLocalRootFolder,
  setActiveLocalProjectId,
  writeLocalClasses,
  writeLocalClassification,
} from '../local/file-system.js';

let canvasTool = null;
let lastBoxes = [];
let lastSelected = null;
let clsValue = null;
let localLabelingStatus = '';

export async function LabelingPage() {
  setStorageMode('local');
  await loadLocalProjectData(false);

  return `
    ${Topbar('Labeling', 'Local-only YOLO labeling. Each AI project has its own /images, /labels and classes.txt inside your selected PC workspace.')}
    <div class="labeling-layout">
      <aside class="card pad stack">
        <h3>Storage</h3>
        <div class="mode-banner"><strong>Local PC workspace only</strong><br>${escapeHtml(state.localRootName || localLabelingStatus || 'Reconnect required')}<br><span class="muted">Server save/upload is disabled.</span></div>
        <div class="row">
          <button id="reconnectLocalBtn" class="btn small primary">Reconnect folder</button>
          <a href="#/datasets" class="btn small">Workspace setup</a>
        </div>

        <h3>Project</h3>
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
        ${classEditorHtml()}
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

function activeProjectId() {
  return state.selectedProjectId || getActiveLocalProjectId();
}

async function loadLocalProjectData(requestPermission = false) {
  localLabelingStatus = '';
  try {
    const result = await reconnectLocalRootFolder({ requestPermission });
    if (!result || result.permission !== 'granted') {
      state.localFsReady = false;
      state.localRootHandle = null;
      state.projects = [];
      state.classes = [];
      state.images = [];
      localLabelingStatus = result ? `Folder permission is ${result.permission}. Click Reconnect folder.` : 'No local folder selected. Go to Datasets and select a workspace folder.';
      return;
    }

    state.localRootHandle = result.handle;
    state.localRootName = result.handle.name;
    state.localFsReady = true;
    state.projects = await listLocalProjects(result.handle);

    const selected = state.projects.find(p => p.id === activeProjectId()) || state.projects[0];
    if (!selected) {
      state.classes = [];
      state.images = [];
      localLabelingStatus = 'No local project. Open Datasets and create a project.';
      return;
    }

    setActiveLocalProjectId(selected.id);
    setProject(selected.id);
    state.classes = await readLocalClasses(result.handle, selected.id);
    state.images = await listLocalImages(result.handle, selected.id);
    state.currentImageIndex = Math.min(state.currentImageIndex, Math.max(0, state.images.length - 1));
    localLabelingStatus = `Connected: ${result.handle.name} / projects/${selected.id}`;
  } catch (err) {
    state.localFsReady = false;
    state.projects = [];
    state.classes = [];
    state.images = [];
    localLabelingStatus = `Local folder error: ${err.message || err}`;
    console.error('[local-fs] labeling load failed', err);
  }
}

function projectSelectHtml() {
  if (!state.projects.length) return `<div class="empty">No project. Open Datasets and create a local project.</div>`;
  return `<select id="projectSelect" class="select">${state.projects.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === activeProjectId() ? 'selected' : ''}>${escapeHtml(p.name)} — ${escapeHtml(p.id)}</option>`).join('')}</select>
  <div class="muted">Current path: <b>/projects/${escapeHtml(activeProjectId())}</b></div>`;
}

function classEditorHtml() {
  if (!state.localFsReady || !state.projects.length) return '';
  return `
    <div class="stack class-editor">
      <p class="muted">Edit project classes while labeling. Class ID = line number. Rename is safe; reordering/deleting changes IDs used by existing YOLO .txt labels.</p>
      <textarea id="labelingClassesText" class="input" rows="5">${escapeHtml(state.classes.join('\n'))}</textarea>
      <div class="row">
        <input id="labelingNewClass" class="input" placeholder="Add class, e.g. Pin1_OK" style="min-width:0">
        <button id="addClassDuringLabelingBtn" class="btn small">Add</button>
      </div>
      <div class="row">
        <button id="saveClassesDuringLabelingBtn" class="btn small primary">Save classes.txt</button>
        <span class="muted">Project: ${escapeHtml(activeProjectId())}</span>
      </div>
    </div>`;
}

function imageListHtml() {
  if (!state.images.length) {
    return `<div class="empty">${escapeHtml(localLabelingStatus || `No images found. Upload images into /projects/${activeProjectId()}/images from Datasets.`)}</div>`;
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
    await loadLocalProjectData(true);
    await refresh();
  });

  document.getElementById('projectSelect')?.addEventListener('change', async (event) => {
    const id = event.target.value;
    setStorageMode('local');
    setActiveLocalProjectId(id);
    setProject(id);
    state.currentImageIndex = 0;
    await refresh();
  });

  document.getElementById('taskSelect')?.addEventListener('change', async e => { setTask(e.target.value); await refresh(); });
  document.querySelectorAll('[data-image-index]').forEach(btn => btn.addEventListener('click', async () => {
    state.currentImageIndex = Number(btn.dataset.imageIndex); await refresh();
  }));

  bindClassEditing(refresh);

  const canvas = document.getElementById('labelCanvas');
  if (canvas && state.localFsReady && state.images[state.currentImageIndex]) {
    canvasTool = new LabelingCanvas(canvas, {
      classes: state.classes,
      onChange: (boxes, selectedId) => { lastBoxes = boxes; lastSelected = selectedId; renderSidePanels(); },
      onSaved: () => { const s = document.getElementById('saveStatus'); if (s) s.textContent = `Saved local ${new Date().toLocaleTimeString()}`; },
    });
    canvasTool.activeClassId = Math.min(canvasTool.activeClassId, Math.max(0, state.classes.length - 1));
    canvasTool.load(activeProjectId(), state.images[state.currentImageIndex], state.currentTask).then(async () => {
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

function bindClassEditing(refresh) {
  const textarea = document.getElementById('labelingClassesText');
  const addInput = document.getElementById('labelingNewClass');

  async function saveClasses() {
    if (!state.localRootHandle) return alert('Reconnect local workspace first.');
    const classes = textarea.value.split('\n').map(x => x.trim()).filter(Boolean);
    state.classes = await writeLocalClasses(state.localRootHandle, classes, activeProjectId());
    textarea.value = state.classes.join('\n');
    canvasTool?.setClasses?.(state.classes);
    const s = document.getElementById('saveStatus');
    if (s) s.textContent = `Classes saved ${new Date().toLocaleTimeString()}`;
    renderSidePanels();
    console.info('[labeling] project classes saved', { projectId: activeProjectId(), classes: state.classes });
  }

  document.getElementById('saveClassesDuringLabelingBtn')?.addEventListener('click', async () => {
    try { await saveClasses(); } catch (err) { console.error('[labeling] save classes failed', err); alert(err.message || err); }
  });

  document.getElementById('addClassDuringLabelingBtn')?.addEventListener('click', async () => {
    try {
      const name = addInput.value.trim();
      if (!name) return;
      const current = textarea.value.split('\n').map(x => x.trim()).filter(Boolean);
      if (!current.some(x => x.toLowerCase() === name.toLowerCase())) current.push(name);
      textarea.value = current.join('\n');
      addInput.value = '';
      await saveClasses();
    } catch (err) {
      console.error('[labeling] add class failed', err);
      alert(err.message || err);
    }
  });
}

async function loadClassificationValue() {
  const img = state.images[state.currentImageIndex];
  if (!img || !state.localRootHandle) return;
  clsValue = await readLocalClassification(state.localRootHandle, img.filename, activeProjectId());
}

async function saveClassificationValue() {
  const img = state.images[state.currentImageIndex];
  if (!img || !state.localRootHandle) return;
  await writeLocalClassification(state.localRootHandle, img.filename, clsValue, activeProjectId());
  const s = document.getElementById('saveStatus'); if (s) s.textContent = `Saved local ${new Date().toLocaleTimeString()}`;
}

function renderSidePanels() {
  const classPanel = document.getElementById('classPanel');
  const boxList = document.getElementById('boxList');
  const clsPanel = document.getElementById('classificationPanel');
  if (!classPanel || !boxList || !clsPanel) return;

  if (!state.classes.length) {
    classPanel.innerHTML = '<div class="empty">No classes. Add classes above, then save classes.txt.</div>';
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
    clsPanel.innerHTML = `<div class="class-list">${state.classes.map((name, i) => `<button class="class-chip ${clsValue === i ? 'active' : ''}" data-cls-id="${i}">${i}. ${escapeHtml(name)}<span>${clsValue === i ? 'Selected' : ''}</span></button>`).join('')}</div>`;
    setTimeout(() => document.querySelectorAll('[data-cls-id]').forEach(btn => btn.addEventListener('click', async () => { clsValue = Number(btn.datasetClsId || btn.dataset.clsId); renderSidePanels(); await saveClassificationValue(); })), 0);
  }
}
