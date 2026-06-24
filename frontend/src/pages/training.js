import { api } from '../api.js';
import { state, setProject } from '../state.js';
import { Topbar } from '../components/topbar.js';

let pollTimer = null;
let activeJob = null;

export async function TrainingPage() {
  const data = await api.get('/api/projects');
  state.projects = data.projects;
  if (!state.selectedProjectId && state.projects[0]) setProject(state.projects[0].id);
  const jobs = await api.get(`/api/training/jobs${state.selectedProjectId ? `?project_id=${state.selectedProjectId}` : ''}`);
  return `
    ${Topbar('Training', 'Launch local YOLO training. Requires pip install ultralytics for real training.')}
    <div class="grid two">
      <section class="card pad stack">
        <h2>Start training</h2>
        <select id="projectSelect" class="select">${state.projects.map(p => `<option value="${p.id}" ${p.id === state.selectedProjectId ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
        <select id="task" class="select"><option value="detect">Detection</option><option value="classify">Classification</option></select>
        <input id="model" class="input" value="yolo11n.pt" placeholder="model, e.g. yolo11n.pt or path/to/best.pt" />
        <div class="grid two"><input id="epochs" class="input" type="number" value="30" /><input id="imgsz" class="input" type="number" value="640" /></div>
        <div class="grid two"><input id="batch" class="input" type="number" value="8" /><input id="workers" class="input" type="number" value="2" /></div>
        <input id="device" class="input" placeholder="device, empty/cpu/0" />
        <button id="startBtn" class="btn primary">Start training</button>
      </section>
      <section class="card pad stack">
        <h2>Jobs</h2>
        ${jobsList(jobs.jobs)}
      </section>
    </div>
    <section class="card pad" style="margin-top:16px">
      <h2>Log</h2>
      <pre id="jobLog" class="code log-box">Select or start a job.</pre>
    </section>
  `;
}

function jobsList(jobs) {
  if (!jobs.length) return '<div class="empty">No training job yet.</div>';
  return `<table class="table"><thead><tr><th>Job</th><th>Task</th><th>Status</th></tr></thead><tbody>${jobs.map(j => `<tr><td><button class="btn small jobBtn" data-project="${j.project_id}" data-job="${j.id}">${j.id}</button><br><span class="muted">${j.created_at}</span></td><td>${j.task}</td><td><span class="badge">${j.status}</span></td></tr>`).join('')}</tbody></table>`;
}

export function bindTrainingPage(refresh) {
  clearInterval(pollTimer);
  document.getElementById('projectSelect')?.addEventListener('change', async e => { setProject(e.target.value); await refresh(); });
  document.getElementById('startBtn')?.addEventListener('click', async () => {
    const payload = {
      project_id: document.getElementById('projectSelect').value,
      task: document.getElementById('task').value,
      model: document.getElementById('model').value.trim() || 'yolo11n.pt',
      epochs: Number(document.getElementById('epochs').value || 30),
      imgsz: Number(document.getElementById('imgsz').value || 640),
      batch: Number(document.getElementById('batch').value || 8),
      workers: Number(document.getElementById('workers').value || 2),
      device: document.getElementById('device').value.trim(),
    };
    const job = await api.post('/api/training/start', payload);
    activeJob = job;
    await pollJob();
    pollTimer = setInterval(pollJob, 2000);
  });
  document.querySelectorAll('.jobBtn').forEach(btn => btn.addEventListener('click', async () => {
    activeJob = { project_id: btn.dataset.project, id: btn.dataset.job };
    await pollJob();
    pollTimer = setInterval(pollJob, 2000);
  }));
}

async function pollJob() {
  if (!activeJob) return;
  const log = document.getElementById('jobLog');
  const data = await api.get(`/api/training/jobs/${activeJob.project_id}/${activeJob.id}`);
  if (log) log.textContent = data.log_tail || 'No log yet.';
  if (['completed', 'failed'].includes(data.status)) clearInterval(pollTimer);
}
