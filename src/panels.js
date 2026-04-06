import * as THREE from 'three';
import { SC, S, al } from './config.js';
import { fmtM, ModelManager } from './data.js';

//  MINIMAP
// ─────────────────────────────────────────────────────────────
export class Minimap {
  constructor(app) {
    this._app     = app;
    this._el      = document.getElementById('minimap');
    this._canvas  = document.getElementById('minimap-canvas');
    this._ctx     = this._canvas.getContext('2d');
    this._visible = false;
    this._xform   = null;   // gespeicherte Render-Transformation für Klick-Rückrechnung

    document.getElementById('btn-minimap').addEventListener('click', () => this.toggle());
    document.getElementById('minimap-close').addEventListener('click', () => this.hide());

    // Klick auf Canvas → nächsten Node suchen + Kamera dorthin
    this._canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this._canvas.addEventListener('mousemove', (e) => this._onCanvasHover(e));
  }

  _canvasCoords(e) {
    const rect  = this._canvas.getBoundingClientRect();
    const sx    = this._canvas.width  / rect.width;
    const sz    = this._canvas.height / rect.height;
    return { cx: (e.clientX - rect.left) * sx, cz: (e.clientY - rect.top) * sz };
  }

  _nearestNode(cx, cz) {
    if (!this._xform) return null;
    const { minX, minZ, scale, offX, offZ } = this._xform;
    const sceneX = (cx - offX) / scale + minX;
    const sceneZ = (cz - offZ) / scale + minZ;
    const nodes = this._app.data?.nodes ?? [];
    let bestId = null, bestDist = Infinity;
    nodes.forEach(n => {
      const g = this._app.nodeObjects[n.id];
      if (!g || !g.visible) return;
      const d = Math.hypot(g.position.x - sceneX, g.position.z - sceneZ);
      if (d < bestDist) { bestDist = d; bestId = n.id; }
    });
    const pixelDist = bestDist * scale;
    return pixelDist < 14 ? bestId : null;
  }

  _onCanvasClick(e) {
    const { cx, cz } = this._canvasCoords(e);
    const id = this._nearestNode(cx, cz);
    if (id) this._app.focusNode(id);
  }

  _onCanvasHover(e) {
    const { cx, cz } = this._canvasCoords(e);
    this._canvas.style.cursor = this._nearestNode(cx, cz) ? 'pointer' : 'default';
  }

  toggle() { this._visible ? this.hide() : this.show(); }

  show() {
    this._visible = true;
    this._el.classList.add('visible');
    document.getElementById('btn-minimap').classList.add('active');
  }

  hide() {
    this._visible = false;
    this._el.classList.remove('visible');
    document.getElementById('btn-minimap').classList.remove('active');
  }

  render() {
    if (!this._visible) return;
    const app    = this._app;
    const canvas = this._canvas;
    const ctx    = this._ctx;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,12,20,0.95)';
    ctx.fillRect(0, 0, W, H);

    // XZ-Ausdehnung aller sichtbaren Nodes
    const nodes = app.data?.nodes ?? [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    nodes.forEach(n => {
      const g = app.nodeObjects[n.id];
      if (!g) return;
      minX = Math.min(minX, g.position.x); maxX = Math.max(maxX, g.position.x);
      minZ = Math.min(minZ, g.position.z); maxZ = Math.max(maxZ, g.position.z);
    });
    if (!isFinite(minX)) return;

    const pad    = 14;
    const rangeX = Math.max(maxX - minX, 1);
    const rangeZ = Math.max(maxZ - minZ, 1);
    const scale  = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeZ);
    const offX   = (W - rangeX * scale) / 2;
    const offZ   = (H - rangeZ * scale) / 2;
    this._xform  = { minX, minZ, scale, offX, offZ };
    const px = x => (x - minX) * scale + offX;
    const pz = z => (z - minZ) * scale + offZ;

