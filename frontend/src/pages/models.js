import { api } from '../api.js';
import { Topbar } from '../components/topbar.js';

export async function ModelsPage() {
  const res = await api.get('/api/models');
  return `
    ${Topbar('Models', 'Local trained model registry from backend/data/runs.')}
    <section class="card pad">
      ${res.models.length ? `<table class="table"><thead><tr><th>Name</th><th>Run</th><th>Size</th><th>Path</th></tr></thead><tbody>${res.models.map(m => `<tr><td><b>${m.name}</b></td><td>${m.run}</td><td>${m.size_mb} MB</td><td><code>${m.path}</code></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No .pt model found yet. Train a model first.</div>'}
    </section>
  `;
}
export function bindModelsPage() {}
