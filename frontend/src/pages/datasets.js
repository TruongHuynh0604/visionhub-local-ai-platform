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
  setStorageMode('local');
  setProject(LOCAL_PROJECT_ID);
  await loadLocalInfo(false);
  return `
    ${Topbar('Datasets', 'Local-only dataset workspace. Images and labels stay on your PC folder; Render/GitHub stores source code only.')}
    <div class="grid two">
      <section class="card pad stack">
        <h2>Local PC folder</h2>
        <p class="muted">Recommended for YOLO datasets. Select one folder on your PC. VisionHub will create missing subfolders and save labels directly to that folder through the browser File System Access API.</p>
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
        <p class="muted">After selecting a folder, VisionHub checks and creates missing folders/files automatically.</p>
        ${requiredStructureHtml()}
      </section>
    </div>

    <section class="card pad" style="margin-top:16px">
      <h2>Local project</h2>
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
  state.projects = [];
  setStorageMode('local');
  setProject(LOCAL_PROJECT_ID);

  if (!isFileSystemAccessSupported()) {
    localStatus = 'File System Access API is not available. Use Chrome or Edge over HTTPS.';
    return;
  }

  try {
    const result = await reconnectLocalRootFolder({ requestPermission });
    if (!result) {
      localStatus = 'No saved local folder. Click Select / create local data folder.';
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
    localSummary = await getLocalProjectSummary(result.handle);
    localStatus = [
      `Connected folder: ${result.handle.name}`,
      `Images found: ${localSummary.image_count}`,
      `Classes: ${localSummary.classes.join(', ')}`,
      `Folders created now: ${result.structure.created.length ? result.structure.created.join(', ') : 'none'}`,
      `Files created now: ${result.structure.filesCreated.length ? result.structure.filesCreated.join(', ') : 'none'}`,
      'Put images into /images. Detection labels are saved into /labels/detection as YOLO .txt files.',
      'No images, labels, exports, logs or training data are uploaded to the server.',
    ].join('\n');
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
  return `<div class="mode-banner"><strong>ACTIVE: Local PC storage only</strong><br>Folder: ${escapeHtml(state.localRootName || 'not selected')}<br><span class="muted">Server upload/project creation is disabled to avoid filling Render/GitHub storage.</span></div>`;
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

function projectsTable() {
  if (!localSummary) return `<div class="empty">No local project connected yet. Select a local PC folder first.</div>`;
  return `<table class="table"><thead><tr><th>Name</th><th>Task</th><th>Images</th><th>Classes</th><th>Action</th></tr></thead><tbody>
    <tr>
      <td><b>${escapeHtml(localSummary.name)}</b><br><span class="muted">${LOCAL_PROJECT_ID}</span></td>
      <td><span class="badge">${escapeHtml(state.currentTask)}</span></td>
      <td>${localSummary.image_count}</td>
      <td>${localSummary.classes.map(escapeHtml).join(', ')}</td>
      <td><button class="btn small use-local-project">Use local</button> <a class="btn small" href="#/labeling">Label</a></td>
    </tr>
  </tbody></table>`;
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
    setStorageMode('local');
    setProject(LOCAL_PROJECT_ID);
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
}
