// Runs before first paint (a plain script, allowed by the page's CSP):
// the same rule as src/ui/theme-pick.js (tested), so the sky is right from the start.
(function () {
  var pick = 'system';
  try { var v = localStorage.getItem('nexus-theme'); if (v === 'dark' || v === 'light') pick = v; } catch (e) { /* blocked storage: follow the system */ }
  var theme = pick;
  if (pick === 'system') {
    try { theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { theme = 'dark'; }
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
