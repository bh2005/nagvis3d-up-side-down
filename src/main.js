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

  document.getElementById('btn-model-name').textContent = initialModel.name;
  await window.app.loadModel(initialModel);
  window.mapOverlay.open(); // beim Start direkt anzeigen

  // Optional: load additional models from an external registry
  // await ModelManager.loadRegistry('models.json');

  // WS:  app.connectWS('ws://localhost:8008/ws/map/my-map');
})();
