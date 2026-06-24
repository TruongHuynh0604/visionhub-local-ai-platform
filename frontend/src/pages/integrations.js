import { Topbar } from '../components/topbar.js';
export function IntegrationsPage() {
  return `${Topbar('Integrations', 'Factory integration placeholders.')}
  <section class="card pad"><table class="table"><tr><th>Integration</th><th>Status</th></tr><tr><td>PLC S7</td><td>Planned</td></tr><tr><td>Hikrobot Camera</td><td>Planned</td></tr><tr><td>NAS dataset sync</td><td>Planned</td></tr></table></section>`;
}
export function bindIntegrationsPage() {}