    // Etagen-Umrisse
    app._activeFloors.forEach(fc => {
      const wl = app._floorSceneWL[fc.y];
      if (!wl) return;
      const { W: fw, L: fl } = wl;
      const [r, g, b] = fc.accent;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.3)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(px(-fw / 2), pz(-fl / 2), fw * scale, fl * scale);
    });

    // Node-Punkte
    nodes.forEach(n => {
      const group = app.nodeObjects[n.id];
      if (!group || !group.visible) return;
      const cfg = S(n.status ?? group.userData.status ?? 'unknown');
      const cx  = px(group.position.x);
      const cz  = pz(group.position.z);
      const isAlert = al(n.status);
      if (isAlert) { ctx.shadowColor = '#' + cfg.hex.toString(16).padStart(6, '0'); ctx.shadowBlur = 6; }
      ctx.beginPath();
      ctx.arc(cx, cz, isAlert ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = '#' + cfg.hex.toString(16).padStart(6, '0');
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Kamera-Pfeil
    const cam = app.camera;
    const cpx = Math.max(6, Math.min(W - 6, px(cam.position.x)));
    const cpz = Math.max(6, Math.min(H - 6, pz(cam.position.z)));
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const angle = Math.atan2(dir.x, dir.z);

    ctx.save();
    ctx.translate(cpx, cpz);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-4, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
//  FAVORITES PANEL
// ─────────────────────────────────────────────────────────────
export class FavoritesBar {
  constructor(app) {
    this._app      = app;
    this._el       = document.getElementById('favorites-panel');
    this._list     = document.getElementById('fav-list');
    this._favs     = JSON.parse(localStorage.getItem('nv3d_favorites') || '[]');
    this._slide    = null;
    this._slideIdx = 0;   // index within _slideItems()

    document.getElementById('btn-fav-panel').addEventListener('click', () => this.toggle());
    document.getElementById('fav-close')    .addEventListener('click', () => this.close());
    document.getElementById('btn-fav-save') .addEventListener('click', () => this.saveView());
    document.getElementById('btn-slideshow').addEventListener('click', () => this.toggleSlideshow());

    // Interval änderung während laufender Slideshow → neu starten
    document.getElementById('fav-slide-secs').addEventListener('change', () => {
      if (this._slide) { this.stopSlideshow(); this.startSlideshow(); }
    });

    this._render();
  }

  // ── Panel ────────────────────────────────────────────────────
  toggle() { this._el.classList.contains('open') ? this.close() : this.open(); }
  open()   { this._el.classList.add('open');    document.getElementById('btn-fav-panel').classList.add('active'); }
  close()  { this._el.classList.remove('open'); document.getElementById('btn-fav-panel').classList.remove('active'); }

  // ── Save ─────────────────────────────────────────────────────
  saveView() {
    const cam   = this._app.camera;
    const ctrl  = this._app.controls;
    const thumb = this._app.renderer.domElement.toDataURL('image/jpeg', 0.45);
    this._favs.push({
      id:          Date.now(),
      label:       `View ${this._favs.length + 1}`,
      thumb,
      camPos:      cam.position.toArray(),
      target:      ctrl.target.toArray(),
      inSlideshow: true,
    });
    this._save();
    this._render();
    this.open();
  }

  // ── Navigate ─────────────────────────────────────────────────
  gotoFav(id) {
    const fav = this._favs.find(f => f.id === id);
    if (!fav) return;
    this._app.camera.position.fromArray(fav.camPos);
    this._app.controls.target.fromArray(fav.target);
    this._app.controls.update();
  }

  // Springt zum idx-ten Eintrag der gefilterten Slideshow-Liste
  gotoSlideIdx(idx) {
    const items = this._slideItems();
    if (!items.length) { this.stopSlideshow(); return; }
    this._slideIdx = ((idx % items.length) + items.length) % items.length;
    this.gotoFav(items[this._slideIdx].id);
    this._highlightActive();
  }

  // ── Rename ───────────────────────────────────────────────────
  renameFav(id, raw) {
    const label = raw.trim();
    if (!label) return;
    const fav = this._favs.find(f => f.id === id);
    if (fav) { fav.label = label; this._save(); }
  }

  // ── Delete ───────────────────────────────────────────────────
  deleteFav(id) {
    this._favs = this._favs.filter(f => f.id !== id);
    this._save();
    if (this._slide) this.stopSlideshow();
    this._render();
  }

  // ── Slideshow ────────────────────────────────────────────────
  _slideItems() { return this._favs.filter(f => f.inSlideshow !== false); }

  _slideInterval() {
    const v = parseInt(document.getElementById('fav-slide-secs').value, 10);
    return Math.max(1, isNaN(v) ? 4 : v) * 1000;
  }

  toggleSlideshow() { this._slide ? this.stopSlideshow() : this.startSlideshow(); }

  startSlideshow() {
    if (this._slideItems().length < 2) return;
    this._slideIdx = 0;
    this.gotoSlideIdx(0);
    this._slide = setInterval(() => this.gotoSlideIdx(this._slideIdx + 1), this._slideInterval());
    const btn = document.getElementById('btn-slideshow');
    btn.classList.add('active');
    btn.textContent = '⏹ Stop';
  }

  stopSlideshow() {
    clearInterval(this._slide);
    this._slide = null;
    this._highlightActive();
    const btn = document.getElementById('btn-slideshow');
    btn.classList.remove('active');
    btn.textContent = '▶ Slideshow';
  }

  // ── Internal ─────────────────────────────────────────────────
  _highlightActive() {
    const items    = this._slideItems();
    const activeId = items[this._slideIdx]?.id;
    this._list.querySelectorAll('.fav-row').forEach(row => {
      row.classList.toggle('fav-active', Number(row.dataset.id) === activeId);
    });
  }

  _save() { localStorage.setItem('nv3d_favorites', JSON.stringify(this._favs)); }

  _render() {
    this._list.innerHTML = '';
    const ssBtn = document.getElementById('btn-slideshow');

    if (this._favs.length === 0) {
      ssBtn.disabled = true;
      this._list.innerHTML =
        '<div class="fav-empty">Noch keine Favoriten.<br>Mit <b>＋ Speichern</b> aktuelle Ansicht sichern.</div>';
      return;
    }

    this._updateSsBtn();

    this._favs.forEach(fav => {
      // inSlideshow rückwärtskompatibel: undefined → true
      if (fav.inSlideshow === undefined) fav.inSlideshow = true;

      const row = document.createElement('div');
      row.className  = 'fav-row';
      row.dataset.id = fav.id;
      row.innerHTML  = `
        <img src="${fav.thumb}" class="fav-row-thumb" alt="" title="Ansicht laden">
        <input class="fav-row-label" value="${fav.label.replace(/"/g, '&quot;')}"
               spellcheck="false" title="Klicken zum Umbenennen">
        <label class="fav-slide-wrap" title="In Slideshow einschließen">
          <input type="checkbox" class="fav-slide-check" ${fav.inSlideshow ? 'checked' : ''}>
          <span class="fav-slide-icon"></span>
        </label>
        <div class="fav-row-btns">
          <button class="btn btn-sm fav-goto" title="Ansicht laden">↗</button>
          <button class="btn btn-sm fav-del"  title="Löschen">✕</button>
        </div>
      `;

      const input = row.querySelector('.fav-row-label');
      input.addEventListener('change',  () => this.renameFav(fav.id, input.value));
      input.addEventListener('blur',    () => this.renameFav(fav.id, input.value));
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); e.stopPropagation(); });

      const check = row.querySelector('.fav-slide-check');
      check.addEventListener('change', () => {
        fav.inSlideshow = check.checked;
        this._save();
        this._updateSsBtn();
        // läuft Slideshow und zu wenige Einträge → stoppen
        if (this._slide && this._slideItems().length < 2) this.stopSlideshow();
      });

      const jump = () => { this.gotoFav(fav.id); this._highlightActive(); };
      row.querySelector('.fav-row-thumb').addEventListener('click', jump);
      row.querySelector('.fav-goto')     .addEventListener('click', jump);
      row.querySelector('.fav-del')      .addEventListener('click', e => { e.stopPropagation(); this.deleteFav(fav.id); });

      this._list.appendChild(row);
    });

    if (this._slide) this._highlightActive();
  }

  _updateSsBtn() {
    document.getElementById('btn-slideshow').disabled = this._slideItems().length < 2;
  }
}

