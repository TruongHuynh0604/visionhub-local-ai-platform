import { setupConsoleCapture } from './debug/console-capture.js';
import { Sidebar } from './components/sidebar.js';
import { state } from './state.js';
import { HomePage } from './pages/home.js';
import { DatasetsPage, bindDatasetsPage } from './pages/datasets.js';
import { ProjectsPage, bindProjectsPage } from './pages/projects.js';
import { LabelingPage, bindLabelingPage } from './pages/labeling.js';
import { TrainingPage, bindTrainingPage } from './pages/training.js';
import { ModelsPage, bindModelsPage } from './pages/models.js';
import { DeployPage, bindDeployPage } from './pages/deploy.js';
import { IntegrationsPage } from './pages/integrations.js';
import { SupportPage, bindSupportPage } from './pages/support.js';
import { DebugPage, bindDebugPage } from './pages/debug.js';
import { TrashPage } from './pages/trash.js';

setupConsoleCapture();

const routes = {
  home: [HomePage, null],
  datasets: [DatasetsPage, bindDatasetsPage],
  projects: [ProjectsPage, bindProjectsPage],
  labeling: [LabelingPage, bindLabelingPage],
  training: [TrainingPage, bindTrainingPage],
  models: [ModelsPage, bindModelsPage],
  deploy: [DeployPage, bindDeployPage],
  integrations: [IntegrationsPage, null],
  support: [SupportPage, bindSupportPage],
  debug: [DebugPage, bindDebugPage],
  trash: [TrashPage, null],
};

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function render() {
  state.route = location.hash.replace('#/', '') || 'home';
  if (!routes[state.route]) state.route = 'home';
  const [page, binder] = routes[state.route];
  const app = document.getElementById('app');
  try {
    console.debug('[router] render', state.route);
    const html = await page();
    app.innerHTML = `<div class="app-shell">${Sidebar(state.route)}<main class="main">${html}</main></div>`;
    binder?.(render);
  } catch (err) {
    console.error('[router] render failed', state.route, err);
    app.innerHTML = `<div class="app-shell">${Sidebar(state.route)}<main class="main"><div class="card pad"><h1>Error</h1><pre class="code">${escapeHtml(err?.stack || err)}</pre></div></main></div>`;
  }
}

window.addEventListener('hashchange', render);
render();
