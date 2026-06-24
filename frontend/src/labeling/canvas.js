import { api } from '../api.js';

function uid() { return `box-${Math.random().toString(36).slice(2, 10)}`; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export class LabelingCanvas {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = options;
    this.image = new Image();
    this.boxes = [];
    this.activeClassId = 0;
    this.selectedId = null;
    this.mode = 'Detection';
    this.filename = '';
    this.projectId = '';
    this.drawRect = { x: 0, y: 0, w: 1, h: 1 };
    this.action = null;
    this.clipboard = null;
    this.saveTimer = null;
    this.handleSize = 8;
    this.bind();
  }

  bind() {
    this.canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
    window.addEventListener('pointermove', e => this.onPointerMove(e));
    window.addEventListener('pointerup', () => this.onPointerUp());
    window.addEventListener('keydown', e => this.onKeyDown(e));
    window.addEventListener('resize', () => this.resizeAndRender());
  }

  async load(projectId, imageInfo, mode = 'Detection') {
    this.projectId = projectId;
    this.filename = imageInfo.filename;
    this.mode = mode;
    this.selectedId = null;
    this.image = await this.loadImage(imageInfo.url);
    if (mode === 'Detection') {
      const res = await api.get(`/api/projects/${projectId}/images/${encodeURIComponent(imageInfo.filename)}/annotations`);
      this.boxes = (res.boxes || []).map(b => ({ ...b, id: b.id || uid() }));
    } else {
      this.boxes = [];
    }
    this.resizeAndRender();
    this.options.onChange?.(this.boxes, this.selectedId);
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src + `?t=${Date.now()}`;
    });
  }

  resizeAndRender() {
    const wrap = this.canvas.parentElement;
    const maxW = Math.max(420, wrap.clientWidth - 40);
    const maxH = Math.max(360, window.innerHeight - 190);
    const scale = Math.min(maxW / this.image.naturalWidth, maxH / this.image.naturalHeight, 1.5) || 1;
    this.canvas.width = Math.max(320, Math.round(this.image.naturalWidth * scale));
    this.canvas.height = Math.max(240, Math.round(this.image.naturalHeight * scale));
    this.drawRect = { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height };
    this.render();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.image.complete) ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);

    if (this.mode !== 'Detection') {
      ctx.fillStyle = 'rgba(6, 19, 65, .7)';
      ctx.fillRect(16, 16, 320, 46);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 16px system-ui';
      ctx.fillText('Classification mode: bbox tools disabled', 30, 45);
      return;
    }

    for (const box of this.boxes) {
      this.drawBox(box, box.id === this.selectedId);
    }
    if (this.action?.type === 'create') this.drawBox(this.action.preview, true, true);
  }

  drawBox(box, selected = false, preview = false) {
    const r = this.normToCanvas(box);
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeStyle = selected ? '#b8ff2c' : '#38bdf8';
    ctx.fillStyle = preview ? 'rgba(184,255,44,.16)' : 'rgba(56,189,248,.12)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    const label = this.options.classes?.[box.class_id] ?? `class ${box.class_id}`;
    ctx.font = '800 13px system-ui';
    const tw = ctx.measureText(label).width + 14;
    ctx.fillStyle = selected ? '#b8ff2c' : '#38bdf8';
    ctx.fillRect(r.x, Math.max(0, r.y - 24), tw, 22);
    ctx.fillStyle = '#061341';
    ctx.fillText(label, r.x + 7, Math.max(16, r.y - 8));
    if (selected) this.drawHandles(r);
    ctx.restore();
  }

  drawHandles(r) {
    const ctx = this.ctx;
    const hs = this.handleSize;
    for (const p of this.handlePoints(r)) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#061341';
      ctx.lineWidth = 2;
      ctx.fillRect(p.x - hs/2, p.y - hs/2, hs, hs);
      ctx.strokeRect(p.x - hs/2, p.y - hs/2, hs, hs);
    }
  }

  handlePoints(r) {
    return [
      { name: 'nw', x: r.x, y: r.y }, { name: 'ne', x: r.x + r.w, y: r.y },
      { name: 'sw', x: r.x, y: r.y + r.h }, { name: 'se', x: r.x + r.w, y: r.y + r.h },
    ];
  }

  normToCanvas(b) {
    const x = (b.x - b.w / 2) * this.canvas.width;
    const y = (b.y - b.h / 2) * this.canvas.height;
    return { x, y, w: b.w * this.canvas.width, h: b.h * this.canvas.height };
  }

  canvasToNormRect(r) {
    const x1 = clamp(Math.min(r.x, r.x + r.w), 0, this.canvas.width);
    const y1 = clamp(Math.min(r.y, r.y + r.h), 0, this.canvas.height);
    const x2 = clamp(Math.max(r.x, r.x + r.w), 0, this.canvas.width);
    const y2 = clamp(Math.max(r.y, r.y + r.h), 0, this.canvas.height);
    return {
      x: ((x1 + x2) / 2) / this.canvas.width,
      y: ((y1 + y2) / 2) / this.canvas.height,
      w: Math.max(0.001, (x2 - x1) / this.canvas.width),
      h: Math.max(0.001, (y2 - y1) / this.canvas.height),
    };
  }

  pointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * this.canvas.width / rect.width, y: (e.clientY - rect.top) * this.canvas.height / rect.height };
  }

  hitTest(pt) {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const box = this.boxes[i];
      const r = this.normToCanvas(box);
      for (const h of this.handlePoints(r)) {
        if (Math.abs(pt.x - h.x) <= 8 && Math.abs(pt.y - h.y) <= 8) return { type: 'handle', box, handle: h.name, rect: r };
      }
      if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) return { type: 'box', box, rect: r };
    }
    return null;
  }

  onPointerDown(e) {
    if (this.mode !== 'Detection') return;
    const pt = this.pointer(e);
    const hit = this.hitTest(pt);
    if (hit?.type === 'handle') {
      this.selectedId = hit.box.id;
      this.action = { type: 'resize', start: pt, box: { ...hit.box }, handle: hit.handle };
    } else if (hit?.type === 'box') {
      this.selectedId = hit.box.id;
      this.action = { type: 'move', start: pt, box: { ...hit.box } };
    } else {
      this.selectedId = null;
      this.action = { type: 'create', start: pt, preview: { id: uid(), class_id: this.activeClassId, x: 0, y: 0, w: 0, h: 0 } };
    }
    this.options.onChange?.(this.boxes, this.selectedId);
    this.render();
  }

  onPointerMove(e) {
    if (!this.action || this.mode !== 'Detection') return;
    const pt = this.pointer(e);
    if (this.action.type === 'create') {
      const s = this.action.start;
      this.action.preview = { ...this.action.preview, ...this.canvasToNormRect({ x: s.x, y: s.y, w: pt.x - s.x, h: pt.y - s.y }) };
    }
    if (this.action.type === 'move') {
      const dx = (pt.x - this.action.start.x) / this.canvas.width;
      const dy = (pt.y - this.action.start.y) / this.canvas.height;
      const box = this.boxes.find(b => b.id === this.selectedId);
      if (box) {
        box.x = clamp(this.action.box.x + dx, box.w / 2, 1 - box.w / 2);
        box.y = clamp(this.action.box.y + dy, box.h / 2, 1 - box.h / 2);
      }
    }
    if (this.action.type === 'resize') {
      this.applyResize(pt);
    }
    this.render();
  }

  applyResize(pt) {
    const box = this.boxes.find(b => b.id === this.selectedId);
    if (!box) return;
    const startRect = this.normToCanvas(this.action.box);
    let x1 = startRect.x, y1 = startRect.y, x2 = startRect.x + startRect.w, y2 = startRect.y + startRect.h;
    if (this.action.handle.includes('n')) y1 = pt.y;
    if (this.action.handle.includes('s')) y2 = pt.y;
    if (this.action.handle.includes('w')) x1 = pt.x;
    if (this.action.handle.includes('e')) x2 = pt.x;
    Object.assign(box, this.canvasToNormRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }));
  }

  onPointerUp() {
    if (!this.action) return;
    if (this.action.type === 'create') {
      const b = this.action.preview;
      if (b.w > 0.006 && b.h > 0.006) {
        this.boxes.push(b);
        this.selectedId = b.id;
      }
    }
    this.action = null;
    this.scheduleSave();
    this.options.onChange?.(this.boxes, this.selectedId);
    this.render();
  }

  onKeyDown(e) {
    if (this.mode !== 'Detection') return;
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelected(); e.preventDefault(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'c') { this.copySelected(); e.preventDefault(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'v') { this.pasteBox(); e.preventDefault(); }
    if (/^[0-9]$/.test(e.key)) { this.setActiveClass(Number(e.key)); e.preventDefault(); }
  }

  setActiveClass(classId) {
    this.activeClassId = classId;
    const box = this.boxes.find(b => b.id === this.selectedId);
    if (box) {
      box.class_id = classId;
      this.scheduleSave();
    }
    this.options.onChange?.(this.boxes, this.selectedId);
    this.render();
  }

  selectBox(id) { this.selectedId = id; this.options.onChange?.(this.boxes, this.selectedId); this.render(); }
  deleteBox(id) { this.boxes = this.boxes.filter(b => b.id !== id); if (this.selectedId === id) this.selectedId = null; this.scheduleSave(); this.options.onChange?.(this.boxes, this.selectedId); this.render(); }
  deleteSelected() { if (this.selectedId) this.deleteBox(this.selectedId); }
  copySelected() { const box = this.boxes.find(b => b.id === this.selectedId); if (box) this.clipboard = { ...box }; }
  pasteBox() {
    if (!this.clipboard) return;
    const b = { ...this.clipboard, id: uid(), x: clamp(this.clipboard.x + 0.03, this.clipboard.w / 2, 1 - this.clipboard.w / 2), y: clamp(this.clipboard.y + 0.03, this.clipboard.h / 2, 1 - this.clipboard.h / 2) };
    this.boxes.push(b); this.selectedId = b.id; this.scheduleSave(); this.options.onChange?.(this.boxes, this.selectedId); this.render();
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 250);
  }

  async save() {
    if (!this.projectId || !this.filename || this.mode !== 'Detection') return;
    const boxes = this.boxes.map(({ id, class_id, x, y, w, h }) => ({ id, class_id, x, y, w, h }));
    await api.put(`/api/projects/${this.projectId}/images/${encodeURIComponent(this.filename)}/annotations`, { boxes });
    this.options.onSaved?.();
  }
}
