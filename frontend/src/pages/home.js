import { Topbar } from '../components/topbar.js';

export function HomePage() {
  return `
    ${Topbar('Home', 'Local Vision AI workspace for dataset, labeling, training and deployment.')}
    <section class="grid three">
      <div class="card kpi"><div class="num">01</div><div class="label">Create project and upload images</div></div>
      <div class="card kpi"><div class="num">02</div><div class="label">Label detection or classification data</div></div>
      <div class="card kpi"><div class="num">03</div><div class="label">Launch local YOLO training</div></div>
    </section>
    <section class="card pad" style="margin-top:16px">
      <h2>Local workflow</h2>
      <p class="muted">This prototype saves data under <b>backend/data</b>. It is designed for Codex to upgrade module-by-module.</p>
      <div class="code">pip install ultralytics\npython -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000</div>
    </section>
  `;
}