// ─────────────────────────────────────────────────────────────
//  PROBLEM LIST
// ─────────────────────────────────────────────────────────────
export class ProblemList {
  constructor(app) {
    this.app   = app;
    this._el   = document.getElementById('problem-panel');
    this._list = document.getElementById('prob-list');
    this._btn  = document.getElementById('btn-problems');
    document.getElementById('prob-close').onclick = () => this.close();
    this._el.addEventListener('click', e => { if (e.target === this._el) this.close(); });
  }

  toggle() { this._el.classList.toggle('open'); }
  close()  { this._el.classList.remove('open'); }

  update(nodes) {
    const problems = nodes
      .filter(n => n.status !== 'ok')
      .sort((a, b) => (SC[b.status]?.sev ?? 0) - (SC[a.status]?.sev ?? 0));

    const critCount = problems.filter(n => al(n.status)).length;

    // Update header button
    this._btn.textContent = critCount > 0 ? `⚠ ${critCount}` : `⚑ ${problems.length}`;
    this._btn.classList.toggle('has-crit', critCount > 0);
    this._btn.classList.toggle('has-warn', critCount === 0 && problems.length > 0);

    this._list.innerHTML = '';

    if (problems.length === 0) {
      this._list.innerHTML = '<div class="prob-empty">Alle Hosts OK ✓</div>';
      return;
    }

    problems.forEach(n => {
      const cfg = S(n.status);
      const row = document.createElement('div');
      row.className = 'prob-row';
      row.innerHTML = `
        <span class="s-badge ${cfg.badge}" style="flex-shrink:0">${cfg.label}</span>
        <div class="prob-info">
          <span class="prob-name">${n.label}</span>
          <span class="prob-floor">${n.floor ?? n.type}</span>
        </div>
        <span class="prob-arrow">›</span>
      `;
      row.onclick = () => { this.app.focusNode(n.id); this.close(); };
      this._list.appendChild(row);
    });
  }
}

