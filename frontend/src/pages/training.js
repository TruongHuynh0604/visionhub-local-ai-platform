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

const DEFAULT_AGENT_URL = 'http://127.0.0.1:8765';
const DEFAULT_AGENT_TOKEN = 'visionhub-local-dev-token';

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
    ${Topbar('Training', 'Start YOLO training on your PC through VisionHub Local Training Agent. Data stays in the local workspace.')} 
    <div class="grid two">
      <section class="card pad stack">
        <h2>Local Training Agent</h2>
        <p class="muted">Run <b>local_agent\\run_agent.bat</b> on your PC, then use this page to start YOLO training. The web UI sends only training parameters to <code>127.0.0.1</code>; images and labels remain in the local workspace.</p>
        ${capabilityHtml()}
        ${projectSelectHtml()}
        <label class="muted">Agent URL</label>
        <input id="agentUrl" class="input" value="${escapeHtml(getAgentUrl())}" placeholder="http://127.0.0.1:8765" />
        <label class="muted">Agent token</label>
        <input id="agentToken" class="input" value="${escapeHtml(getAgentToken())}" placeholder="visionhub-local-dev-token" />
        <label class="muted">Agent workspace path on PC</label>
        <input id="agentWorkspacePath" class="input" value="${escapeHtml(localStorage.getItem('vh_agent_workspace_path') || '')}" placeholder="D:\\VisionHub_Workspace or D:\\...\\Test_web" />
        <button id="saveAgentWorkspaceBtn" class="btn">Save Agent Workspace</button>
        <div class="grid two">
          <button id="checkAgentBtn" class="btn">Check Local Agent</button>
          <button id="refreshAgentStatusBtn" class="btn">Refresh Status / Log</button>
        </div>
      </section>

      <section class="card pad stack">
        <h2>Training parameters</h2>
        <select id="task" class="select"><option value="detect">Detection</option></select>
        <input id="model" class="input" value="yolo11n.pt" placeholder="model, e.g. yolo11n.pt or D:/models/best.pt" />
        <div class="grid two"><input id="epochs" class="input" type="number" value="30" /><input id="imgsz" class="input" type="number" value="640" /></div>
        <div class="grid two"><input id="batch" class="input" type="number" value="8" /><input id="workers" class="input" type="number" value="2" /></div>
        <input id="device" class="input" placeholder="device, empty/cpu/0" />
        <div class="grid two">
          <button id="startAgentTrainBtn" class="btn primary">Start Local Training</button>
          <button id="stopAgentTrainBtn" class="btn danger">Stop Training</button>
        </div>
        <a class="btn" href="#/datasets">Open Datasets</a>
      </section>
    </div>

    <section class="card pad" style="margin-top:16px">
      <h2>Current local project</h2>
      ${projectSummaryHtml()}
    </section>

    <section class="card pad" style="margin-top:16px">
      <h2>Training log</h2>
      <pre id="trainingLocalLog" class="code log-box">${escapeHtml(localStatus || 'Start local_agent\\run_agent.bat, then click Check Local Agent.')}</pre>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function activeProjectId() {
  return state.selectedProjectId || getActiveLocalProjectId();
}

function getAgentUrl() {
  return (localStorage.getItem('vh_agent_url') || DEFAULT_AGENT_URL).replace(/\/+$/, '');
}

function getAgentToken() {
  return localStorage.getItem('vh_agent_token') || DEFAULT_AGENT_TOKEN;
}

function saveAgentInputs() {
  const url = document.getElementById('agentUrl')?.value?.trim() || DEFAULT_AGENT_URL;
  const token = document.getElementById('agentToken')?.value?.trim() || DEFAULT_AGENT_TOKEN;
  const workspacePath = document.getElementById('agentWorkspacePath')?.value?.trim() || '';
  localStorage.setItem('vh_agent_url', url.replace(/\/+$/, ''));
  localStorage.setItem('vh_agent_token', token);
  if (workspacePath) localStorage.setItem('vh_agent_workspace_path', workspacePath);
  return { url: url.replace(/\/+$/, ''), token, workspacePath };
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
    localStatus = `Saved workspace found, but permission is ${result.permission}. Go to Datasets and allow read/write permission.`;
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
    `Connected browser workspace: ${result.handle.name}`,
    `Active project: ${localSummary ? `${localSummary.name} (${localSummary.id})` : 'none'}`,
    `Images: ${localSummary?.image_count ?? 0}`,
    `Classes: ${(localSummary?.classes || []).join(', ') || 'none'}`,
    'Training will run through Local Training Agent on this PC.',
  ].join('\n');
}

