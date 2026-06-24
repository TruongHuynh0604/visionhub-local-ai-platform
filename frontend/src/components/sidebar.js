import { icons } from './icons.js';

const nav = [
  ['home', 'Home', icons.home],
  ['datasets', 'Datasets', icons.datasets],
  ['projects', 'Projects', icons.projects],
  ['models', 'Models', icons.models],
  ['training', 'Training', icons.training],
  ['deploy', 'Deploy', icons.deploy],
  ['integrations', 'Integrations', icons.integrations],
  ['support', 'Support', icons.support],
  ['debug', 'Logs', icons.debug],
  ['trash', 'Trash', icons.trash],
];

export function Sidebar(activeRoute) {
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo"><span></span></div>
        <div>
          <div class="brand-name">VisionHub</div>
          <span class="brand-beta">LOCAL</span>
        </div>
      </div>
      <nav class="nav">
        ${nav.map(([route, label, icon]) => `
          <a class="nav-item ${activeRoute === route ? 'active' : ''}" href="#/${route}">
            <span class="nav-icon">${icon}</span>
            <span class="nav-text">${label}</span>
          </a>`).join('')}
      </nav>
      <div class="sidebar-footer">
        <strong>YOLO workflow</strong>
        <span>Dataset → Labeling → Training → Models → Deploy</span>
      </div>
    </aside>
  `;
}
