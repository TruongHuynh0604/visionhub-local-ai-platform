import { api } from '../api.js';
import { state, setProject } from '../state.js';
import { Topbar } from '../components/topbar.js';

export async function ProjectsPage() {
  const data = await api.get('/api/projects');
  state.projects = data.projects;
  if (!state.selectedProjectId && state.projects[0]) setProject(state.projects[0].id);
  let stats = null;
  if (state.selectedProjectId) stats = await api.get(`/api/projects/${state.selectedProjectId}/stats`);
  return `
    ${Topbar('Projects', 'Project summary, class statistics and YOLO export controls.')}
    <section class="card pad stack">
      <select id="projectSelect" class="select">${state.projects.map(p => `<option value="${p.id}" ${p.id === state.selectedProjectId ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      ${stats ? statsHtml(stats) : '<div class="empty">No selected project.</div>'}
    </section>
  `;
}

function statsHtml(stats) {
  return `
    <div class="grid three">
      <div class="card kpi"><div class="num">${stats.image_total}</div><div class="label">Images</div></div>
      <div class="card kpi"><div class="num">${stats.detection_labeled_images}</div><div class="label">Detection labeled images</div></div>
      <div class="card kpi"><div class="num">${Object.values(stats.object_counts).reduce((a,b)=>a+b,0)}</div><div class="label">Objects</div></div>
    </div>
    <h3>Object count by class</h3>
    <table class="table"><thead><tr><th>Class</th><th>Objects</th><th>Images</th><th>Classification images</th></tr></thead><tbody>
      ${Object.keys(stats.object_counts).map(name => `<tr><td><b>${name}</b></td><td>${stats.object_counts[name]}</td><td>${stats.image_counts[name] || 0}</td><td>${stats.classification_counts[name] || 0}</td></tr>`).join('')}
    </tbody></table>
    <div class="row">
      <button id="exportDetectionBtn" class="btn primary">Export detection YAML</button>
      <button id="exportClassificationBtn" class="btn">Export classification folders</button>
      <span id="exportStatus" class="muted"></span>
    </div>
  `;
}

export function bindProjectsPage(refresh) {
  document.getElementById('projectSelect')?.addEventListener('change', async e => { setProject(e.target.value); await refresh(); });
  document.getElementById('exportDetectionBtn')?.addEventListener('click', async () => {
    const res = await api.post(`/api/projects/${state.selectedProjectId}/export/detection?split_ratio=0.8`);
    document.getElementById('exportStatus').textContent = res.dataset_yaml;
  });
  document.getElementById('exportClassificationBtn')?.addEventListener('click', async () => {
    const res = await api.post(`/api/projects/${state.selectedProjectId}/export/classification?split_ratio=0.8`);
    document.getElementById('exportStatus').textContent = res.dataset_dir;
  });
}
