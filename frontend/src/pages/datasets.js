import { api } from '../api.js';
import { state, setProject, setStorageMode } from '../state.js';
import { Topbar } from '../components/topbar.js';
import {
  LOCAL_PROJECT_ID,
  REQUIRED_STRUCTURE,
  chooseLocalRootFolder,
  clearSavedRootHandle,
  getLocalProjectSummary,
  isFileSystemAccessSupported,
  reconnectLocalRootFolder,
  writeLocalClasses,
} from '../local/file-system.js';

let localSummary = null;
let localStatus = '';
let localStructure = null;

export async function DatasetsPage() {
  const data = await api.get('/api/projects');
  state.projects = data.projects;
  await loadLocalInfo(false);
  return `
    ${Topbar('Datasets', 'Create projects, use server storage, or connect a local PC folder for browser labeling.')}
    <div class="grid two">
      <section class="card pad stack">
        <h2>Local PC folder</h2>
        <p class="muted">Recommended for large datasets. Images and labels stay on your PC drive. The web only gets browser permission to the folder you select.</p>
        ${localCapabilityHtml()}
        <div class="row">
          <button id="chooseLocalFolderBtn" class="btn primary">Select / create local data folder</button>
          <button id="reconnectLocalFolderBtn" class="btn">Reconnect</button>
          <button id="useLocalModeBtn" class="btn">Use for labeling</button>
          <button id="clearLocalFolderBtn" class="btn danger">Forget folder</button>
        </div>
        <div id="localFolderStatus" class="code">${escapeHtml(localStatus || 'No local folder selected yet.')}</div>
        ${localClassesEditorHtml()}
      </section>

      <section class="card pad stack">
        <h2>Required local structure</h2>
        <p class="muted">After selecting a folder, VisionHub automatically checks and creates missing child folders/files.</p>
        ${requiredStructureHtml()}
      </section>
    </div>

    <div class="grid two" style="margin-top:16px">
      <section class="card pad stack">
        <h2>Create server project</h2>
        <input id="newProjectName" class="input" placeholder="Project name, e.g. Camera6 Top Inspection" />
        <textarea id="newClasses" rows="7" placeholder="One class per line" class="input">OK\nNG</textarea>
        <select id="newTask" class="select"><option>Detection</option><option>Classification</option></select>
        <button id="createProjectBtn" class="btn primary">Create server project</button>
      </section>
      <section class="card pad stack">
        <h2>Upload images to server</h2>
        ${projectSelectHtml()}
        <input id="imageFiles" class="input" type="file" multiple accept="image/*" />
        <button id="uploadBtn" class="btn primary">Upload selected images</button>
        <div id="uploadStatus" class="muted"></div>
      </section>
    </div>

    <section class="card pad" style="margin-top:16px">
      <h2>Projects</h2>
      ${projectsTable()}
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function loadLocalInfo(requestPermission = false) {
  localSummary = null;
  localStructure = null;
  if (!isFileSystemAccessSupported()) {
    localStatus = 'File System Access API is not available. Use Chrome or Edge over HTTPS.';
    return;
  }
  try {
    const result = await reconnectLocalRootFolder({ requestPermission });
    if (!result) {
      localStatus = 'No saved local folder. Click Select / create local data folder.';
      return;
    }
    if (result.permission !== 'granted') {
      localStatus = `Saved folder found, but permission is ${result.permission}. Click Reconnect and allow read/write permission.`;
      return;
    }
    state.localRootHandle = result.handle;
    state.localRootName = result.handle.name;
    state.localFsReady = true;
    localStorage.setItem('vh_local_root_name', result.handle.name);
    localStructure = result.structure;
    localSummary = await getLocalProjectSummary(result.handle);
    localStatus = [
      `Connected folder: ${result.handle.name}`,
      `Images found: ${localSummary.image_count}`,
      `Classes: ${localSummary.classes.join(', ')}`,
      `Folders created now: ${result.structure.created.length ? result.structure.created.join(', ') : 'none'}`,
      `Files created now: ${result.structure.filesCreated.length ? result.structure.filesCreated.join(', ') : 'none'}`,
      'Put images into /images. Detection labels are saved into /labels/detection as YOLO .txt files.',
    ].join('\n');
  } catch (err) {
    localStatus = `Local folder check failed: ${err.message || err}`;
    console.error('[local-fs] dataset page load failed', err);
  }
}

function localCapabilityHtml() {
  if (!isFileSystemAccessSupported()) {
    return `<div class="empty">This browser does not support local folder read/write. Use Chrome or Edge.</div>`;
  }
  const badge = state.storageMode === 'local' ? 'ACTIVE: Local PC storage' : 'Current: Server storage';
  return `<div class="mode-banner"><strong>${badge}</strong><br>Folder: ${escapeHtml(state.localRootName || 'not selected')}</div>`;
}

function requiredStructureHtml() {
  const created = new Set(localStructure?.created || []);
  const existing = new Set(localStructure?.existing || []);
  return `<table class="table"><thead><tr><th>Path</th><th>Status</th><th>Purpose</th></tr></thead><tbody>${REQUIRED_STRUCTURE.map(item => `
    <tr>
      <td><b>${item.path}</b></td>
      <td>${created.has(item.path) ? '<span class="badge">Created</span>' : existing.has(item.path) ? '<span class="badge">OK</span>' : '<span class="muted">Pending</span>'}</td>
      <td>${item.description}</td>
    </tr>`).join('')}</tbody></table>`;
}

function localClassesEditorHtml() {
  if (!localSummary) return '';
  return `
    <div class="stack">
      <h3>Local classes.txt</h3>
      <textarea id="localClasses" class="input" rows="6">${escapeHtml(localSummary.classes.join('\n'))}</textarea>
      <div class="row">
        <button id="saveLocalClassesBtn" class="btn">Save local classes.txt</button>
        <a class="btn primary" href="#/labeling">Open local labeling</a>
      </div>
    </div>`;
}

function projectSelectHtml() {
  return `<select id="projectSelect" class="select"><option value="">Select server project</option>${state.projects.map(p => `<option value="${p.id}" ${p.id === state.selectedProjectId ? 'selected' : ''}>${p.name} (${p.image_count})</option>`).join('')}</select>`;
}

function projectsTable() {
  const rows = [];
  if (localSummary) {
    rows.push(`
      <tr>
        <td><b>${localSummary.name}</b><br><span class="muted">${LOCAL_PROJECT_ID}</span></td>
        <td><span class="badge">${state.currentTask}</span></td>
        <td>${localSummary.image_count}</td>
        <td>${localSummary.classes.join(', ')}</td>
        <td><button class="btn small use-local-project">Use local</button> <a class="btn small" href="#/labeling">Label</a></td>
      </tr>`);
  }
  rows.push(...state.projects.map(p => `
    <tr>
      <td><b>${p.name}</b><br><span class="muted">${p.id}</span></td>
      <td><span class="badge">${p.task_type}</span></td>
      <td>${p.image_count}</td>
      <td>${p.classes.join(', ')}</td>
      <td><button class="btn small select-project" data-id="${p.id}">Use server</button> <a class="btn small" href="#/labeling" data-labeling="${p.id}">Label</a></td>
    </tr>`));
  if (!rows.length) return `<div class="empty">No project yet. Create a server dataset or select a local PC folder.</div>`;
  return `<table class="table"><thead><tr><th>Name</th><th>Task</th><th>Images</th><th>Classes</th><th>Action</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

export function bindDatasetsPage(refresh) {
  document.getElementById('chooseLocalFolderBtn')?.addEventListener('click', async () => {
    try {
      document.getElementById('localFolderStatus').textContent = 'Opening folder picker...';
      const result = await chooseLocalRootFolder();
      state.localRootHandle = result.handle;
      state.localRootName = result.handle.name;
      state.localFsReady = true;
      setStorageMode('local');
      setProject(LOCAL_PROJECT_ID);
      console.info('[local-fs] folder selected and checked', result.structure);
      await refresh();
    } catch (err) {
      console.error('[local-fs] choose folder failed', err);
      alert(err.message || err);
    }
  });

  document.getElementById('reconnectLocalFolderBtn')?.addEventListener('click', async () => {
    await loadLocalInfo(true);
    await refresh();
  });

  document.getElementById('useLocalModeBtn')?.addEventListener('click', async () => {
    await loadLocalInfo(true);
    if (!state.localRootHandle) return alert('Select or reconnect a local folder first.');
    setStorageMode('local');
    setProject(LOCAL_PROJECT_ID);
    await refresh();
  });

  document.getElementById('clearLocalFolderBtn')?.addEventListener('click', async () => {
    await clearSavedRootHandle();
    state.localRootHandle = null;
    state.localRootName = '';
    state.localFsReady = false;
    setStorageMode('server');
    setProject('');
    await refresh();
  });

  document.getElementById('saveLocalClassesBtn')?.addEventListener('click', async () => {
    if (!state.localRootHandle) return alert('Reconnect local folder first.');
    const classes = document.getElementById('localClasses').value.split('\n').map(x => x.trim()).filter(Boolean);
    await writeLocalClasses(state.localRootHandle, classes);
    console.info('[local-fs] classes.txt saved', classes);
    await refresh();
  });

  document.querySelectorAll('.use-local-project').forEach(btn => btn.addEventListener('click', async () => {
    setStorageMode('local');
    setProject(LOCAL_PROJECT_ID);
    await refresh();
  }));

  document.getElementById('createProjectBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('newProjectName').value.trim();
    const classes = document.getElementById('newClasses').value.split('\n').map(x => x.trim()).filter(Boolean);
    const task_type = document.getElementById('newTask').value;
    if (!name) return alert('Enter project name');
    const project = await api.post('/api/projects', { name, classes, task_type });
    setStorageMode('server');
    setProject(project.id);
    await refresh();
  });

  document.getElementById('projectSelect')?.addEventListener('change', e => { setStorageMode('server'); setProject(e.target.value); });
  document.querySelectorAll('.select-project').forEach(btn => btn.addEventListener('click', async () => { setStorageMode('server'); setProject(btn.dataset.id); await refresh(); }));

  document.getElementById('uploadBtn')?.addEventListener('click', async () => {
    const projectId = document.getElementById('projectSelect').value || state.selectedProjectId;
    const files = [...document.getElementById('imageFiles').files];
    if (!projectId || projectId === LOCAL_PROJECT_ID) return alert('Select a server project first');
    if (!files.length) return alert('Select images');
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    document.getElementById('uploadStatus').textContent = 'Uploading...';
    const res = await api.post(`/api/projects/${projectId}/images`, fd);
    document.getElementById('uploadStatus').textContent = `Uploaded ${res.saved.length} images.`;
    await refresh();
  });
}
