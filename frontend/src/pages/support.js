import { Topbar } from '../components/topbar.js';
export function SupportPage() {
  return `${Topbar('Support', 'Local documentation and troubleshooting.')}
  <section class="card pad stack"><h2>Common checks</h2><div class="code">GET /health\nGET /api/projects\nGET /api/models</div></section>`;
}
export function bindSupportPage() {}
