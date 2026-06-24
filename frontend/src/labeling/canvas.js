import { api } from '../api.js';
import { getSavedRootHandle, readLocalYoloBoxes, writeLocalYoloBoxes } from '../local/file-system.js';

function uid() { return `box-${Math.random().toString(36).slice(2, 10)}`; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function isEditableTarget(target) {
  return target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName);
}

const MIN_BOX_IMAGE_PX = 50;
const HANDLE_SIZE = 16;
const BUTTON_SIZE = 18;

export class LabelingCanvas {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = options;
    this.image = new Image();
    this.imageInfo = null;
    this.boxes = [];
    this.activeClassId = 0;
    this.selectedIds = [];
    this.mode = 'Detection';
    this.filename = '';
    this.projectId = '';
    this.action = null;
    this.clipboard = [];
    this.saveTimer = null;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.showLabels = true;
    this.contextMenuEl = null;
    LabelingCanvas.activeInstance = this;
    this.bind();
  }

  bind() {
    this.canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
    this.canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('pointermove', e => { if (LabelingCanvas.activeInstance === this) this.onPointerMove(e); });
    window.addEventListener('pointerup', e => { if (LabelingCanvas.activeInstance === this) this.onPointerUp(e); });
    window.addEventListener('keydown', e => { if (LabelingCanvas.activeInstance === this) this.onKeyDown(e); });
    window.addEventListener('resize', () => { if (LabelingCanvas.activeInstance === this) this.resizeAndRender(); });
    document.addEventListener('click', e => {
      if (LabelingCanvas.activeInstance !== this || !this.contextMenuEl) return;
      const openedAt = Number(this.contextMenuEl.dataset.openedAt || 0);
      if (Date.now() - openedAt < 120) return;
      if (!this.contextMenuEl.contains(e.target)) this.closeContextMenu();
    });
  }

  get selectedId() { return this.selectedIds[0] || null; }
  emitChange() { this.options.onChange?.(this.boxes, this.selectedId); }

  setClasses(classes) {
    this.options.classes = Array.from(classes || []);
    const maxClassId = Math.max(0, this.options.classes.length - 1);
    this.activeClassId = clamp(this.activeClassId, 0, maxClassId);
    for (const box of this.boxes) box.class_id = clamp(Number(box.class_id || 0), 0, maxClassId);
    this.emitChange();
    this.render();
  }

  async load(projectId, imageInfo, mode = 'Detection') {
    this.projectId = projectId;
    this.filename = imageInfo.filename;
    this.imageInfo = imageInfo;
    this.mode = mode;
    this.selectedIds = [];
    this.action = null;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.closeContextMenu();

    this.image = await this.loadImage(imageInfo.url);
    if (mode === 'Detection') {
      if (imageInfo.source === 'local-fs') {
        const rootHandle = await getSavedRootHandle();
        this.boxes = (await readLocalYoloBoxes(rootHandle, imageInfo.filename, projectId)).map(b => ({ ...b, id: b.id || uid() }));
      } else {
        const res = await api.get(`/api/projects/${projectId}/images/${encodeURIComponent(imageInfo.filename)}/annotations`);
        this.boxes = (res.boxes || []).map(b => ({ ...b, id: b.id || uid() }));
      }
    } else {
      this.boxes = [];
    }

    this.resizeAndRender();
    this.emitChange();
    console.info('[labeling] image loaded', { source: imageInfo.source || 'server', projectId, filename: imageInfo.filename, mode, boxes: this.boxes.length });
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src?.startsWith('blob:') || src?.startsWith('data:') ? src : src + `?t=${Date.now()}`;
    });
  }

  resizeAndRender() {
    const wrap = this.canvas.parentElement;
    const maxW = Math.max(520, wrap.clientWidth - 40);
    const maxH = Math.max(420, window.innerHeight - 190);
    this.canvas.width = Math.round(maxW);
    this.canvas.height = Math.round(maxH);
    this.render();
  }

  imageMetrics(zoomOverride = this.zoom, panOverride = this.pan) {
    const iw = this.image.naturalWidth || 1;
    const ih = this.image.naturalHeight || 1;
    const baseScale = Math.min(this.canvas.width / iw, this.canvas.height / ih) || 1;
    const scale = baseScale * zoomOverride;
    const w = iw * scale;
    const h = ih * scale;
    const x = (this.canvas.width - w) / 2 + panOverride.x;
    const y = (this.canvas.height - h) / 2 + panOverride.y;
    return { x, y, w, h, scale, iw, ih, baseScale };
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const m = this.imageMetrics();
    if (this.image.complete) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.image, m.x, m.y, m.w, m.h);
    }

    if (this.mode !== 'Detection') {
      ctx.fillStyle = 'rgba(6, 19, 65, .7)';
      ctx.fillRect(16, 16, 360, 46);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 16px system-ui';
      ctx.fillText('Classification mode: bbox tools disabled', 30, 45);
      return;
    }

    for (const box of this.boxes) this.drawBox(box, this.selectedIds.includes(box.id), false);
    if (this.action?.type === 'create') this.drawBox(this.action.preview, true, true);
    this.drawHud();
  }

  drawHud() {
    const selectedCount = this.selectedIds.length;
    const text = `Project ${this.projectId} • Zoom ${this.zoom.toFixed(2)}x${selectedCount ? ` • Selected ${selectedCount}` : ''}${this.showLabels ? '' : ' • Labels hidden'}`;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '700 12px system-ui';
    const tw = ctx.measureText(text).width + 18;
    ctx.fillStyle = 'rgba(6,19,65,.76)';
    ctx.fillRect(12, 12, tw, 26);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 21, 30);
    ctx.restore();
  }

  className(classId) { return this.options.classes?.[classId] ?? `class ${classId}`; }

  classColor(classId, preview = false) {
    if (preview) return '#f59e0b';
    const name = this.className(classId);
    if (/_OK$/i.test(name)) return '#22c55e';
    if (/_NG$/i.test(name)) return '#ef4444';
    const hue = (classId * 67 + 195) % 360;
    return `hsl(${hue} 82% 52%)`;
  }

  drawBox(box, selected = false, preview = false) {
    const r = this.normToCanvas(box);
    const ctx = this.ctx;
    const label = this.className(box.class_id);
    const color = this.classColor(box.class_id, preview);
    const isOk = /_OK$/i.test(label);
    const isNg = /_NG$/i.test(label);

    ctx.save();
    if (selected && !preview) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }

    ctx.lineWidth = preview ? 2.5 : 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = preview ? 'rgba(245,158,11,.16)' : isNg ? 'rgba(239,68,68,.09)' : isOk ? 'rgba(34,197,94,.09)' : 'rgba(56,189,248,.10)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash(isOk && !preview ? [6, 4] : []);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);

    if (this.showLabels) {
      ctx.font = '800 13px system-ui';
      const tw = ctx.measureText(label).width + 14;
      const lx = clamp(r.x, 0, Math.max(0, this.canvas.width - tw));
      const ly = Math.max(0, r.y - 24);
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(lx, ly, tw, 22);
      ctx.fillStyle = isNg ? '#ffb4b4' : '#ffffff';
      ctx.fillText(label, lx + 7, ly + 16);
    }

    if (!preview) this.drawActionButtons(r);
    if (selected && !preview) this.drawHandles(r);
    ctx.restore();
  }

  drawActionButtons(r) {
    const ctx = this.ctx;
    for (const btn of this.actionButtonRects(r)) {
      ctx.fillStyle = 'rgba(0,0,0,.58)';
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 12px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 0.5);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  actionButtonRects(r) {
    const y = r.y;
    const right = r.x + r.w;
    return [
      { action: 'classMenu', label: '↓', x: right - BUTTON_SIZE * 3, y, w: BUTTON_SIZE, h: BUTTON_SIZE },
      { action: 'copy', label: 'C', x: right - BUTTON_SIZE * 2, y, w: BUTTON_SIZE, h: BUTTON_SIZE },
      { action: 'delete', label: 'X', x: right - BUTTON_SIZE, y, w: BUTTON_SIZE, h: BUTTON_SIZE },
    ];
  }

  drawHandles(r) {
    const ctx = this.ctx;
    for (const p of this.handlePoints(r)) {
      ctx.fillStyle = 'rgba(185,185,185,.82)';
      ctx.strokeStyle = 'rgba(50,50,50,.9)';
      ctx.lineWidth = 1;
      ctx.fillRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }
  }

  handlePoints(r) {
    const midX = r.x + r.w / 2;
    const midY = r.y + r.h / 2;
    return [
      { name: 'nw', x: r.x, y: r.y }, { name: 'n', x: midX, y: r.y }, { name: 'ne', x: r.x + r.w, y: r.y },
      { name: 'e', x: r.x + r.w, y: midY }, { name: 'se', x: r.x + r.w, y: r.y + r.h }, { name: 's', x: midX, y: r.y + r.h },
      { name: 'sw', x: r.x, y: r.y + r.h }, { name: 'w', x: r.x, y: midY },
    ];
  }

  normToImageRect(b) {
    const iw = this.image.naturalWidth || 1;
    const ih = this.image.naturalHeight || 1;
    return { x: (b.x - b.w / 2) * iw, y: (b.y - b.h / 2) * ih, w: b.w * iw, h: b.h * ih };
  }

  imageRectToNorm(r) {
    const iw = this.image.naturalWidth || 1;
    const ih = this.image.naturalHeight || 1;
    const x1 = clamp(Math.min(r.x, r.x + r.w), 0, iw);
    const y1 = clamp(Math.min(r.y, r.y + r.h), 0, ih);
    const x2 = clamp(Math.max(r.x, r.x + r.w), 0, iw);
    const y2 = clamp(Math.max(r.y, r.y + r.h), 0, ih);
    return { x: ((x1 + x2) / 2) / iw, y: ((y1 + y2) / 2) / ih, w: Math.max(0.000001, (x2 - x1) / iw), h: Math.max(0.000001, (y2 - y1) / ih) };
  }

  normToCanvas(b) {
    const r = this.normToImageRect(b);
    const p1 = this.imageToCanvas({ x: r.x, y: r.y });
    const p2 = this.imageToCanvas({ x: r.x + r.w, y: r.y + r.h });
    return { x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y };
  }

  imageToCanvas(pt) {
    const m = this.imageMetrics();
    return { x: m.x + pt.x * m.scale, y: m.y + pt.y * m.scale };
  }

  canvasToImage(pt) {
    const m = this.imageMetrics();
    return { x: clamp((pt.x - m.x) / m.scale, 0, m.iw), y: clamp((pt.y - m.y) / m.scale, 0, m.ih) };
  }

  canvasRectToNorm(r) {
    const p1 = this.canvasToImage({ x: r.x, y: r.y });
    const p2 = this.canvasToImage({ x: r.x + r.w, y: r.y + r.h });
    return this.imageRectToNorm({ x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y });
  }

  pointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * this.canvas.width / rect.width, y: (e.clientY - rect.top) * this.canvas.height / rect.height, clientX: e.clientX, clientY: e.clientY };
  }

  hitTest(pt) {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const box = this.boxes[i];
      const r = this.normToCanvas(box);
      for (const btn of this.actionButtonRects(r)) {
        if (pt.x >= btn.x && pt.x <= btn.x + btn.w && pt.y >= btn.y && pt.y <= btn.y + btn.h) return { type: 'button', box, index: i, action: btn.action, rect: r };
      }
      if (this.selectedIds.includes(box.id)) {
        for (const h of this.handlePoints(r)) {
          if (Math.abs(pt.x - h.x) <= HANDLE_SIZE / 2 && Math.abs(pt.y - h.y) <= HANDLE_SIZE / 2) return { type: 'handle', box, index: i, handle: h.name, rect: r };
        }
      }
      if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) return { type: 'box', box, index: i, rect: r };
    }
    return null;
  }

  onPointerDown(e) {
    LabelingCanvas.activeInstance = this;
    if (this.mode !== 'Detection') return;
    const pt = this.pointer(e);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this.action = { type: 'pan', start: pt, panStart: { ...this.pan } };
      this.canvas.style.cursor = 'grab';
      return;
    }

    if (e.button === 2) {
      const hit = this.hitTest(pt);
      if (hit?.type === 'box') {
        this.toggleOkNgClass(hit.box);
        this.scheduleSave();
        this.emitChange();
        this.render();
      }
      return;
    }

    if (e.button !== 0) return;
    const hit = this.hitTest(pt);

    if (hit?.type === 'button') {
      this.handleBoxButtonAction(hit.box, hit.action, pt);
      return;
    }

    if (hit?.type === 'handle') {
      this.selectOnly(hit.box.id);
      this.action = { type: 'resize', start: pt, boxId: hit.box.id, handle: hit.handle, startBox: { ...hit.box } };
      this.emitChange();
      this.render();
      return;
    }

    if (hit?.type === 'box') {
      if (e.ctrlKey) {
        this.toggleSelection(hit.box.id);
      } else if (this.selectedIds.length > 1 && this.selectedIds.includes(hit.box.id)) {
        this.action = { type: 'moveGroup', start: pt, startBoxes: this.boxes.filter(b => this.selectedIds.includes(b.id)).map(b => ({ ...b })) };
      } else {
        this.selectOnly(hit.box.id);
        this.action = { type: 'move', start: pt, boxId: hit.box.id, startBox: { ...hit.box } };
      }
      this.emitChange();
      this.render();
      return;
    }

    if (this.selectedIds.length > 0) {
      this.clearSelection();
      this.emitChange();
      this.render();
      return;
    }

    const startImage = this.canvasToImage(pt);
    this.action = { type: 'create', start: pt, startImage, preview: { id: uid(), class_id: this.activeClassId, x: 0, y: 0, w: 0, h: 0 } };
    this.emitChange();
    this.render();
  }

  onPointerMove(e) {
    if (this.mode !== 'Detection') return;
    const pt = this.pointer(e);
    if (!this.action) { this.updateCursor(pt); return; }

    if (this.action.type === 'pan') {
      this.pan = { x: this.action.panStart.x + pt.x - this.action.start.x, y: this.action.panStart.y + pt.y - this.action.start.y };
      this.render();
      return;
    }
    if (this.action.type === 'create') {
      const s = this.action.start;
      this.action.preview = { ...this.action.preview, ...this.canvasRectToNorm({ x: s.x, y: s.y, w: pt.x - s.x, h: pt.y - s.y }) };
    }
    if (this.action.type === 'move') {
      const box = this.boxes.find(b => b.id === this.action.boxId);
      if (box) this.moveBoxFromStart(box, this.action.startBox, pt, this.action.start);
    }
    if (this.action.type === 'moveGroup') {
      for (const startBox of this.action.startBoxes) {
        const box = this.boxes.find(b => b.id === startBox.id);
        if (box) this.moveBoxFromStart(box, startBox, pt, this.action.start);
      }
    }
    if (this.action.type === 'resize') this.applyResize(pt);
    this.render();
  }

  moveBoxFromStart(box, startBox, pt, startPt) {
    const startImage = this.canvasToImage(startPt);
    const nowImage = this.canvasToImage(pt);
    const dx = (nowImage.x - startImage.x) / (this.image.naturalWidth || 1);
    const dy = (nowImage.y - startImage.y) / (this.image.naturalHeight || 1);
    box.x = clamp(startBox.x + dx, box.w / 2, 1 - box.w / 2);
    box.y = clamp(startBox.y + dy, box.h / 2, 1 - box.h / 2);
  }

  applyResize(pt) {
    const box = this.boxes.find(b => b.id === this.action.boxId);
    if (!box) return;
    const startRect = this.normToImageRect(this.action.startBox);
    const imgPt = this.canvasToImage(pt);
    let x1 = startRect.x;
    let y1 = startRect.y;
    let x2 = startRect.x + startRect.w;
    let y2 = startRect.y + startRect.h;
    if (this.action.handle.includes('n')) y1 = imgPt.y;
    if (this.action.handle.includes('s')) y2 = imgPt.y;
    if (this.action.handle.includes('w')) x1 = imgPt.x;
    if (this.action.handle.includes('e')) x2 = imgPt.x;
    Object.assign(box, this.imageRectToNorm({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }));
  }

  onPointerUp() {
    if (!this.action) return;
    const actionType = this.action.type;
    if (actionType === 'create') {
      const b = this.action.preview;
      const r = this.normToImageRect(b);
      if (r.w >= MIN_BOX_IMAGE_PX && r.h >= MIN_BOX_IMAGE_PX) {
        this.boxes.push(b);
        this.selectOnly(b.id);
      } else {
        console.info('[labeling] ignored tiny box', { min: MIN_BOX_IMAGE_PX, width: Math.round(r.w), height: Math.round(r.h) });
      }
    }
    this.action = null;
    this.canvas.style.cursor = 'default';
    if (['create', 'move', 'moveGroup', 'resize'].includes(actionType)) this.scheduleSave();
    this.emitChange();
    this.render();
  }

  onWheel(e) {
    if (this.mode !== 'Detection' || !this.image.complete) return;
    e.preventDefault();
    const pt = this.pointer(e);
    const oldZoom = this.zoom;
    const nextZoom = clamp(e.deltaY < 0 ? this.zoom * 1.1 : this.zoom / 1.1, 1, 20);
    if (nextZoom === oldZoom) return;
    const oldMetrics = this.imageMetrics(oldZoom, this.pan);
    const imgX = (pt.x - oldMetrics.x) / oldMetrics.scale;
    const imgY = (pt.y - oldMetrics.y) / oldMetrics.scale;
    const newMetricsNoPan = this.imageMetrics(nextZoom, { x: 0, y: 0 });
    this.zoom = nextZoom;
    this.pan = { x: pt.x - imgX * newMetricsNoPan.scale - newMetricsNoPan.x, y: pt.y - imgY * newMetricsNoPan.scale - newMetricsNoPan.y };
    this.render();
  }

  onKeyDown(e) {
    if (this.mode !== 'Detection' || isEditableTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (e.ctrlKey && key === 'a') {
      this.selectedIds = this.boxes.map(b => b.id);
      this.emitChange(); this.render(); e.preventDefault(); return;
    }
    if (e.key === 'Escape') {
      this.clearSelection(); this.action = null; this.emitChange(); this.render(); e.preventDefault(); return;
    }
    if (e.key === ' ') { this.showLabels = !this.showLabels; this.render(); e.preventDefault(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelected(); e.preventDefault(); return; }
    if (e.ctrlKey && key === 'c') { this.copySelected(); e.preventDefault(); return; }
    if (e.ctrlKey && key === 'v') { this.pasteBox(); e.preventDefault(); return; }
    if (/^[0-9]$/.test(e.key)) {
      const classId = Number(e.key);
      if (classId < (this.options.classes?.length || 0)) this.setActiveClass(classId);
      e.preventDefault();
    }
  }

  updateCursor(pt) {
    const hit = this.hitTest(pt);
    if (hit?.type === 'handle') {
      const map = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
      this.canvas.style.cursor = map[hit.handle] || 'default';
    } else if (hit?.type === 'box') {
      this.canvas.style.cursor = 'move';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  handleBoxButtonAction(box, action, pt) {
    if (action === 'copy') {
      this.clipboard = [{ ...box }];
      const pasted = this.createOffsetCopy(box, 10);
      this.boxes.push(pasted);
      this.selectOnly(pasted.id);
      this.scheduleSave(); this.emitChange(); this.render(); return;
    }
    if (action === 'delete') { this.deleteBox(box.id); return; }
    if (action === 'classMenu') this.showClassMenu(box, pt);
  }

  showClassMenu(box, pt) {
    const classes = this.options.classes || [];
    const current = this.className(box.class_id);
    const prefix = current.includes('_') ? current.slice(0, current.indexOf('_') + 1) : `${current}_`;
    let items = classes.map((name, id) => ({ name, id })).filter(x => x.name.toLowerCase().startsWith(prefix.toLowerCase()));
    if (!items.length) items = classes.map((name, id) => ({ name, id }));
    this.closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'label-context-menu';
    menu.dataset.openedAt = String(Date.now());
    menu.style.left = `${pt.clientX}px`;
    menu.style.top = `${pt.clientY}px`;
    menu.innerHTML = items.map(item => `<button type="button" data-class-id="${item.id}" class="${item.id === box.class_id ? 'active' : ''}"><span>${item.id}. ${this.escapeHtml(item.name)}</span></button>`).join('');
    menu.querySelectorAll('[data-class-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        box.class_id = Number(btn.dataset.classId);
        this.activeClassId = box.class_id;
        this.closeContextMenu(); this.scheduleSave(); this.emitChange(); this.render();
      });
    });
    document.body.appendChild(menu);
    this.contextMenuEl = menu;
  }

  closeContextMenu() { if (this.contextMenuEl) this.contextMenuEl.remove(); this.contextMenuEl = null; }
  escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

  toggleOkNgClass(box) {
    const classes = this.options.classes || [];
    const current = this.className(box.class_id);
    let target = null;
    if (/_OK$/i.test(current)) target = current.replace(/_OK$/i, '_NG');
    if (/_NG$/i.test(current)) target = current.replace(/_NG$/i, '_OK');
    if (!target) return;
    const targetId = classes.findIndex(name => name.toLowerCase() === target.toLowerCase());
    if (targetId >= 0) { box.class_id = targetId; this.activeClassId = targetId; console.info('[labeling] toggled OK/NG class', { from: current, to: target }); }
  }

  createOffsetCopy(box, imageOffsetPx = 10) {
    const iw = this.image.naturalWidth || 1;
    const ih = this.image.naturalHeight || 1;
    return { ...box, id: uid(), x: clamp(box.x + imageOffsetPx / iw, box.w / 2, 1 - box.w / 2), y: clamp(box.y + imageOffsetPx / ih, box.h / 2, 1 - box.h / 2) };
  }

  selectOnly(id) { this.selectedIds = id ? [id] : []; }
  toggleSelection(id) { this.selectedIds = this.selectedIds.includes(id) ? this.selectedIds.filter(x => x !== id) : [...this.selectedIds, id]; }
  clearSelection() { this.selectedIds = []; }

  setActiveClass(classId) {
    this.activeClassId = classId;
    const selectedSet = new Set(this.selectedIds);
    let changed = false;
    for (const box of this.boxes) {
      if (selectedSet.has(box.id)) { box.class_id = classId; changed = true; }
    }
    if (changed) this.scheduleSave();
    this.emitChange(); this.render();
  }

  selectBox(id) { this.selectOnly(id); this.emitChange(); this.render(); }
  deleteBox(id) { this.boxes = this.boxes.filter(b => b.id !== id); this.selectedIds = this.selectedIds.filter(x => x !== id); this.scheduleSave(); this.emitChange(); this.render(); }
  deleteSelected() { if (!this.selectedIds.length) return; const selected = new Set(this.selectedIds); this.boxes = this.boxes.filter(b => !selected.has(b.id)); this.clearSelection(); this.scheduleSave(); this.emitChange(); this.render(); }
  copySelected() { const selected = new Set(this.selectedIds); this.clipboard = this.boxes.filter(b => selected.has(b.id)).map(b => ({ ...b })); console.info('[labeling] copied boxes', { count: this.clipboard.length }); }
  pasteBox() { if (!this.clipboard.length) return; const pasted = this.clipboard.map(b => this.createOffsetCopy(b, 10)); this.boxes.push(...pasted); this.selectedIds = pasted.map(b => b.id); this.scheduleSave(); this.emitChange(); this.render(); }
  scheduleSave() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save().catch(err => console.error('[labeling] autosave failed', err)), 250); }

  async save() {
    if (!this.projectId || !this.filename || this.mode !== 'Detection') return;
    const boxes = this.boxes.map(({ id, class_id, x, y, w, h }) => ({ id, class_id, x, y, w, h }));
    if (this.imageInfo?.source === 'local-fs') {
      const rootHandle = await getSavedRootHandle();
      await writeLocalYoloBoxes(rootHandle, this.filename, boxes, this.projectId);
      console.info('[labeling] local YOLO label saved', { projectId: this.projectId, filename: this.filename, boxes: boxes.length });
    } else {
      await api.put(`/api/projects/${this.projectId}/images/${encodeURIComponent(this.filename)}/annotations`, { boxes });
      console.info('[labeling] server annotation saved', { filename: this.filename, boxes: boxes.length });
    }
    this.options.onSaved?.();
  }
}