// ─────────────────────────────────────────────────────────────
//  MODEL DIALOG
// ─────────────────────────────────────────────────────────────
export class ModelDialog {
  constructor(app) {
    this.app     = app;
    this._el     = document.getElementById('model-dialog');
    this._list   = document.getElementById('model-list');
    this._form   = document.getElementById('model-form');
    this._newSec = document.getElementById('model-new-section');
    this._setupEvents();
  }

  open()  { this._renderList(); this._newSec.style.display = 'none'; this._el.classList.add('open'); }
  close() { this._el.classList.remove('open'); }

  _metaLine(m) {
    if (m.floors) {
      const hasWL  = m.floors.some(f => f.widthM);
      if (hasWL) {
        const maxW = Math.max(...m.floors.filter(f=>f.widthM).map(f => f.widthM));
        const maxL = Math.max(...m.floors.filter(f=>f.lengthM).map(f => f.lengthM));
        return `${m.floors.length} Ebenen · max. ${fmtM(maxW)} × ${fmtM(maxL)}`;
      }
      return `${m.floors.length} Ebenen · Ausmaße aus Hosts`;
    }
    return `${m.floorCount} Etagen · ${m.width} × ${m.length} m · ${m.floorHeight} m/Etage`;
  }

  _renderList() {
    const models   = ModelManager.getAll();
    const activeId = this.app._model?.id;
    this._list.innerHTML = '';
    models.forEach(m => {
      const isActive  = m.id === activeId;
      const typeLabel = m.type === 'mine' ? '⛏ Grube' : '🏢 Hochhaus';
      const isGeo     = !!(m.floors && !m.floors[0]?.widthM);
      const row = document.createElement('div');
      row.className = 'model-row' + (isActive ? ' active' : '');
      row.innerHTML = `
        <div class="model-info">
          <div class="model-row-top">
            <span class="model-name">${m.name}</span>
            <span class="model-type-tag ${m.type}">${typeLabel}</span>
            ${isGeo ? `<span class="model-var-tag">⊕ Geo</span>` : ''}
          </div>
          <div class="model-meta">${this._metaLine(m)}</div>
        </div>
        <div class="model-actions">
          ${isActive
            ? `<span class="model-active-badge">✓ Aktiv</span>`
            : `<button class="btn btn-sm" data-select="${m.id}">Laden</button>`}
          ${!ModelManager.isPreset(m.id)
            ? `<button class="btn btn-sm btn-del" data-delete="${m.id}" title="Löschen">✕</button>`
            : ''}
        </div>`;
      this._list.appendChild(row);
    });
  }

