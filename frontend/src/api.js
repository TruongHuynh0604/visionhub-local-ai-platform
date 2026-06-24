export const api = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post(path, body) {
    const options = { method: 'POST' };
    if (body instanceof FormData) options.body = body;
    else options.body = JSON.stringify(body ?? {}), options.headers = { 'Content-Type': 'application/json' };
    const res = await fetch(path, options);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async put(path, body) {
    const res = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
};
