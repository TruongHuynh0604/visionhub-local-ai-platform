import { Topbar } from '../components/topbar.js';
export function TrashPage() {
  return `${Topbar('Trash', 'Soft-delete placeholder.')}
  <section class="card pad"><div class="empty">Trash module is reserved for future project/image restore.</div></section>`;
}
export function bindTrashPage() {}