  _setupEvents() {
    this._list.addEventListener('click', e => {
      const selId = e.target.closest('[data-select]')?.dataset.select;
      const delId = e.target.closest('[data-delete]')?.dataset.delete;
      if (selId) { const cfg = ModelManager.getById(selId); if (cfg) { this.app.loadModel(cfg); this.close(); } }
      if (delId && confirm('Modell löschen?')) { ModelManager.remove(delId); this._renderList(); }
    });

    document.getElementById('btn-new-model').onclick = () => {
      this._newSec.style.display = this._newSec.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('btn-cancel-new').onclick = () => { this._newSec.style.display = 'none'; };

    this._form.onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(this._form));
      ModelManager.add({
        id: 'model_' + Date.now(), name: d.name.trim(), type: d.type,
        floorCount: parseInt(d.floorCount)||4, width: parseFloat(d.width)||110,
        length: parseFloat(d.length)||110, floorHeight: parseFloat(d.floorHeight)||3,
        lat: parseFloat(d.lat)||0, lon: parseFloat(d.lon)||0,
      });
      this._form.reset(); this._newSec.style.display = 'none'; this._renderList();
    };

    this._el.addEventListener('click', e => { if (e.target === this._el) this.close(); });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._el.classList.contains('open')) {
        e.stopImmediatePropagation(); this.close();
      }
    }, true);
  }
}

// ─────────────────────────────────────────────────────────────
//  MAP OVERLAY  (Leaflet / OSM)
//  Zeigt alle Modelle mit lat/lon als farbige Marker auf einer
//  CARTO-Dark-Karte. Klick auf Marker → loadModel(). Kein API-Key.
// ─────────────────────────────────────────────────────────────
export class MapOverlay {
  constructor(app) {
    this.app        = app;
    this._el        = document.getElementById('map-overlay');
    this._select    = document.getElementById('map-site-select');
    this._loadBtn   = document.getElementById('map-load-btn');
    this._map       = null;      // Leaflet-Instanz (lazy init)
    this._markers   = new Map(); // modelId → L.circleMarker
    this._selectedId = null;

    this._select.addEventListener('change', () => this._onSelect());
    this._loadBtn.addEventListener('click',  () => this._loadSelected());
  }

  toggle() { this._el.classList.contains('open') ? this.close() : this.open(); }

  open() {
    this._el.classList.add('open');
    this._populateSelect();
    if (!this._map) {
      this._initMap();
    } else {
      this._refreshMarkers();
      setTimeout(() => this._map.invalidateSize(), 50);
    }
  }

  close() { this._el.classList.remove('open'); }

