const STORAGE_KEY = 'visionhub.debug.clientLogs.v1';
const SESSION_KEY = 'visionhub.debug.sessionId.v1';
const MAX_LOGS = 600;
const MAX_ARG_CHARS = 1600;

const originalConsole = {};
const patchedFlag = '__visionhubConsoleCapturePatched';
let internalWrite = false;

export const debugSessionId = getOrCreateSessionId();

function getOrCreateSessionId() {
  try {
    let value = localStorage.getItem(SESSION_KEY);
    if (!value) {
      value = `vh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(SESSION_KEY, value);
    }
    return value;
  } catch {
    return `vh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function safeToString(value, depth = 0, seen = new WeakSet()) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === null || typeof value === 'undefined') return value;
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return String(value);
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    if (depth > 2) return '[Object depth limit]';
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeToString(item, depth + 1, seen));
    const output = {};
    for (const key of Object.keys(value).slice(0, 30)) {
      try { output[key] = safeToString(value[key], depth + 1, seen); }
      catch (err) { output[key] = `[Read error: ${String(err)}]`; }
    }
    return output;
  }
  return String(value);
}

function limitText(text) {
  const value = String(text ?? '');
  return value.length > MAX_ARG_CHARS ? `${value.slice(0, MAX_ARG_CHARS)}... [trimmed]` : value;
}

function normalizeArg(arg) {
  const value = safeToString(arg);
  if (typeof value === 'string') return limitText(value);
  try { return JSON.parse(limitText(JSON.stringify(value))); }
  catch { return limitText(String(value)); }
}

function readLocalLogs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function writeLocalLogs(logs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS))); }
  catch { /* localStorage may be unavailable in private mode */ }
}

function buildEntry(level, args, source = 'console') {
  const normalizedArgs = Array.from(args || []).map(normalizeArg);
  return {
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: new Date().toISOString(),
    level,
    source,
    route: location.hash || location.pathname,
    url: location.href,
    message: normalizedArgs.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '),
    args: normalizedArgs,
    session_id: debugSessionId,
    userAgent: navigator.userAgent,
    storage: 'browser-local-only',
  };
}

function saveEntry(entry) {
  if (internalWrite) return entry;
  const logs = readLocalLogs();
  logs.push(entry);
  writeLocalLogs(logs);
  window.dispatchEvent(new CustomEvent('visionhub-debug-log', { detail: entry }));
  return entry;
}

export function logClientEvent(level, args = [], source = 'app') {
  return saveEntry(buildEntry(level, args, source));
}

export function getClientLogs() {
  return readLocalLogs();
}

export function clearClientLogs() {
  writeLocalLogs([]);
  window.dispatchEvent(new CustomEvent('visionhub-debug-cleared'));
}

export function downloadClientLogs() {
  const logs = getClientLogs();
  const blob = new Blob([JSON.stringify({ session_id: debugSessionId, storage: 'browser-local-only', logs }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `visionhub-console-${debugSessionId}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function flushClientLogs() {
  // Local-only mode: never POST console data to Render/FastAPI.
  return { ok: true, saved: 0, local_only: true, logs: getClientLogs().length };
}

export function setupConsoleCapture() {
  if (window[patchedFlag]) return;
  window[patchedFlag] = true;

  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    originalConsole[level] = console[level]?.bind(console) || console.log.bind(console);
    console[level] = (...args) => {
      try { saveEntry(buildEntry(level, args, 'console')); }
      catch { /* Never allow the logger to break the app. */ }
      originalConsole[level](...args);
    };
  }

  window.addEventListener('error', (event) => {
    logClientEvent('error', [{ message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, error: event.error }], 'window.error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    logClientEvent('error', [{ reason: event.reason }], 'unhandledrejection');
  });

  window.VisionHubDebug = {
    sessionId: debugSessionId,
    getLogs: getClientLogs,
    clear: clearClientLogs,
    flush: flushClientLogs,
    download: downloadClientLogs,
    log: (...args) => logClientEvent('info', args, 'manual'),
  };

  internalWrite = true;
  originalConsole.info?.('[VisionHub Debug] Local-only console capture enabled. Use window.VisionHubDebug.getLogs().');
  internalWrite = false;
}
