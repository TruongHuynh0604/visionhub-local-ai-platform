import { state, setProject, setStorageMode } from '../state.js';
import { Topbar } from '../components/topbar.js';
import { LOCAL_PROJECT_ID, getLocalProjectSummary, readLocalClasses, reconnectLocalRootFolder } from '../local/file-system.js';

let localSummary = null;
let localStats = null;
let status = '';

export async function ProjectsPage() {
  setStorageMode('local');
  setProject(LOCAL_PROJECT_ID);
  await loadLocalProject();

  return `
    ${Topbar('Projects', 'Local project summary. No server project data is created or stored.')}
    <section class="card pad stack">
      <h2>Local PC project</h2>
      <div class="mode-banner"><strong>Local-only storage</strong><br>${escapeHtml(status || 'Select a local folder in Datasets first.')}</div>
      ${localSummary ? statsHtml(localSummary, localStats) : '<div class="empty">No local project connected. Open Datasets and select a local folder.</div>'}
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function loadLocalProject() {
  localSummary = null;
  localStats = null;
  try {
    const result = await reconnectLocalRootFolder({ requestPermission: false });
    if (!result || result.permission !== 'granted') {
      status = result ? `Folder permission is ${result.permission}. Reconnect from Datasets.` : 'No local folder selected.';
      return;
    }
    state.localRootHandle = result.handle;
    state.localRootName = result.handle.name;
    state.localFsReady = true;
    state.classes = await readLocalClasses(result.handle);
    localSummary = await getLocalProjectSummary(result.handle);
    localStats = await buildLocalStats(result.handle, state.classes, localSummary);
    status = `Connected folder: ${result.handle.name}`;
  } catch (err) {
    status = `Local project load failed: ${err.message || err}`;
    console.error('[projects] local summary failed', err);
  }
}

async function buildLocalStats(rootHandle, classes, summary) {
  const objectCounts = Object.fromEntries(classes.map(name => [name, 0]));
  const labeledImages = new Set();
  try {
    const labelsDir = await rootHandle.getDirectoryHandle('labels', { create: true }).then(h => h.getDirectoryHandle('detection', { create: true }));
    for await (const [name, handle] of labelsDir.entries()) {
      if (handle.kind !== 'file' || !name.toLowerCase().endsWith('.txt')) continue;
      const text = await (await handle.getFile()).text();
      let hasBox = false;
      for (const line of text.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
        const classId = Number(line.split(/\s+/)[0]);
        if (Number.isInteger(classId) && classId >= 0 && classId < classes.length) {
          objectCounts[classes[classId]] = (objectCounts[classes[classId]] || 0) + 1;
          hasBox = true;
        }
      }
      if (hasBox) labeledImages.add(name.replace(/\.txt$/i, ''));
    }
  } catch (err) {
    console.warn('[projects] detection stats unavailable', err);
  }
  return { image_total: summary.image_count, detection_labeled_images: labeledImages.size, object_counts: objectCounts };
}

function statsHtml(summary, stats) {
  const totalObjects = Object.values(stats.object_counts).reduce((a, b) => a + b, 0);
  return `
    <div class="grid three">
      <div class="card kpi"><div class="num">${stats.image_total}</div><div class="label">Images in /images</div></div>
      <div class="card kpi"><div class="num">${stats.detection_labeled_images}</div><div class="label">Detection labeled images</div></div>
      <div class="card kpi"><div class="num">${totalObjects}</div><div class="label">Objects in local .txt</div></div>
    </div>
    <h3>Object count by class</h3>
    <table class="table"><thead><tr><th>Class</th><th>Objects</th></tr></thead><tbody>
      ${Object.keys(stats.object_counts).map(name => `<tr><td><b>${escapeHtml(name)}</b></td><td>${stats.object_counts[name]}</td></tr>`).join('')}
    </tbody></table>
    <div class="row">
      <a class="btn primary" href="#/labeling">Open labeling</a>
      <a class="btn" href="#/datasets">Folder setup</a>
    </div>
    <div class="code">Local root: ${escapeHtml(summary.rootName)}\nImages: /images\nDetection labels: /labels/detection\nClasses: /classes.txt</div>
  `;
}

export function bindProjectsPage() {}