function capabilityHtml() {
  if (!isFileSystemAccessSupported()) return '<div class="empty">Use Chrome or Edge. This feature needs browser local folder read/write support.</div>';
  return `<div class="mode-banner"><strong>ACTIVE: Local PC training agent</strong><br>Browser workspace: ${escapeHtml(state.localRootName || 'not selected')}<br>Project: ${escapeHtml(localSummary?.name || activeProjectId())}<br><span class="muted">Render/GitHub only serves the UI. The agent trains on your PC.</span></div>`;
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
    <tr><td><b>Browser path</b></td><td><code>projects/${escapeHtml(localSummary.id)}</code></td></tr>
    <tr><td><b>Agent path</b></td><td><code>&lt;workspace_dir&gt;\\projects\\${escapeHtml(localSummary.id)}</code></td></tr>
  </tbody></table>`;
}

export function bindTrainingPage(refresh) {
  document.getElementById('projectSelect')?.addEventListener('change', async e => {
    setActiveLocalProjectId(e.target.value);
    setProject(e.target.value);
    await refresh();
  });

  document.getElementById('checkAgentBtn')?.addEventListener('click', async () => {
    const log = document.getElementById('trainingLocalLog');
    try {
      const data = await agentFetch('/health');
      if (log) log.textContent = formatAgentHealth(data);
    } catch (err) {
      if (log) log.textContent = agentErrorText(err);
    }
  });

  document.getElementById('saveAgentWorkspaceBtn')?.addEventListener('click', async () => {
    const log = document.getElementById('trainingLocalLog');
    try {
      const { workspacePath } = saveAgentInputs();
      if (!workspacePath) throw new Error('Enter the absolute workspace path first, e.g. D:\\VisionHub_Workspace.');
      const data = await agentFetch('/api/agent/config', {
        method: 'POST',
        body: JSON.stringify({ workspace_dir: workspacePath }),
      });
      if (log) log.textContent = `Agent workspace saved.\nWorkspace: ${data.workspace_dir}\nExists: ${data.workspace_exists}`;
    } catch (err) {
      if (log) log.textContent = agentErrorText(err);
    }
  });

  document.getElementById('startAgentTrainBtn')?.addEventListener('click', async () => {
    const log = document.getElementById('trainingLocalLog');
    try {
      saveAgentInputs();
      await loadLocalTrainingInfo(true);
      const projectId = activeProjectId();
      if (!projectId) throw new Error('Create/select local project first.');
      const payload = {
        project_id: projectId,
        task: document.getElementById('task')?.value || 'detect',
        model: document.getElementById('model')?.value?.trim() || 'yolo11n.pt',
        epochs: Number(document.getElementById('epochs')?.value || 30),
        imgsz: Number(document.getElementById('imgsz')?.value || 640),
        batch: Number(document.getElementById('batch')?.value || 8),
        workers: Number(document.getElementById('workers')?.value || 2),
        device: document.getElementById('device')?.value?.trim() || '',
      };
      if (log) log.textContent = `Sending training request to Local Agent...\nProject: ${projectId}`;
      const data = await agentFetch('/api/train/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (log) log.textContent = formatTrainResponse(data);
    } catch (err) {
      if (log) log.textContent = agentErrorText(err);
    }
  });

  document.getElementById('stopAgentTrainBtn')?.addEventListener('click', async () => {
    const log = document.getElementById('trainingLocalLog');
    try {
      const data = await agentFetch('/api/train/stop', { method: 'POST', body: '{}' });
      if (log) log.textContent = formatTrainResponse(data);
    } catch (err) {
      if (log) log.textContent = agentErrorText(err);
    }
  });

  document.getElementById('refreshAgentStatusBtn')?.addEventListener('click', refreshAgentStatusLog);
}

async function refreshAgentStatusLog() {
  const log = document.getElementById('trainingLocalLog');
  try {
    const [status, text] = await Promise.all([
      agentFetch('/api/train/status'),
      agentFetchText('/api/train/log?tail=220'),
    ]);
    if (log) log.textContent = `${formatTrainResponse(status)}\n\n--- LOG ---\n${text || '(no log yet)'}`;
  } catch (err) {
    if (log) log.textContent = agentErrorText(err);
  }
}

async function agentFetch(path, options = {}) {
  const { url, token } = saveAgentInputs();
  const res = await fetch(`${url}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-VisionHub-Token': token,
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.detail || data?.message || text || `Agent HTTP ${res.status}`);
  return data;
}

async function agentFetchText(path) {
  const { url, token } = saveAgentInputs();
  const res = await fetch(`${url}${path}`, { headers: { 'X-VisionHub-Token': token } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Agent HTTP ${res.status}`);
  return text;
}

function formatAgentHealth(data) {
  return [
    'Local Agent connected.',
    `Version: ${data.version || 'unknown'}`,
    `Workspace: ${data.workspace_dir || '(not configured)'}`,
    `Workspace exists: ${Boolean(data.workspace_exists)}`,
    `Training running: ${Boolean(data.training_running)}`,
    '',
    data.workspace_exists ? 'Ready. Click Start Local Training.' : 'Set Agent workspace path, then click Save Agent Workspace.',
  ].join('\n');
}

function formatTrainResponse(data) {
  return JSON.stringify(data, null, 2);
}

function agentErrorText(err) {
  return [
    `ERROR: ${err.message || err}`,
    '',
    'Checklist:',
    '1. Run local_agent\\run_agent.bat on your PC.',
    '2. Keep Agent URL as http://127.0.0.1:8765 unless changed.',
    '3. Token must match local_agent/config.json.',
    '4. Agent workspace path must be the same folder selected in Datasets.',
  ].join('\n');
}
