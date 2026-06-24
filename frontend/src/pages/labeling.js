import { api } from '../api.js';
import { state, setProject, setTask } from '../state.js';
import { Topbar } from '../components/topbar.js';
import { LabelingCanvas } from '../labeling/canvas.js';
import { ClassPanel, BoxList } from '../labeling/classes.js';

let canvasTool = null;
let lastBoxes = [];
let lastSelected = null;
let clsValue = null;

export async function LabelingPage() {
  const projects = await api.get('/api/projects');
  state.projects = projects.projects;
  if (!state.selectedProjectId && state.projects[0]) setProject(state.projects[0].id);
  await loadProjectData();
  return `
    ${Topbar('Labeling', 'Detection bbox labeling and classification mode for image-level labels.')}
    <div class="labeling-layout">
      <aside class="card pad stack">
        <h3>Dataset</h3>
        <select id="projectSelect" class="select"><option value="">Select project</option>${state.projects.map(p => `<option value="${p.id}" ${p.id === state.selectedProjectId ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
        <select id="taskSelect" class="select"><option ${state.currentTask === 'Detection' ? 'selected' : ''}>Detection</option><option ${state.currentTask === 'Classification' ? 'selected' : ''}>Classification</option></select>
        <div class="mode-banner"><strong>${state.currentTask}</strong><br>${state.currentTask === 'Detection' ? 'Draw, move, resize, delete, copy and change class. Auto-save YOLO txt.' : 'BBox tools are disabled. Select one image-level class.'}</div>
        <h3>Images</h3>
        <div class="image-list">${imageListHtml()}</div>
      </aside>
      <main class="canvas-wrap card">
        <canvas id="labelCanvas"></canvas>
        <div class="canvas-help">Detection: drag blank area to draw • drag box to move • drag corner to resize • Del delete • Ctrl+C/V copy-paste • number key set class</div>
      </main>
      <aside class="card pad tool-panel">
        <h3>Classes</h3>
        <div id="classPanel"></div>
        <div id="classificationPanel"></div>
        <h3>Objects</h3>
        <div id="boxList"></div>
        <div class="row">
          <button id="saveBtn" class="btn primary">Save now</button>
          <span id="saveStatus" class="muted">Ready</span>
        </div>
      </aside>
    </div>
  `;
}

async function loadProjectData() {
  if (!state.selectedProjectId) { state.classes = []; state.images = []; return; }
  const [cls, img] = await Promise.all([
    api.get(`/api/projects/${state.selectedProjectId}/classes`),
    api.get(`/api/projects/${state.selectedProjectId}/images`),
  ]);
  state.classes = cls.classes;
  state.images = img.images;
  state.currentImageIndex = Math.min(state.currentImageIndex, Math.max(0, state.images.length - 1));
}

function imageListHtml() {
  if (!state.images.length) return '<div class="empty">Upload images in Datasets first.</div>';
  return state.images.map((img, i) => `
    <button class="image-item ${i === state.currentImageIndex ? 'active' : ''}" data-image-index="${i}">
      <img class="image-thumb" src="${img.url}" />
      <span><b>${img.filename}</b><br><span class="muted">${img.width || '?'} × ${img.height || '?'}</span></span>
    </button>`).join('');
}

export function bindLabelingPage(refresh) {
  document.getElementById('projectSelect')?.addEventListener('change', async e => { setProject(e.target.value); state.currentImageIndex = 0; await refresh(); });
  document.getElementById('taskSelect')?.addEventListener('change', async e => { setTask(e.target.value); await refresh(); });
  document.querySelectorAll('[data-image-index]').forEach(btn => btn.addEventListener('click', async () => {
    state.currentImageIndex = Number(btn.dataset.imageIndex); await refresh();
  }));

  const canvas = document.getElementById('labelCanvas');
  if (canvas && state.selectedProjectId && state.images[state.currentImageIndex]) {
    canvasTool = new LabelingCanvas(canvas, {
      classes: state.classes,
      onChange: (boxes, selectedId) => { lastBoxes = boxes; lastSelected = selectedId; renderSidePanels(); },
      onSaved: () => { const s = document.getElementById('saveStatus'); if (s) s.textContent = `Saved ${new Date().toLocaleTimeString()}`; },
    });
    canvasTool.activeClassId = 0;
    canvasTool.load(state.selectedProjectId, state.images[state.currentImageIndex], state.currentTask).then(async () => {
      if (state.currentTask === 'Classification') await loadClassificationValue();
      renderSidePanels();
    });
  }

  document.getElementById('saveBtn')?.addEventListener('click', async () => {
    if (state.currentTask === 'Detection') await canvasTool?.save();
    else await saveClassificationValue();
  });
}

async function loadClassificationValue() {
  const img = state.images[state.currentImageIndex];
  const res = await api.get(`/api/projects/${state.selectedProjectId}/images/${encodeURIComponent(img.filename)}/classification`);
  clsValue = res.class_id;
}

async function saveClassificationValue() {
  const img = state.images[state.currentImageIndex];
  await api.put(`/api/projects/${state.selectedProjectId}/images/${encodeURIComponent(img.filename)}/classification`, { class_id: clsValue });
  const s = document.getElementById('saveStatus'); if (s) s.textContent = `Saved ${new Date().toLocaleTimeString()}`;
}

function renderSidePanels() {
  const classPanel = document.getElementById('classPanel');
  const boxList = document.getElementById('boxList');
  const clsPanel = document.getElementById('classificationPanel');
  if (!classPanel || !boxList || !clsPanel) return;

  if (state.currentTask === 'Detection') {
    clsPanel.innerHTML = '';
    classPanel.innerHTML = ClassPanel(state.classes, canvasTool?.activeClassId ?? 0, lastSelected, id => canvasTool?.setActiveClass(id));
    boxList.innerHTML = BoxList(lastBoxes, state.classes, lastSelected, id => canvasTool?.selectBox(id), id => canvasTool?.deleteBox(id));
  } else {
    classPanel.innerHTML = '<div class="mode-banner">Image-level selector is active. Detection tools are disabled.</div>';
    boxList.innerHTML = '<div class="empty">No detection boxes in classification mode.</div>';
    clsPanel.innerHTML = `<div class="class-list">${state.classes.map((name, i) => `<button class="class-chip ${clsValue === i ? 'active' : ''}" data-cls-id="${i}">${i}. ${name}<span>${clsValue === i ? 'Selected' : ''}</span></button>`).join('')}</div>`;
    setTimeout(() => document.querySelectorAll('[data-cls-id]').forEach(btn => btn.addEventListener('click', async () => { clsValue = Number(btn.dataset.clsId); renderSidePanels(); await saveClassificationValue(); })), 0);
  }
}
