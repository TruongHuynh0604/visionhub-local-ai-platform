export function Topbar(title, subtitle, actions = '') {
  return `
    <header class="topbar">
      <div class="page-title">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="row">${actions}</div>
    </header>
  `;
}
