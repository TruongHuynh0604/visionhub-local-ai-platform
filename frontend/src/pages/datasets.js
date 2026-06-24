import { state, setProject, setStorageMode } from '../state.js';
import { Topbar } from '../components/topbar.js';
import {
  WORKSPACE_STRUCTURE,
  PROJECT_STRUCTURE,
  chooseLocalRootFolder,
  clearSavedRootHandle,
  createLocalProject,
  getActiveLocalProjectId,
  getLocalProjectSummary,
  importLocalImageFiles,
  isFileSystemAccessSupported,
  listLocalProjects,
  reconnectLocalRootFolder,
  setActiveLocalProjectId,
  writeLocalClasses,
} from '../local/file-system.js';

let localSummary = null;
let localProjects = [];
let localStatus = '';
let localImportStatus = '';
let localStructure = null;

export async function DatasetsPage() {
  setStorageMode('local');
  await loadLocalInfo(false);
  return `
    ${Topbar('Datasets', 'Local-only multi-project workspace. Images and labels stay on your PC folder; Render/GitHub stores source code only.')}
    <div class="grid two">
      <section class="card pad stack">
        <h2>Local PC workspace</h2>
        <p class="muted">Select one root folder on your PC. Inside it, VisionHub can manage many AI projects under <b>/projects/&lt;project-id&gt;</b>. Each project has its own images, labels and classes.txt.</p>
        ${localCapabilityHtml()}
        <div class="row">
          <button id="chooseLocalFolderBtn" class="btn primary">Select / create workspace folder</button>
          <button id="reconnectLocalFolderBtn" class="btn">Reconnect</button>
          <button id="clearLocalFolderBtn" class="btn danger">Forget folder</button>
        </div>
        <div class="row">
          <input id="newLocalProjectName" class="input" placeholder="New project name, e.g. Camera6_Top_Pin" style="max-width:320px">
          <button id="createLocalProjectBtn" class="btn primary">Create local project</button>
        </div>
        ${projectPickerHtml()}
        <div class="row">
          <button id="importImageFilesBtn" class="btn primary">Upload images to selected local project</button>
          <button id="importImageFolderBtn" class="btn">Upload image folder</button>
          <input id="localImageFilesInput" type="file" multiple accept="image/*,.jpg,.jpeg,.png,.bmp,.webp,.gif,.tif,.tiff" hidden>
          <input id="localImageFolderInput" type="file" multiple webkitdirectory hidden>
        </div>
        <div id="localFolderStatus" class="code">${escapeHtml(localStatus || 'No local folder selected yet.')}</div>
        ${localClassesEditorHtml()}
      </section>

      <section class="card pad stack">
        <h2>Required local structure</h2>
        <p class="muted">After selecting a workspace/project, VisionHub checks and creates missing folders/files automatically.</p>
        ${requiredStructureHtml()}
      </section>
    </div>

    <section class="card pad" style="margin-top:16px">
      <h2>Local projects</h2>
      ${projectsTable()}
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function activeProjectId() {
  return state.selectedProjectId || getActiveLocalProjectId();
}

async function loadLocalInfo(requestPermission = false) {
  localSummary = null;
  localProjects = [];
  localStructure = null;
  state.projects = [];
  setStorageMode('local');

  if (!isFileSystemAccessSupported()) {
    localStatus = 'File System Access API is not available. Use Chrome or Edge over HTTPS.';
    return;
  }

  try {
    const result = await reconnectLocalRootFolder({ requestPermission });
    if (!result) {
      localStatus = 'No saved local workspace. Click Select / create workspace folder.';
      state.localFsReady = false;
      return;
    }
    if (result.permission !== 'granted') {
      localStatus = `Saved folder found, but permission is ${result.permission}. Click Reconnect and allow read/write permission.`;
      state.localFsReady = false;
      return;
    }

    state.localRootHandle = result.handle;
    state.localRootName = result.handle.name;
    state.localFsReady = true;
    localStorage.setItem('vh_local_root_name', result.handle.name);
    localStructure = result.structure;

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
      `Images in active project: ${localSummary?.image_count ?? 0}`,
      `Classes: ${(localSummary?.classes || []).join(', ') || 'none'}`,
      `Folders created now: ${result.structure.created.length ? result.structure.created.join(', ') : 'none'}`,
      `Files created now: ${result.structure.filesCreated.length ? result.structure.filesCreated.join(', ') : 'none'}`,
      localImportStatus,
      'Upload buttons copy images into the selected local project only: /projects/<project-id>/images.',
      'Detection labels are saved into /projects/<project-id>/labels/detection as YOLO .txt files.',
      'No images, labels, exports, logs or training data are uploaded to the server.',
    ].filter(Boolean).join('\n');
  } catch (err) {
    localStatus = `Local folder check failed: ${err.message || err}`;
    state.localFsReady = false;
    console.error('[local-fs] dataset page load failed', err);
  }
}

function localCapabilityHtml() {
  if (!isFileSystemAccessSupported()) {
    return `<div class="empty">This browser does not support local folder read/write. Use Chrome or Edge.</div>`;
  }
  return `<div class="mode-banner"><strong>ACTIVE: Local PC multi-project storage only</strong><br>Workspace: ${escapeHtml(state.localRootName || 'not selected')}<br>Project: ${escapeHtml(localSummary?.name || activeProjectId())}<br><span class="muted">Server upload/project creation is disabled. Upload buttons copy images into your selected local project folder only.</span></div>`;
}

function projectPickerHtml() {
  if (!localProjects.length) return '';
  return `
    <div class="stack">
      <h3>Active local project</h3>
      <select id="activeLocalProjectSelect" class="select">
        ${localProjects.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === activeProjectId() ? 'selected' : ''}>${escapeHtml(p.name)} — ${escapeHtml(p.id)}</option>`).join('')}
      </select>
      <div class="muted">Images go to <b>/projects/${escapeHtml(activeProjectId())}/images</b>. Labels go to <b>/projects/${escapeHtml(activeProjectId())}/labels/detection</b>.</div>
    </div>`;
}

