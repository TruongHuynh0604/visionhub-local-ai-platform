import { state, setProject, setStorageMode } from '../state.js';
import { Topbar } from '../components/topbar.js';
import { getActiveLocalProjectId, listLocalProjects, reconnectLocalRootFolder, setActiveLocalProjectId } from '../local/file-system.js';

let localProjects = [];
let status = '';

export async function ProjectsPage() {
  setStorageMode('local');
  await loadLocalProjects();

  return `
    ${Topbar('Projects', 'Local multi-project summary. No server project data is created or stored.')}
    <section class="card pad stack">
      <h2>Local AI projects</h2>
      <div class="mode-banner"><strong>Local-only storage</strong><br>${escapeHtml(status || 'Select a local workspace in Datasets first.')}</div>
      ${projectsTable()}
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function loadLocalProjects() {
  localProjects = [];
  try {
    const result = await reconnectLocalRootFolder({ requestPermission: false });
    if (!result || result.permission !== 'granted') {
      status = result ? `Folder permission is ${result.permission}. Reconnect from Datasets.` : 'No local workspace selected.';
      return;
    }
    state.localRootHandle = result.handle;
    state.localRootName = result.handle.name;
    state.localFsReady = true;
    localProjects = await listLocalProjects(result.handle);
    state.projects = localProjects;
    const active = localProjects.find(p => p.id === getActiveLocalProjectId()) || localProjects[0];
    if (active) {
      setActiveLocalProjectId(active.id);
      setProject(active.id);
    }
    status = `Connected workspace: ${result.handle.name}. Projects found: ${localProjects.length}`;
  } catch (err) {
    status = `Local projects load failed: ${err.message || err}`;
    console.error('[projects] local multi-project summary failed', err);
  }
}

function projectsTable() {
  if (!localProjects.length) return '<div class="empty">No local project connected. Open Datasets, select a workspace, then create a project.</div>';
  return `<table class="table"><thead><tr><th>Name</th><th>Path</th><th>Task</th><th>Images</th><th>Classes</th><th>Action</th></tr></thead><tbody>
    ${localProjects.map(p => `<tr>
      <td><b>${escapeHtml(p.name)}</b><br><span class="muted">${escapeHtml(p.id)}</span></td>
      <td><code>${escapeHtml(p.path)}</code></td>
      <td><span class="badge">${escapeHtml(p.task_type)}</span></td>
      <td>${p.image_count}</td>
      <td>${p.classes.map(escapeHtml).join(', ')}</td>
      <td><button class="btn small use-project" data-project-id="${escapeHtml(p.id)}">Use</button> <a class="btn small" href="#/labeling">Label</a></td>
    </tr>`).join('')}
  </tbody></table>
  <div class="code">Workspace root: ${escapeHtml(state.localRootName)}
Project data path: /projects/&lt;project-id&gt;/images, /labels/detection, /classes.txt</div>`;
}

export function bindProjectsPage(refresh) {
  document.querySelectorAll('.use-project').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.projectId;
    setActiveLocalProjectId(id);
    setProject(id);
    if (refresh) await refresh();
  }));
}
