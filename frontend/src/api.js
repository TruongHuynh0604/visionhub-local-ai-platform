const SERVER_WRITES_DISABLED = true;

async function parseResponse(res) {
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function blockServerWrite(method, path) {
  if (!SERVER_WRITES_DISABLED) return;
  const message = `[local-only] Blocked ${method} ${path}. VisionHub is configured to keep images, labels, logs, exports and training data on the browser-selected PC folder only.`;
  console.warn(message);
  throw new Error(message);
}

export const api = {
  async get(path) {
    const res = await fetch(path);
    return parseResponse(res);
  },
  async post(path, body) {
    blockServerWrite('POST', path);
    const options = { method: 'POST' };
    if (body instanceof FormData) options.body = body;
    else options.body = JSON.stringify(body ?? {}), options.headers = { 'Content-Type': 'application/json' };
    const res = await fetch(path, options);
    return parseResponse(res);
  },
  async put(path, body) {
    blockServerWrite('PUT', path);
    const res = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    return parseResponse(res);
  }
};