  // Nach jedem loadModel() aktiven Marker-Ring aktualisieren
  update() { if (this._map) this._refreshMarkers(); }

  // ── Private ──────────────────────────────────────────────────

  _geoModels() {
    return ModelManager.getAll().filter(m => m.lat != null && m.lon != null);
  }

  _populateSelect() {
    const models   = this._geoModels();
    const activeId = this.app._model?.id;
    this._select.innerHTML = '<option value="">– Standort wählen –</option>';
    models.forEach(cfg => {
      const opt = document.createElement('option');
      opt.value    = cfg.id;
      opt.textContent = cfg.name;
      if (cfg.id === activeId) opt.selected = true;
      this._select.appendChild(opt);
    });
    this._selectedId = activeId ?? null;
    this._loadBtn.disabled = !this._selectedId;
  }

  _onSelect() {
    const id  = this._select.value;
    this._selectedId = id || null;
    this._loadBtn.disabled = !this._selectedId;
    if (!id || !this._map) return;
    const cfg = ModelManager.getById(id);
    if (!cfg) return;
    const marker = this._markers.get(id);
    if (marker && this._cluster) {
      // Cluster aufspringen lassen und dann zum Marker fliegen
      this._cluster.zoomToShowLayer(marker, () => {
        this._map.flyTo([cfg.lat, cfg.lon], 12, { duration: 0.6 });
      });
    } else {
      this._map.flyTo([cfg.lat, cfg.lon], 12, { duration: 0.8 });
    }
  }

  _loadSelected() {
    if (!this._selectedId) return;
    const cfg = ModelManager.getById(this._selectedId);
    if (!cfg) return;
    this.close();
    this.app.loadModel(cfg);
  }

  _initMap() {
    /* global L */
    this._map = L.map('leaflet-container', { zoomControl: true });

    // CARTO Voyager — neutrales Grau-Beige, kein API-Key nötig
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &amp; © <a href="https://carto.com/" target="_blank">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(this._map);

    // Cluster-Gruppe: Marker werden beim Rauszoomen gebündelt
    this._cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      showCoverageOnHover: false,
    });
    this._map.addLayer(this._cluster);

    this._refreshMarkers();
  }

  _refreshMarkers() {
    const TYPE_COLOR = {
      mine:       '#1a9e5c',
      building:   '#2c6fbe',
      datacenter: '#0d7ab5',
    };
    const TYPE_LABEL = { mine: 'Grube / Schacht', building: 'Gebäude', datacenter: 'Datacenter' };
    const activeId   = this.app._model?.id;

    if (this._cluster) this._cluster.clearLayers();
    this._markers.clear();

    const models = this._geoModels();
    const bounds = [];

    models.forEach(cfg => {
      const isActive = cfg.id === activeId;
      const color    = TYPE_COLOR[cfg.type] ?? '#666';

      const marker = L.circleMarker([cfg.lat, cfg.lon], {
        radius:      isActive ? 13 : 9,
        fillColor:   color,
        color:       isActive ? '#222' : '#fff',
        weight:      isActive ? 2.5 : 1.5,
        opacity:     1,
        fillOpacity: isActive ? 1.0 : 0.82,
      });

      marker.bindTooltip(
        `<strong>${cfg.name}</strong><br><span>${TYPE_LABEL[cfg.type] ?? cfg.type}</span>`,
        { className: 'map-tooltip', direction: 'top', offset: [0, -12], sticky: false }
      );

      marker.on('click', () => {
        this._select.value     = cfg.id;
        this._selectedId       = cfg.id;
        this._loadBtn.disabled = false;
        this.close();
        this.app.loadModel(cfg);
      });

      this._cluster.addLayer(marker);
      this._markers.set(cfg.id, marker);
      bounds.push([cfg.lat, cfg.lon]);
    });

    if (bounds.length) {
      this._map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
    setTimeout(() => this._map.invalidateSize(), 60);
  }
}