function requiredStructureHtml() {
  const created = new Set(localStructure?.created || []);
  const existing = new Set(localStructure?.existing || []);
  const projectId = activeProjectId();
  const workspaceRows = WORKSPACE_STRUCTURE.map(item => ({
    path: item.path,
    displayPath: item.path,
    description: item.description,
  }));
  const projectRows = PROJECT_STRUCTURE.map(item => ({
    path: `projects/${projectId}/${item.path}`,
    displayPath: `projects/${projectId}/${item.path}`,
    description: item.description,
  }));
  return `<table class="table"><thead><tr><th>Path</th><th>Status</th><th>Purpose</th></tr></thead><tbody>${[...workspaceRows, ...projectRows].map(item => `
    <tr>
      <td><b>${escapeHtml(item.displayPath)}</b></td>
      <td>${created.has(item.path) ? '<span class="badge">Created</span>' : existing.has(item.path) ? '<span class="badge">OK</span>' : '<span class="muted">Auto-check</span>'}</td>
      <td>${escapeHtml(item.description)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function localClassesEditorHtml() {
  if (!localSummary) return '';
  return `
    <div class="stack">
      <h3>Project classes.txt</h3>
      <p class="muted">Class ID = line number. Rename is safe. Reordering/deleting changes class IDs for existing YOLO labels.</p>
      <textarea id="localClasses" class="input" rows="6">${escapeHtml(localSummary.classes.join('\n'))}</textarea>
      <div class="row">
        <input id="quickClassName" class="input" placeholder="Add class name, e.g. Pin1_OK" style="max-width:260px">
        <button id="addLocalClassBtn" class="btn">Add class</button>
      </div>
      <div class="row">
        <button id="saveLocalClassesBtn" class="btn">Save project classes.txt</button>
        <a class="btn primary" href="#/labeling">Open local labeling</a>
      </div>
    </div>`;
}

function projectsTable() {
  if (!localProjects.length) return `<div class="empty">No local project connected yet. Select a local PC workspace first.</div>`;
  return `<table class="table"><thead><tr><th>Name</th><th>Path</th><th>Task</th><th>Images</th><th>Classes</th><th>Action</th></tr></thead><tbody>
    ${localProjects.map(p => `<tr>
      <td><b>${escapeHtml(p.name)}</b><br><span class="muted">${escapeHtml(p.id)}</span></td>
      <td><code>${escapeHtml(p.path)}</code></td>
      <td><span class="badge">${escapeHtml(p.task_type)}</span></td>
      <td>${p.image_count}</td>
      <td>${p.classes.map(escapeHtml).join(', ')}</td>
      <td><button class="btn small use-local-project" data-project-id="${escapeHtml(p.id)}">Use local</button> <a class="btn small" href="#/labeling">Label</a></td>
    </tr>`).join('')}
  </tbody></table>`;
}

async function ensureLocalReadyForImport() {
  await loadLocalInfo(true);
  if (!state.localRootHandle || !state.localFsReady) throw new Error('Select or reconnect a local workspace first.');
  if (!activeProjectId()) throw new Error('Create or select a local project first.');
}

async function handleImageImport(files, refresh) {
  const fileArray = Array.from(files || []);
  if (!fileArray.length) return;
  await ensureLocalReadyForImport();
  const projectId = activeProjectId();
  const statusEl = document.getElementById('localFolderStatus');
  if (statusEl) statusEl.textContent = `Importing ${fileArray.length} file(s) into local project ${projectId}/images...`;
  const result = await importLocalImageFiles(state.localRootHandle, fileArray, projectId);
  localImportStatus = `Last import into ${projectId}: ${result.imported} image(s) copied to /images, ${result.overwritten} overwritten, ${result.skipped} skipped.`;
  console.info('[local-fs] local image import complete', result);
  await refresh();
}

async function saveClassesFromTextarea(refresh) {
  if (!state.localRootHandle) return alert('Reconnect local workspace first.');
  const classes = document.getElementById('localClasses').value.split('\n').map(x => x.trim()).filter(Boolean);
  await writeLocalClasses(state.localRootHandle, classes, activeProjectId());
  console.info('[local-fs] project classes.txt saved', { projectId: activeProjectId(), classes });
  await refresh();
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
      console.info('[local-fs] workspace selected and checked', result.structure);
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

  document.getElementById('clearLocalFolderBtn')?.addEventListener('click', async () => {
    await clearSavedRootHandle();
    state.localRootHandle = null;
    state.localRootName = '';
    state.localFsReady = false;
    state.projects = [];
    localImportStatus = '';
    setStorageMode('local');
    await refresh();
  });

  document.getElementById('activeLocalProjectSelect')?.addEventListener('change', async e => {
    setActiveLocalProjectId(e.target.value);
    setProject(e.target.value);
    state.currentImageIndex = 0;
    await refresh();
  });

  document.getElementById('createLocalProjectBtn')?.addEventListener('click', async () => {
    try {
      await loadLocalInfo(true);
      if (!state.localRootHandle) return alert('Select or reconnect a local workspace first.');
      const input = document.getElementById('newLocalProjectName');
      const name = input.value.trim();
      if (!name) return alert('Enter a project name first.');
      const project = await createLocalProject(state.localRootHandle, name, state.currentTask);
      setActiveLocalProjectId(project.id);
      setProject(project.id);
      input.value = '';
      console.info('[local-fs] local project created', project);
      await refresh();
    } catch (err) {
      console.error('[local-fs] create local project failed', err);
      alert(err.message || err);
    }
  });

  document.getElementById('importImageFilesBtn')?.addEventListener('click', async () => {
    try {
      await ensureLocalReadyForImport();
      const input = document.getElementById('localImageFilesInput');
      input.value = '';
      input.click();
    } catch (err) {
      console.error('[local-fs] image import open failed', err);
      alert(err.message || err);
    }
  });

  document.getElementById('importImageFolderBtn')?.addEventListener('click', async () => {
    try {
      await ensureLocalReadyForImport();
      const input = document.getElementById('localImageFolderInput');
      input.value = '';
      input.click();
    } catch (err) {
      console.error('[local-fs] image folder import open failed', err);
      alert(err.message || err);
    }
  });

  document.getElementById('localImageFilesInput')?.addEventListener('change', async (event) => {
    try {
      await handleImageImport(event.target.files, refresh);
    } catch (err) {
      console.error('[local-fs] image file import failed', err);
      alert(err.message || err);
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('localImageFolderInput')?.addEventListener('change', async (event) => {
    try {
      await handleImageImport(event.target.files, refresh);
    } catch (err) {
      console.error('[local-fs] image folder import failed', err);
      alert(err.message || err);
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('addLocalClassBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('quickClassName');
    const textarea = document.getElementById('localClasses');
    const name = input.value.trim();
    if (!name) return;
    const current = textarea.value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!current.some(x => x.toLowerCase() === name.toLowerCase())) current.push(name);
    textarea.value = current.join('\n');
    input.value = '';
    await saveClassesFromTextarea(refresh);
  });

  document.getElementById('saveLocalClassesBtn')?.addEventListener('click', async () => saveClassesFromTextarea(refresh));

  document.querySelectorAll('.use-local-project').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.projectId;
    setActiveLocalProjectId(id);
    setProject(id);
    state.currentImageIndex = 0;
    await refresh();
  }));
}
