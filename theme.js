(function () {
  var theme = null;
  try { theme = localStorage.getItem('foco-theme'); } catch (e) { /* storage bloqueado */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
