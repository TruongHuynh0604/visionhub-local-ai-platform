export function ClassPanel(classes, activeClassId, selectedBox, onClassClick) {
  const list = classes.map((name, i) => `
    <button class="class-chip ${i === activeClassId ? 'active' : ''}" data-class-id="${i}">
      <span>${i}. ${name}</span>
      ${selectedBox ? '<span>Apply</span>' : '<span>Draw</span>'}
    </button>`).join('');
  setTimeout(() => {
    document.querySelectorAll('[data-class-id]').forEach(btn => btn.addEventListener('click', () => onClassClick(Number(btn.dataset.classId))));
  });
  return `<div class="class-list">${list}</div>`;
}

export function BoxList(boxes, classes, selectedId, onSelect, onDelete) {
  const rows = boxes.map((b, idx) => `
    <div class="box-row ${b.id === selectedId ? 'active' : ''}">
      <button class="btn small ghost" data-select-box="${b.id}">#${idx + 1} ${classes[b.class_id] ?? b.class_id}</button>
      <button class="btn small danger" data-delete-box="${b.id}">Delete</button>
    </div>`).join('');
  setTimeout(() => {
    document.querySelectorAll('[data-select-box]').forEach(btn => btn.addEventListener('click', () => onSelect(btn.dataset.selectBox)));
    document.querySelectorAll('[data-delete-box]').forEach(btn => btn.addEventListener('click', () => onDelete(btn.dataset.deleteBox)));
  });
  return `<div class="box-list">${rows || '<div class="empty">No boxes yet.</div>'}</div>`;
}
