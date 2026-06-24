import { api } from '../api.js';
import { state, setProject } from '../state.js';
import { Topbar } from '../components/topbar.js';

export async function DatasetsPage() {
  const data = await api.get('/api/projects');
  state.projects = data.projects;
  return `
    ${Topbar('Datasets', 'Create local datasets, upload images and manage class names.')}
    <div class="grid two">
      <section class="card pad stack">
        <h2>Create project</h2>
        <input id="newProjectName" class="input" placeholder="Project name, e.g. Camera6 Top Inspection" />
        <textarea id="newClasses" rows="7" placeholder="One class per line" class="input">OK\nNG</textarea>
        <select id="newTask" class="select"><option>Detection</option><option>Classification</option></select>
        <button id="createProjectBtn" class="btn primary">Create project</button>
      </section>
      <section class="card pad stack">
        <h2>Upload images</h2>
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

function projectSelectHtml() {
  return `<select id="projectSelect" class="select"><option value="">Select project</option>${state.projects.map(p => `<option value="${p.id}" ${p.id === state.selectedProjectId ? 'selected' : ''}>${p.name} (${p.image_count})</option>`).join('')}</select>`;
}

function projectsTable() {
  if (!state.projects.length) return `<div class="empty">No project yet. Create the first dataset.</div>`;
  return `<table class="table"><thead><tr><th>Name</th><th>Task</th><th>Images</th><th>Classes</th><th>Action</th></tr></thead><tbody>${state.projects.map(p => `
    <tr>
      <td><b>${p.name}</b><br><span class="muted">${p.id}</span></td>
      <td><span class="badge">${p.task_type}</span></td>
      <td>${p.image_count}</td>
      <td>${p.classes.join(', ')}</td>
      <td><button class="btn small select-project" data-id="${p.id}">Use</button> <a class="btn small" href="#/labeling" data-labeling="${p.id}">Label</a></td>
    </tr>`).join('')}</tbody></table>`;
}

export function bindDatasetsPage(refresh) {
  document.getElementById('createProjectBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('newProjectName').value.trim();
    const classes = document.getElementById('newClasses').value.split('\n').map(x => x.trim()).filter(Boolean);
    const task_type = document.getElementById('newTask').value;
    if (!name) return alert('Enter project name');
    const project = await api.post('/api/projects', { name, classes, task_type });
    setProject(project.id);
    await refresh();
  });
  document.getElementById('projectSelect')?.addEventListener('change', e => setProject(e.target.value));
  document.querySelectorAll('.select-project').forEach(btn => btn.addEventListener('click', async () => { setProject(btn.dataset.id); await refresh(); }));
  document.getElementById('uploadBtn')?.addEventListener('click', async () => {
    const projectId = document.getElementById('projectSelect').value || state.selectedProjectId;
    const files = [...document.getElementById('imageFiles').files];
    if (!projectId) return alert('Select project first');
    if (!files.length) return alert('Select images');
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    document.getElementById('uploadStatus').textContent = 'Uploading...';
    const res = await api.post(`/api/projects/${projectId}/images`, fd);
    document.getElementById('uploadStatus').textContent = `Uploaded ${res.saved.length} images.`;
    await refresh();
  });
}
