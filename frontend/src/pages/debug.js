import { Topbar } from '../components/topbar.js';
import { clearClientLogs, debugSessionId, downloadClientLogs, flushClientLogs, getClientLogs, logClientEvent } from '../debug/console-capture.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function time(value) {
  try { return value ? new Date(value).toLocaleString() : '-'; } catch { return value || '-'; }
}

function shortText(log) {
  const text = log.message || JSON.stringify(log.args || []);
  return text.length > 260 ? `${text.slice(0, 260)}...` : text;
}

export function DebugPage() {
  return `${Topbar('Debug Console', 'Local-only browser console. Logs stay in browser localStorage and can be downloaded as JSON.')}
    <section class="grid three debug-kpis">
      <div class="card kpi"><div class="num" id="debug-local-count">0</div><div class="label">Browser logs</div></div>
      <div class="card kpi"><div class="num">0</div><div class="label">Server logs disabled</div></div>
      <div class="card kpi"><div class="num debug-session">${esc(debugSessionId.slice(-8))}</div><div class="label">Session ID</div></div>
    </section>
    <section class="card pad stack debug-panel">
      <div class="row">
        <button class="btn primary" id="debug-refresh">Refresh</button>
        <button class="btn" id="debug-test">Create test log</button>
        <button class="btn" id="debug-download">Download JSON</button>
        <button class="btn danger" id="debug-clear-local">Clear local</button>
      </div>
      <div class="code debug-help">Console API: window.VisionHubDebug.getLogs() | window.VisionHubDebug.download() | Server sync is disabled.</div>
      <div id="debug-status" class="muted">Ready. Logs are stored only in this browser.</div>
    </section>
    <section class="card pad stack">
      <div class="row debug-section-title"><h2>Recent browser logs</h2><span class="badge" id="debug-last-route">route</span></div>
      <div class="debug-log-wrap"><table class="table debug-table"><thead><tr><th>Time</th><th>Level</th><th>Source</th><th>Message</th></tr></thead><tbody id="debug-local-body"></tbody></table></div>
    </section>
    <section class="card pad stack">
      <h2>Server logging disabled</h2>
      <div class="empty">No console data is posted to /api/debug/client-logs. Use Download JSON and send the file/screenshot when debugging.</div>
    </section>`;
}

function renderLocalLogs() {
  const all = getClientLogs();
  const logs = all.slice(-120).reverse();
  document.getElementById('debug-local-count').textContent = String(all.length);
  document.getElementById('debug-last-route').textContent = location.hash || location.pathname;
  document.getElementById('debug-local-body').innerHTML = logs.length
    ? logs.map((log) => `<tr class="debug-row debug-${esc(log.level)}"><td>${esc(time(log.ts))}</td><td><span class="debug-level">${esc(log.level)}</span></td><td>${esc(log.source || '-')}</td><td><pre>${esc(shortText(log))}</pre></td></tr>`).join('')
    : `<tr><td colspan="4"><div class="empty">No browser logs yet.</div></td></tr>`;
}

function setStatus(message, isError = false) {
  const el = document.getElementById('debug-status');
  el.textContent = message;
  el.classList.toggle('debug-error-text', isError);
}

async function refreshAll() {
  renderLocalLogs();
  const result = await flushClientLogs();
  setStatus(result.local_only ? 'Logs refreshed. Local-only mode: no server sync.' : 'Logs refreshed.');
}

export function bindDebugPage() {
  refreshAll();
  window.addEventListener('visionhub-debug-log', renderLocalLogs);
  window.addEventListener('visionhub-debug-cleared', renderLocalLogs);
  document.getElementById('debug-refresh')?.addEventListener('click', refreshAll);
  document.getElementById('debug-test')?.addEventListener('click', () => {
    logClientEvent('info', ['Manual debug test log', { route: location.hash, at: new Date().toISOString(), storage: 'local-only' }], 'debug-page');
    console.warn('VisionHub manual warning test', { source: 'debug-page', storage: 'local-only' });
    setStatus('Created test log in browser localStorage.');
    renderLocalLogs();
  });
  document.getElementById('debug-download')?.addEventListener('click', () => { downloadClientLogs(); setStatus('Downloaded local logs.'); });
  document.getElementById('debug-clear-local')?.addEventListener('click', () => { clearClientLogs(); setStatus('Local browser logs cleared.'); renderLocalLogs(); });
}
