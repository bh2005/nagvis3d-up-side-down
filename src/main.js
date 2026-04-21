import { ModelManager }                          from './data.js';
import { NV2Map3D }                              from './scene.js';
import { Minimap, ProblemList, ModelDialog, MapOverlay, FavoritesBar } from './panels.js';

// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
(async () => {
  const initialModel = ModelManager.getInitial();

  // Construct with empty data; loadModel() will fetch + populate
  window.app         = new NV2Map3D({ nodes: [], links: [] }, initialModel);
  window.modelDialog = new ModelDialog(window.app);
  window.problemList = new ProblemList(window.app);
  window.mapOverlay  = new MapOverlay(window.app);
  try { window._minimap    = new Minimap(window.app); } catch(e) { console.error('Minimap init:', e); }
  try { window._favorites = new FavoritesBar(window.app); } catch(e) { console.error('FavoritesBar init:', e); }

  // Theme aus localStorage wiederherstellen
  // migrate old theme key (nv3d-theme → nv3d_theme)
  if (!localStorage.getItem('nv3d_theme') && localStorage.getItem('nv3d-theme')) {
    localStorage.setItem('nv3d_theme', localStorage.getItem('nv3d-theme'));
    localStorage.removeItem('nv3d-theme');
  }
  const savedTheme = localStorage.getItem('nv3d_theme');
  if (savedTheme === 'light') {
    document.body.dataset.theme = 'light';
    document.getElementById('btn-theme').textContent = '🌙';
    window.app._applyTheme3D(true);
  }

  document.getElementById('btn-model-name').textContent = initialModel.name;

  // Dropdown schließen bei Klick außerhalb
  document.addEventListener('mousedown', e => {
    const dd    = document.getElementById('search-dropdown');
    const input = document.getElementById('search-input');
    if (dd && dd.style.display !== 'none' && !dd.contains(e.target) && e.target !== input)
      dd.style.display = 'none';
  });

  await window.app.loadModel(initialModel);
  window.mapOverlay.open(); // beim Start direkt anzeigen

  // Optional: load additional models from an external registry
  // await ModelManager.loadRegistry('models.json');

  // WS: connect to nagvis2 backend if configured
  _initWsFromStorage();
})();

// ─────────────────────────────────────────────────────────────
//  WS SETTINGS PERSISTENCE
// ─────────────────────────────────────────────────────────────
function _initWsFromStorage() {
  const url   = localStorage.getItem('nv3d_ws_url');
  const token = localStorage.getItem('nv3d_ws_token') || null;
  if (url) window.app.connectWS(url, token);
}

window.connectNv3d = function(url, token) {
  if (url) localStorage.setItem('nv3d_ws_url', url);
  else     localStorage.removeItem('nv3d_ws_url');
  if (token) localStorage.setItem('nv3d_ws_token', token);
  else       localStorage.removeItem('nv3d_ws_token');
  window.app.connectWS(url, token || null);
};

window.disconnectNv3d = function() {
  localStorage.removeItem('nv3d_ws_url');
  localStorage.removeItem('nv3d_ws_token');
  window.app.disconnectWS();
};

// WS dialog open/close
window.openWsDialog = function() {
  document.getElementById('ws-dialog').classList.add('open');
  document.getElementById('ws-url-input').value   = localStorage.getItem('nv3d_ws_url')   || '';
  document.getElementById('ws-token-input').value = localStorage.getItem('nv3d_ws_token') || '';
};
window.closeWsDialog = function() {
  document.getElementById('ws-dialog').classList.remove('open');
};
