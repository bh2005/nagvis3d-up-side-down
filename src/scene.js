import * as THREE        from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer,
         CSS2DObject }   from 'three/addons/renderers/CSS2DRenderer.js';

import { SC, S, al, SCENE_MAX, FLOOR_STEP, TUNNEL_MIN_DIST } from './config.js';
import { fmtM, computeGeoLayout, buildFloors, ModelManager } from './data.js';

// ─────────────────────────────────────────────────────────────
//  CSS2D CLEANUP
//  CSS2DRenderer nutzt eine WeakMap als Cache. Wird ein Objekt aus der
//  Szene entfernt und hat keine anderen JS-Referenzen mehr, kann der GC
//  den Eintrag löschen bevor der Renderer aufräumt → DOM-Element bleibt
//  sichtbar ("hängende Labels"). Explizites Entfernen aus dem DOM ist
//  die sichere Lösung.
// ─────────────────────────────────────────────────────────────
function disposeCSS2D(object) {
  object.traverse(child => {
    if (child.isCSS2DObject && child.element?.parentNode) {
      child.element.parentNode.removeChild(child.element);
    }
  });
}

// ─────────────────────────────────────────────────────────────
//  NV2Map3D
// ─────────────────────────────────────────────────────────────
export class NV2Map3D {
  constructor(data, initialModel) {
    this.data          = data;
    this.nodeObjects   = {};
    this.nodePositions = {};   // id → THREE.Vector3 (scene units)
    this.linkObjects   = [];
    this.tunnelObjects = [];
    this.alertObjs     = [];
    this.autoOrbit     = true;
    this.orbitRadius   = 90;   // Slider-gesteuert (30–250)
    this.flowSpeed     = 0.4;
    this._activeNode   = null;
    this._floorObjs    = [];
    this._floorPlates  = {};
    this._floorSceneWL = {};   // y → { W, L }
    this._bgMeshes     = {};
    this._bgMats       = {};
    this._mode2D       = false;
    this._floor2DY     = null;
    // ── New feature state ──
    this._pulseRings   = [];   // expanding alert rings
    this._searchRings  = [];   // highlight rings for search
    this._wifiMeshes   = {};   // id → heatmap mesh for APs
    this._cockpitMode  = false;
    this._prevStatus   = {};   // id → last known status (for pulse detection)
    // ── Exploded-View state ──
    this._explodeFactor      = 1.0;   // current (animated)
    this._explodeTarget      = 1.0;   // target
    this._baseNodePositions  = {};    // id → Vector3 at factor=1
    this._floorCenterY       = 0;     // midpoint of all floor Ys

    this._model        = initialModel;
    this._activeFloors = buildFloors(initialModel);
    this._applyGeoLayout(data.nodes);   // enriches _activeFloors + fills nodePositions

    this._initScene();
    this._initLabels();
    this._buildNodes();
    this._buildLinks();
    this._buildFloors();
    this._buildFloorNav();
    this._storeBasePositions();
    this._setupUI();
    this._animate();
    this._log('Scene ready · ' + data.nodes.length + ' nodes');
  }

  // ── Geo layout ────────────────────────────────────────────
  // Uses lat/lon if nodes have them AND the model has a reference centre.
  // Falls back to static x/y/z otherwise.

  _applyGeoLayout(nodes) {
    const cfg = this._model;
    // Geo-Projektion nur für Modelle mit explizitem floors[]-Array
    // UND wenn mindestens ein Node ein passendes Floor-Label hat
    const hasGeo = cfg.lat && cfg.lon && Array.isArray(cfg.floors) &&
      nodes.some(n => n.lat != null && cfg.floors.some(f => f.label === n.floor));

    if (hasGeo) {
      const { floors, nodePos } = computeGeoLayout(nodes, this._activeFloors, cfg);
      this._activeFloors = floors;
      nodes.forEach(n => {
        const p = nodePos[n.id] ?? { x: 0, y: 0, z: 0 };
        this.nodePositions[n.id] = new THREE.Vector3(p.x, p.y, p.z);
      });
    } else {
      nodes.forEach(n => {
        this.nodePositions[n.id] = new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.z ?? 0);
      });
    }
  }

  // ── Load / switch model ────────────────────────────────────

  async loadModel(cfg) {
    // ── Fetch external data (cached after first load) ──────
    const overlay = document.getElementById('load-overlay');
    if (overlay) overlay.style.display = 'flex';
    let data;
    try {
      data = await ModelManager.fetchData(cfg);
    } catch (err) {
      this._log(`Fehler beim Laden: ${err.message}`);
      console.error(err);
      if (overlay) overlay.style.display = 'none';
      return;
    }

    if (this._mode2D) this.exit2D();
    this.data          = data;
    this._model        = cfg;
    this._activeFloors = buildFloors(cfg);
    this.nodePositions = {};
    this._applyGeoLayout(this.data.nodes);

    // Clear search / pulse / wifi state
    this._clearSearch(false);
    this._pulseRings.forEach(r => { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); });
    this._pulseRings = [];
    Object.values(this._wifiMeshes).forEach(m => { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    this._wifiMeshes = {};
    this._prevStatus = {};
    if (this._cockpitMode) this.toggleCockpit();   // exit cockpit on model switch

    // Rebuild node/link scene objects with new positions
    Object.values(this.nodeObjects).forEach(g => { disposeCSS2D(g); this.scene.remove(g); });
    this.linkObjects.forEach(({ line, spark }) => {
      this.scene.remove(line); this.scene.remove(spark);
    });
    this.tunnelObjects.forEach(({ tube, glow, spark }) => {
      this.scene.remove(tube); this.scene.remove(glow); this.scene.remove(spark);
      tube.geometry.dispose(); glow.geometry.dispose();
    });
    this.nodeObjects   = {};
    this.linkObjects   = [];
    this.tunnelObjects = [];
    this.alertObjs     = [];
    this._buildNodes();
    this._buildLinks();
    this._buildFloors();
    this._buildFloorNav();
    this._storeBasePositions();
    this._explodeFactor = 1.0; this._explodeTarget = 1.0;
    const sl = document.getElementById('explode-slider');
    if (sl) { sl.value = 100; document.getElementById('explode-val').textContent = '1.0×'; }

    const nameEl = document.getElementById('btn-model-name');
    if (nameEl) nameEl.textContent = cfg.name;

    history.replaceState(null, '', '#' + cfg.id);
    this._log(`Model: ${cfg.name} · ${data.nodes.length} Nodes`);
    window.problemList?.update(this.data.nodes);
    window.mapOverlay?.update();   // aktiven Marker auf der OSM-Karte neu setzen
    if (overlay) overlay.style.display = 'none';
  }

  // ── Scene ──────────────────────────────────────────────────

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x080a0e, 0.003);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    document.getElementById('canvas-wrap').appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 1500);
    this.camera.position.set(130, 80, 130);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(60, 100, 40);
    this.scene.add(sun);
    this._accentLight = new THREE.PointLight(0x3060aa, 1.8, 280);
    this._accentLight.position.set(0, 55, 0);
    this.scene.add(this._accentLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance   = 5;
    this.controls.maxDistance   = 900;

    this.renderer.domElement.addEventListener('pointerdown', () => {
      if (this.autoOrbit) this._setAutoOrbit(false);
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.labelRenderer.setSize(innerWidth, innerHeight);
    });
  }

  _initLabels() {
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(innerWidth, innerHeight);
    Object.assign(this.labelRenderer.domElement.style, {
      position:'absolute', top:'0', left:'0', pointerEvents:'none', zIndex:'2'
    });
    document.getElementById('canvas-wrap').appendChild(this.labelRenderer.domElement);
  }

  // ── Floor texture ──────────────────────────────────────────

  _genFloorTexture(fc, idx, total) {
    const sz = 512, cv = document.createElement('canvas');
    cv.width = cv.height = sz;
    const ctx = cv.getContext('2d');
    const [r,g,b] = fc.accent;
    const ac = (a) => `rgba(${r},${g},${b},${a})`;

    ctx.fillStyle = '#030608';
    ctx.fillRect(0, 0, sz, sz);

    // Dot grid
    ctx.fillStyle = ac(0.13);
    for (let i = 32; i < sz; i += 32)
      for (let j = 32; j < sz; j += 32)
        ctx.fillRect(i-1, j-1, 2, 2);

    // Outer frame + corners
    ctx.strokeStyle = ac(0.45); ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, sz-36, sz-36);
    ctx.lineWidth = 1; ctx.strokeStyle = ac(0.7);
    [[18,18,1,1],[494,18,-1,1],[18,494,1,-1],[494,494,-1,-1]].forEach(([cx,cy,sx,sy]) => {
      ctx.beginPath();
      ctx.moveTo(cx+sx*24, cy); ctx.lineTo(cx,cy); ctx.lineTo(cx,cy+sy*24); ctx.stroke();
    });

    // Room plan outlines
    const plans = [
      [[60,60,200,160],[295,60,155,155],[60,260,390,160]],
      [[60,60,390,110],[60,210,175,205],[270,210,180,205]],
      [[60,60,135,135],[235,60,215,135],[60,240,390,210]],
      [[145,145,222,222]],
    ];
    ctx.strokeStyle = ac(0.22); ctx.lineWidth = 1.5;
    plans[idx % plans.length].forEach(([x,y,w,h]) => ctx.strokeRect(x,y,w,h));

    // Level dots
    for (let i = 0; i < total; i++) {
      ctx.beginPath(); ctx.fillStyle = i === idx ? ac(0.85) : ac(0.18);
      ctx.arc(38 + i*16, 487, i === idx ? 5 : 3, 0, Math.PI*2); ctx.fill();
    }

    // Watermarks
    ctx.fillStyle = ac(0.055); ctx.font = 'bold 66px monospace'; ctx.textAlign = 'center';
    ctx.fillText(fc.label, sz/2, 285);
    if (fc.widthM && fc.lengthM) {
      ctx.fillStyle = ac(0.05); ctx.font = 'italic 17px monospace';
      ctx.fillText(`${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}`, sz/2, 318);
    }

    // Header text
    ctx.fillStyle = ac(0.70); ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left';
    ctx.fillText(fc.label, 32, 43);
    ctx.fillStyle = ac(0.40); ctx.font = '11px monospace';
    ctx.fillText(fc.sub, 32, 60);
    if (fc.widthM && fc.lengthM) {
      ctx.fillStyle = ac(0.25); ctx.font = '10px monospace';
      ctx.fillText(`${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}`, 32, 76);
    }

    return new THREE.CanvasTexture(cv);
  }

  // ── WLAN heatmap texture (radial gradient per AP status) ──

  _genWifiTexture(status) {
    const sz = 256, cv = document.createElement('canvas');
    cv.width = cv.height = sz;
    const ctx = cv.getContext('2d');
    const pal = { ok:[39,174,96], warning:[230,126,34], critical:[231,76,60], down:[192,57,43] };
    const [r,g,b] = pal[status] ?? pal.ok;
    const grd = ctx.createRadialGradient(sz/2,sz/2, 0, sz/2,sz/2, sz/2);
    grd.addColorStop(0,    `rgba(${r},${g},${b},0.50)`);
    grd.addColorStop(0.35, `rgba(${r},${g},${b},0.28)`);
    grd.addColorStop(0.70, `rgba(${r},${g},${b},0.10)`);
    grd.addColorStop(1,    `rgba(${r},${g},${b},0)`);
    // Concentric signal rings
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, sz, sz);
    ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
    ctx.lineWidth = 1.5;
    [0.30, 0.55, 0.80].forEach(frac => {
      ctx.beginPath();
      ctx.arc(sz/2, sz/2, sz/2 * frac, 0, Math.PI*2);
      ctx.stroke();
    });
    return new THREE.CanvasTexture(cv);
  }

  // ── dBm → scene-unit radius  (-30 dBm strong → 48u, -90 dBm weak → 8u) ──

  _dbmToRadius(dbm) {
    const clamped = Math.max(-90, Math.min(-30, dbm ?? -65));
    // linear map: -30→48, -90→8
    return 8 + (clamped - (-90)) / 60 * 40;
  }

  // ── WLAN heatmap plane (placed on the nearest floor) ──────

  _buildWifiHeatmap(node, pos) {
    const radius = node.wifiDbm != null ? this._dbmToRadius(node.wifiDbm) : (node.wifiRadius ?? 22);
    const tex    = this._genWifiTexture(node.status);
    const mat    = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const geo  = new THREE.CircleGeometry(radius, 64);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    const floorY = this._activeFloors.length
      ? this._activeFloors.reduce((best, f) =>
          Math.abs(f.y - pos.y) < Math.abs(best - pos.y) ? f.y : best,
          this._activeFloors[0].y)
      : pos.y;
    mesh.position.set(pos.x, floorY + 0.25, pos.z);
    this.scene.add(mesh);
    this._wifiMeshes[node.id] = mesh;
  }

  // ── Build floors ───────────────────────────────────────────

  _buildFloors() {
    this._floorObjs.forEach(o => { disposeCSS2D(o); this.scene.remove(o); });
    this._floorObjs    = [];
    this._floorPlates  = {};
    this._floorSceneWL = {};

    if (this._model.type === 'datacenter') { this._buildDCLayout(); return; }

    // Normalise: largest floor → SCENE_MAX units
    const allW   = this._activeFloors.map(f => f.widthM  ?? 110);
    const allL   = this._activeFloors.map(f => f.lengthM ?? 110);
    const maxDim = Math.max(...allW, ...allL);
    const scale  = SCENE_MAX / maxDim;
    const total  = this._activeFloors.length;

    this._activeFloors.forEach((fc, idx) => {
      const W = (fc.widthM  ?? 110) * scale;
      const L = (fc.lengthM ?? 110) * scale;
      this._floorSceneWL[fc.y] = { W, L };

      const tex = this._genFloorTexture(fc, idx, total);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.72, side: THREE.DoubleSide
      });
      this._floorPlates[fc.y] = mat;

      const plate = new THREE.Mesh(new THREE.PlaneGeometry(W, L), mat);
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = fc.y - 0.05;
      plate.userData.floorY = fc.y;
      plate.userData.floorYOffset = -0.05;
      this.scene.add(plate);
      this._floorObjs.push(plate);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, L)),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(...fc.accent.map(v=>v/255)),
          transparent: true, opacity: 0.3
        })
      );
      edges.rotation.x = -Math.PI / 2;
      edges.position.y = fc.y;
      edges.userData.floorY = fc.y;
      edges.userData.floorYOffset = 0;
      this.scene.add(edges);
      this._floorObjs.push(edges);

      // CSS2D label
      const div = document.createElement('div');
      div.className = 'node-label floor-label';
      const [r,g,b_] = fc.accent;
      div.style.cssText = `color:rgba(${r},${g},${b_},.7);border-color:rgba(${r},${g},${b_},.2)`;
      div.innerHTML = `<b>${fc.label}</b>` +
        (fc.widthM ? `<br><span style="opacity:.5;font-size:8px">${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}</span>` : '');

      const lbl = new CSS2DObject(div);
      lbl.position.set(-(W/2 + 6), fc.y + 0.5, 0);
      lbl.userData.floorY = fc.y;
      lbl.userData.floorYOffset = 0.5;
      this.scene.add(lbl);
      this._floorObjs.push(lbl);
    });
  }

  // ── Datacenter layout: Bodenplatte + Rack-Rahmen ───────────

  _buildDCLayout() {
    const cfg    = this._model;
    const W      = (cfg.width  ?? 20) * 2;   // Szeneneinheiten (1 u = 0.5 m)
    const L      = (cfg.length ?? 10) * 2;
    const rows   = cfg.rows       ?? 3;
    const rpRow  = cfg.racksPerRow ?? 5;
    const rackH  = 8;    // 42 HE = 8 Szeneneinheiten
    const rackW  = 1.4;
    const rackD  = 0.8;

    // Bodenplatte (Doppelboden)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, L),
      new THREE.MeshBasicMaterial({ color:0x0b1018, transparent:true, opacity:0.92, side:THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    this.scene.add(floor); this._floorObjs.push(floor);

    // Raster (Doppelbodenfliesen 0.6 m = 1.2 u)
    const tileSize = 1.2;
    const gridMat  = new THREE.LineBasicMaterial({ color:0x1c3a50, transparent:true, opacity:0.30 });
    for (let x = -W/2; x <= W/2 + 0.01; x += tileSize) {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,0,-L/2), new THREE.Vector3(x,0,L/2)]),
        gridMat);
      this.scene.add(l); this._floorObjs.push(l);
    }
    for (let z = -L/2; z <= L/2 + 0.01; z += tileSize) {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-W/2,0,z), new THREE.Vector3(W/2,0,z)]),
        gridMat);
      this.scene.add(l); this._floorObjs.push(l);
    }

    // Rack-Rahmen pro Reihe × Rack
    const rowColors = [[0,180,220],[19,211,142],[200,120,50]];
    for (let ri = 0; ri < rows; ri++) {
      const rz = -L/2 + (ri + 1) * L / (rows + 1);
      const [r,g,b] = rowColors[ri % rowColors.length];
      const edgeMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(r/255, g/255, b/255), transparent:true, opacity:0.55 });
      const heMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(r/255, g/255, b/255), transparent:true, opacity:0.14 });

      for (let xi = 0; xi < rpRow; xi++) {
        const rx = -W/2 + (xi + 1) * W / (rpRow + 1);

        // Rack-Rahmen (EdgesGeometry des Rack-Box)
        const rack = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(rackW, rackH, rackD)),
          edgeMat);
        rack.position.set(rx, rackH / 2, rz);
        this.scene.add(rack); this._floorObjs.push(rack);

        // HE-Markierungslinien (alle 7 HE)
        for (let u = 7; u < 42; u += 7) {
          const uy = (u / 42) * rackH;
          const shelf = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(rx - rackW/2, uy, rz - rackD/2),
              new THREE.Vector3(rx + rackW/2, uy, rz - rackD/2),
            ]), heMat);
          this.scene.add(shelf); this._floorObjs.push(shelf);
        }
      }

      // Reihen-Label
      const rowName = String.fromCharCode(65 + ri);
      const div = document.createElement('div');
      div.className = 'node-label floor-label';
      div.style.cssText = `color:rgba(${r},${g},${b},.65);border-color:rgba(${r},${g},${b},.2)`;
      div.innerHTML = `<b>Reihe ${rowName}</b>`;
      const lbl = new CSS2DObject(div);
      lbl.position.set(-W/2 - 3, rackH / 2, rz);
      this.scene.add(lbl); this._floorObjs.push(lbl);
    }
  }

  // ── Floor nav panel ────────────────────────────────────────

  _buildFloorNav() {
    const panel = document.getElementById('floor-panel');
    panel.innerHTML = '';

    if (this._model.type === 'datacenter') {
      const rows      = this._model.rows ?? 3;
      const rowColors = [[0,180,220],[19,211,142],[200,120,50],[200,120,180],[180,160,40]];
      const L         = (this._model.length ?? 10) * 2;

      ['A','B','C','D','E'].slice(0, rows).forEach((name, i) => {
        const [r,g,b] = rowColors[i % rowColors.length];
        const rz      = -L/2 + (i + 1) * L / (rows + 1);

        // Racks dieser Reihe aus Node-Daten (room = "Rack X*")
        const reiheNodes = this.data.nodes.filter(n => n.room?.startsWith(`Rack ${name}`));
        const rackMap    = new Map();
        reiheNodes.forEach(n => {
          if (!rackMap.has(n.room)) rackMap.set(n.room, []);
          rackMap.get(n.room).push(n);
        });

        // Schlechtester Status der Reihe
        const worstSev = reiheNodes.reduce((m, n) => Math.max(m, S(n.status).sev), 0);
        const worstCfg = Object.values(SC).find(c => c.sev === worstSev) ?? SC.unknown;
        const badgeHex = '#' + worstCfg.hex.toString(16).padStart(6, '0');

        const section = document.createElement('div');
        section.className = 'floor-section';

        const row = document.createElement('div');
        row.className = 'floor-row';

        const btn = document.createElement('button');
        btn.className = 'floor-btn';
        btn.innerHTML =
          `<span class="fb-label">Reihe ${name}</span>` +
          `<span class="fb-dim">${rackMap.size} Racks</span>` +
          `<span class="fb-dot" style="background:rgba(${r},${g},${b},.7);box-shadow:0 0 5px rgba(${r},${g},${b},.5)"></span>`;
        btn.onclick = () => {
          this._setAutoOrbit(false);
          this.camera.position.set(0, 12, rz + 28);
          this.controls.target.set(0, 4, rz);
          this.controls.update();
        };
        row.appendChild(btn);

        if (rackMap.size > 0) {
          const rackList = document.createElement('div');
          rackList.className = 'floor-node-list';

          rackMap.forEach((nodes, rackName) => {
            const rWorstSev = nodes.reduce((m, n) => Math.max(m, S(n.status).sev), 0);
            const rCfg      = Object.values(SC).find(c => c.sev === rWorstSev) ?? SC.unknown;
            const rHex      = '#' + rCfg.hex.toString(16).padStart(6, '0');

            // Rack-Mittelpunkt
            const poses = nodes.map(n => this.nodePositions[n.id]).filter(Boolean);
            const cx = poses.reduce((s, p) => s + p.x, 0) / (poses.length || 1);
            const cz = poses.reduce((s, p) => s + p.z, 0) / (poses.length || 1);

            const pill = document.createElement('button');
            pill.className = 'floor-node-pill';
            pill.title = nodes.map(n => n.label).join(', ');
            pill.innerHTML =
              `<span class="fnp-dot" style="background:${rHex};box-shadow:0 0 4px ${rHex}88"></span>` +
              `<span class="fnp-name">${rackName}</span>` +
              `<span class="fnp-type">${nodes.length}</span>`;
            pill.onclick = () => {
              this._setAutoOrbit(false);
              this.camera.position.set(cx + 8, 14, cz + 16);
              this.controls.target.set(cx, 4, cz);
              this.controls.update();
            };
            rackList.appendChild(pill);
          });

          const expandBtn = document.createElement('button');
          expandBtn.className = 'floor-expand-btn';
          expandBtn.title = `${rackMap.size} Racks in Reihe ${name}`;
          expandBtn.innerHTML =
            `<span class="feb-count" style="color:${badgeHex}">${rackMap.size}</span>` +
            `<span class="feb-arrow">▸</span>`;
          expandBtn.onclick = () => {
            const open = rackList.classList.toggle('open');
            expandBtn.classList.toggle('open', open);
          };

          row.appendChild(expandBtn);
          section.appendChild(row);
          section.appendChild(rackList);
        } else {
          section.appendChild(row);
        }

        panel.appendChild(section);
      });
      return;
    }

    [...this._activeFloors].sort((a,b) => b.y - a.y).forEach(fc => {
      const [r,g,b_] = fc.accent;

      // Räume auf dieser Etage (nur Nodes mit room-Feld)
      const floorNodes = this.data.nodes.filter(n => n.floor === fc.label && n.room);

      // Räume gruppieren: roomName → { nodes[], worstSev, center }
      const roomMap = new Map();
      floorNodes.forEach(node => {
        if (!roomMap.has(node.room)) roomMap.set(node.room, []);
        roomMap.get(node.room).push(node);
      });

      // Schlechtester Status über alle Räume → Badge-Farbe
      const worstSev = floorNodes.reduce((m, n) => Math.max(m, S(n.status).sev), 0);
      const worstCfg = Object.values(SC).find(c => c.sev === worstSev) ?? SC.unknown;
      const badgeHex = '#' + worstCfg.hex.toString(16).padStart(6, '0');

      // ── Sektion: Row + ausklappbare Raum-Liste ─────────────
      const section = document.createElement('div');
      section.className = 'floor-section';

      const row = document.createElement('div');
      row.className = 'floor-row'; row.id = `floor-row-${fc.y}`;

      const btn = document.createElement('button');
      btn.className = 'floor-btn';
      btn.title = fc.sub + (fc.widthM ? ` · ${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}` : '');
      btn.innerHTML =
        `<span class="fb-label">${fc.label}</span>` +
        (fc.widthM ? `<span class="fb-dim">${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}</span>` : '') +
        `<span class="fb-dot" style="background:rgba(${r},${g},${b_},.7);box-shadow:0 0 5px rgba(${r},${g},${b_},.5)"></span>`;
      btn.onclick = () => this.flyToFloor(fc.y);

      const btn2d = document.createElement('button');
      btn2d.className = 'floor-2d-btn'; btn2d.id = `btn2d-${fc.y}`;
      btn2d.textContent = '2D';
      btn2d.onclick = () => {
        if (this._mode2D && this._floor2DY === fc.y) this.exit2D();
        else this.enter2D(fc.y);
      };

      row.appendChild(btn); row.appendChild(btn2d);

      // Raum-Badge + Expand — nur wenn Räume vorhanden
      if (roomMap.size > 0) {
        const roomList = document.createElement('div');
        roomList.className = 'floor-node-list';

        roomMap.forEach((nodes, roomName) => {
          const roomWorstSev = nodes.reduce((m, n) => Math.max(m, S(n.status).sev), 0);
          const roomCfg      = Object.values(SC).find(c => c.sev === roomWorstSev) ?? SC.unknown;
          const roomHex      = '#' + roomCfg.hex.toString(16).padStart(6, '0');

          // Raum-Mittelpunkt aus Node-Positionen
          const center = nodes.reduce((acc, n) => {
            const p = this.nodePositions[n.id];
            return p ? { x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z } : acc;
          }, { x: 0, y: 0, z: 0 });
          const cnt = nodes.filter(n => this.nodePositions[n.id]).length || 1;
          const cx = center.x / cnt, cy = center.y / cnt, cz = center.z / cnt;

          const pill = document.createElement('button');
          pill.className = 'floor-node-pill';
          pill.title = nodes.map(n => n.label).join(', ');
          pill.innerHTML =
            `<span class="fnp-dot" style="background:${roomHex};box-shadow:0 0 4px ${roomHex}88"></span>` +
            `<span class="fnp-name">${roomName}</span>` +
            `<span class="fnp-type">${nodes.length}</span>`;
          pill.onclick = () => {
            this._setAutoOrbit(false);
            this.camera.position.set(cx + 40, cy + 30, cz + 40);
            this.controls.target.set(cx, cy, cz);
            this.controls.update();
          };
          roomList.appendChild(pill);
        });

        const expandBtn = document.createElement('button');
        expandBtn.className = 'floor-expand-btn';
        expandBtn.title = `${roomMap.size} Räume auf ${fc.label}`;
        expandBtn.innerHTML =
          `<span class="feb-count" style="color:${badgeHex}">${roomMap.size}</span>` +
          `<span class="feb-arrow">▸</span>`;
        expandBtn.onclick = () => {
          const open = roomList.classList.toggle('open');
          expandBtn.classList.toggle('open', open);
        };

        row.appendChild(expandBtn);
        section.appendChild(row);
        section.appendChild(roomList);
      } else {
        section.appendChild(row);
      }

      panel.appendChild(section);
    });
  }

  // ── 2D Mode ────────────────────────────────────────────────

  enter2D(floorY) {
    // Explode muss zurückgesetzt sein, damit floorY-Vergleiche stimmen
    if (this._explodeFactor !== 1.0 || this._explodeTarget !== 1.0) {
      this._explodeTarget = 1.0; this._explodeFactor = 1.0;
      this._applyExplodePositions();
      const sl = document.getElementById('explode-slider');
      if (sl) { sl.value = 100; document.getElementById('explode-val').textContent = '1.0×'; }
    }
    this._mode2D = true; this._floor2DY = floorY;
    this._setAutoOrbit(false);

    const fc = this._activeFloors.find(f => f.y === floorY);
    const { W = 110 } = this._floorSceneWL[floorY] ?? {};

    this.controls.target.set(0, floorY, 0);
    this.camera.position.set(0, floorY + W * 0.85, 0.01);
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = 0.001;
    this.controls.enableRotate  = false;
    this.controls.update();

    this._applyFloorVisibility(floorY);
    if (this._floorPlates[floorY])
      this._floorPlates[floorY].opacity = parseFloat(document.getElementById('floor-opacity').value) / 100;
    // Heatmaps in 2D stark abdunkeln, damit Nodes erkennbar bleiben
    Object.values(this._wifiMeshes).forEach(m => { m.material.opacity = 0.22; });

    document.getElementById('view-badge').classList.add('active');
    document.getElementById('vb-floor-name').textContent = fc?.label ?? floorY;
    document.getElementById('panel-2d').classList.add('visible');
    document.getElementById('ctrl-hint').textContent = '🖱 Schieben: Rechte Taste / Mitteltaste · Rad: Zoom';
    document.getElementById('ctrl-hint').classList.remove('hidden');

    document.querySelectorAll('.floor-2d-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn2d-${floorY}`)?.classList.add('active');
    document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('is-2d'));
    document.getElementById(`floor-row-${floorY}`)?.querySelector('.floor-btn')?.classList.add('is-2d');

    this._log(`2D · ${fc?.label}` + (fc?.widthM ? ` · ${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}` : ''));
  }

  exit2D() {
    this._mode2D = false; this._floor2DY = null;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.enableRotate  = true;
    this._showAll();
    Object.values(this._floorPlates).forEach(m => m.opacity = 0.72);
    Object.values(this._wifiMeshes).forEach(m => { m.material.opacity = 1.0; });
    document.getElementById('view-badge').classList.remove('active');
    document.getElementById('panel-2d').classList.remove('visible');
    document.getElementById('ctrl-hint').textContent = '🖱 Drehen · Rechte Taste: Schieben · Rad: Zoom';
    document.getElementById('ctrl-hint').classList.remove('hidden');
    setTimeout(() => document.getElementById('ctrl-hint').classList.add('hidden'), 3000);
    document.querySelectorAll('.floor-2d-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('is-2d'));
    this._log('← 3D');
  }

  _applyFloorVisibility(activeY) {
    this._floorObjs.forEach(o => { o.visible = o.userData.floorY === activeY; });
    Object.values(this.nodeObjects).forEach(g => { g.visible = Math.abs(g.position.y - activeY) < 8; });
    this.linkObjects.forEach(({ line, spark, srcY, tgtY }) => {
      const show = Math.abs(srcY - activeY) < 8 && Math.abs(tgtY - activeY) < 8;
      line.visible = show; spark.visible = show;
    });
    // Tunnel: sichtbar wenn mindestens ein Endpunkt auf dieser Etage liegt
    this.tunnelObjects.forEach(({ tube, glow, spark, srcY, tgtY }) => {
      const show = Math.abs(srcY - activeY) < 8 || Math.abs(tgtY - activeY) < 8;
      tube.visible = show; glow.visible = show; spark.visible = show;
    });
    Object.entries(this._bgMeshes).forEach(([y, mesh]) => {
      mesh.visible = parseFloat(y) === activeY;
    });
  }

  _showAll() {
    this._floorObjs.forEach(o => o.visible = true);
    Object.values(this.nodeObjects).forEach(g => g.visible = true);
    this.linkObjects.forEach(({ line, spark }) => { line.visible = true; spark.visible = true; });
    this.tunnelObjects.forEach(({ tube, glow, spark }) => { tube.visible = true; glow.visible = true; spark.visible = true; });
    Object.values(this._bgMeshes).forEach(m => m.visible = false);
  }

  // ── Background image ───────────────────────────────────────

  _onBgFileSelected(file) {
    if (!file || !this._mode2D) return;
    const y = this._floor2DY;
    const { W = 110, L = 110 } = this._floorSceneWL[y] ?? {};
    if (this._bgMeshes[y]) this.scene.remove(this._bgMeshes[y]);
    new THREE.TextureLoader().load(URL.createObjectURL(file), tex => {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true,
        opacity: parseFloat(document.getElementById('bg-opacity').value) / 100,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, L), mat);
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = y - 0.08;
      this.scene.add(mesh);
      this._bgMeshes[y] = mesh; this._bgMats[y] = mat;
      document.getElementById('bg-img-name').textContent = file.name;
      this._log(`Grundriss geladen: ${file.name}`);
    });
  }

  setBgOpacity(val)    { if (this._floor2DY !== null && this._bgMats[this._floor2DY])    this._bgMats[this._floor2DY].opacity = val; }
  setFloorOpacity(val) { if (this._floor2DY !== null && this._floorPlates[this._floor2DY]) this._floorPlates[this._floor2DY].opacity = val; }

  // ── Nodes ──────────────────────────────────────────────────

  _buildNodes() {
    this.data.nodes.forEach(node => {
      const pos   = this.nodePositions[node.id] ?? new THREE.Vector3(0, 0, 0);
      const group = this._createNodeMesh(node);
      group.position.copy(pos);
      group.userData.floorBaseY = this._activeFloors.length
        ? this._activeFloors.reduce((best, f) =>
            Math.abs(f.y - pos.y) < Math.abs(best - pos.y) ? f.y : best,
            this._activeFloors[0].y)
        : pos.y;
      this.scene.add(group);
      this.nodeObjects[node.id] = group;
      this._prevStatus[node.id] = node.status;
      if (node.type === 'accesspoint') this._buildWifiHeatmap(node, pos);
    });
  }

  _createNodeMesh(node) {
    const cfg = S(node.status), group = new THREE.Group();
    group.userData = { ...node };
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.hex, emissive: cfg.emissive,
      emissiveIntensity: al(node.status) ? 0.55 : 0.2,
      roughness: 0.45, metalness: 0.55,
    });

    if (node.type === 'server') {
      // 1U-Server-Slab: breite flache Box (passend in Rack-Rahmen)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.55), mat);
      // Status-LED als kleiner Leuchtpunkt
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 4),
        new THREE.MeshBasicMaterial({ color: cfg.hex })
      );
      led.position.set(0.38, 0.10, -0.22);
      group.add(mesh); group.add(led);
      if (al(node.status)) this.alertObjs.push(mesh);
    } else if (node.type === 'accesspoint') {
      // Disc body + antenna
      const body    = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.55, 16), mat);
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 3.0, 6),
        new THREE.MeshStandardMaterial({ color:0x888899, metalness:0.85, roughness:0.15 })
      );
      antenna.position.y = 1.8;
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: cfg.hex })
      );
      tip.position.y = 3.3;
      group.add(body); group.add(antenna); group.add(tip);
      if (al(node.status)) this.alertObjs.push(body);
    } else {
      const geo = node.type === 'switch'
        ? new THREE.BoxGeometry(5, 0.9, 3)
        : new THREE.SphereGeometry(2.3, 18, 14);
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      if (al(node.status)) this.alertObjs.push(mesh);
    }

    if (al(node.status) || node.status === 'warning')
      group.add(Object.assign(new THREE.PointLight(cfg.hex, 0.9, 22), {}));

    const div = document.createElement('div');
    div.className = node.linkedModel ? 'node-label node-label--portal' : 'node-label';
    div.textContent = node.linkedModel ? `⇒ ${node.label}` : node.label;
    const lbl = new CSS2DObject(div);
    lbl.position.set(0, node.type === 'server' ? 0.4 : node.type === 'switch' ? 2.2 : 3.8, 0);
    group.add(lbl);
    return group;
  }

  // ── Links ──────────────────────────────────────────────────

  _buildLinks() {
    if (this._model.type === 'datacenter') return;   // DC: Verbindungen werden nicht visualisiert
    const nodeMap = new Map(this.data.nodes.map(n => [n.id, n]));
    this.data.links.forEach(link => {
      const start = this.nodePositions[link.source];
      const end   = this.nodePositions[link.target];
      if (!start || !end) return;
      // Auto-Tunnel: beide Nodes unterirdisch (SOHLE) + Distanz > Schwellenwert
      const srcFloor = nodeMap.get(link.source)?.floor ?? '';
      const tgtFloor = nodeMap.get(link.target)?.floor ?? '';
      const bothUnderground = srcFloor.includes('SOHLE') && tgtFloor.includes('SOHLE');
      const isTunnel = link.tunnel || (bothUnderground && start.distanceTo(end) > TUNNEL_MIN_DIST);
      if (isTunnel) { this._buildTunnelLink(link, start, end); return; }
      const cfg = S(link.status), isAl = al(link.status);
      const op  = isAl ? 0.75 : link.status === 'warning' ? 0.38 : 0.18;

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]),
        new THREE.LineBasicMaterial({ color: cfg.hex, transparent: true, opacity: op })
      );
      this.scene.add(line);
      if (isAl) this.alertObjs.push(line);

      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 8, 6),
        new THREE.MeshBasicMaterial({ color: cfg.hex })
      );
      this.scene.add(spark);

      const srcNode = this.data.nodes.find(n => n.id === link.source);
      const tgtNode = this.data.nodes.find(n => n.id === link.target);
      this.linkObjects.push({
        line, spark,
        start: start.clone(), end: end.clone(),
        prog: Math.random(),
        srcId: link.source, tgtId: link.target,
        srcY: srcNode ? (this.nodePositions[srcNode.id]?.y ?? 0) : 0,
        tgtY: tgtNode ? (this.nodePositions[tgtNode.id]?.y ?? 0) : 0,
      });
    });
  }

  // ── Tunnel link (Untertage Switch-Backbone) ────────────────
  //  TubeGeometry entlang einer leicht gebogenen Kurve +
  //  größere Glow-Shell (BackSide + AdditiveBlending) wie ein Stollen.

  _buildTunnelLink(link, start, end) {
    const cfg      = S(link.status);
    const isBuilding = this._model.type === 'building';
    const isDC       = this._model.type === 'datacenter';

    // Mine: Bogen nach unten,  Gebäude/DC: Bogen nach oben (Kabelkanal/Patchkabel)
    const mid = start.clone().lerp(end, 0.5);
    mid.y += isDC ? 1.5 : isBuilding ? +3 : -4;
    const curve = new THREE.CatmullRomCurve3([start.clone(), mid, end.clone()]);

    // Rohrmaße: Mine → dicker/heller,  Gebäude → dünn,  DC → sehr dünn (Patchkabel)
    const rInner  = isDC ? 0.10 : isBuilding ? 0.25 : 0.65;
    const rOuter  = isDC ? 0.55 : isBuilding ? 1.4  : 3.2;
    const opInner = isDC ? 0.75 : isBuilding ? 0.65 : 0.55;
    const opOuter = isDC ? 0.18 : isBuilding ? 0.13 : 0.10;

    // Inneres Rohr
    const tubeMat = new THREE.MeshBasicMaterial({
      color: cfg.hex, transparent: true, opacity: opInner, depthWrite: false,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, rInner, 8, false), tubeMat);
    this.scene.add(tube);

    // Äußere Glow-Shell
    const glowMat = new THREE.MeshBasicMaterial({
      color: cfg.hex, transparent: true, opacity: opOuter,
      blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, rOuter, 8, false), glowMat);
    this.scene.add(glow);

    // Spark – folgt der Kurve via getPoint(t)
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: cfg.hex, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(spark);

    const srcNode = this.data.nodes.find(n => n.id === link.source);
    const tgtNode = this.data.nodes.find(n => n.id === link.target);
    this.tunnelObjects.push({
      tube, glow, spark, curve,
      prog: Math.random(),
      srcId: link.source, tgtId: link.target,
      rInner, rOuter,
      midYOffset: isDC ? 1.5 : isBuilding ? 3 : -4,
      srcY: srcNode ? start.y : 0,
      tgtY: tgtNode ? end.y   : 0,
    });
  }

  // ── Camera helpers ─────────────────────────────────────────

  flyToFloor(y) {
    if (this._mode2D) this.exit2D();
    this._setAutoOrbit(false);
    const t = Date.now() * 0.001;
    this.camera.position.set(Math.sin(t)*130, y+65, Math.cos(t)*130);
    this.controls.target.set(0, y, 0);
    this.controls.update();
  }

  /** Fly to a specific node and open its inspector.
   *
   *  Orbit-Target wird auf den Ebenenmittelpunkt (0, floorY, 0) gesetzt,
   *  nicht auf den Node selbst. Beim Herauszoomen bleibt die Szene
   *  damit korrekt zentriert und alle anderen Hosts bleiben am richtigen Platz.
   */
  focusNode(id) {
    if (this._mode2D) this.exit2D();
    this._setAutoOrbit(false);
    const pos = this.nodePositions[id];
    if (!pos) return;

    // Nächste Ebene zum Node finden → wird Orbit-Zentrum
    const floorY = this._activeFloors.length
      ? this._activeFloors.reduce((best, f) =>
          Math.abs(f.y - pos.y) < Math.abs(best - pos.y) ? f.y : best,
          this._activeFloors[0].y)
      : pos.y;

    this.controls.target.set(0, floorY, 0);

    // Kamera: über dem Node, auf der Linie Ebenenmitte → Node
    const horiz = new THREE.Vector3(pos.x, 0, pos.z);
    const hDist = horiz.length();
    const dir   = hDist > 0.5
      ? horiz.clone().normalize()
      : new THREE.Vector3(1, 0, 0);
    const camR  = Math.max(hDist + 30, 45);

    this.camera.position.set(dir.x * camR, floorY + 30, dir.z * camR);
    this.controls.update();

    const node = this.data.nodes.find(n => n.id === id);
    if (node) this.openInspector({ ...node });
  }

  focusActive() {
    if (!this._activeNode) return;
    this.focusNode(this._activeNode.id);
  }

  resetCam() {
    if (this._mode2D) this.exit2D();
    this._setAutoOrbit(true);
    this.camera.position.set(90, 50, 90);
    this.controls.target.set(0, 0, 0);
  }

  zoom(dir) {
    this._setAutoOrbit(false);
    const v = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.addScaledVector(v, dir * -18);
    this.controls.update();
  }

  toggleOrbit() { this._setAutoOrbit(!this.autoOrbit); }
  _setAutoOrbit(on) {
    this.autoOrbit = on;
    document.getElementById('btn-orbit').classList.toggle('active', on);
  }

  // ── WS ─────────────────────────────────────────────────────

  updateNodeStatus(hosts) {
    hosts.forEach(h => {
      const group = this.nodeObjects[h.id];
      if (!group) return;
      const mesh = group.children.find(c => c.isMesh);
      if (!mesh) return;
      const cfg  = S(h.status);
      const prev = this._prevStatus[h.id];

      mesh.material.color.set(cfg.hex);
      mesh.material.emissive.set(cfg.emissive);
      mesh.material.emissiveIntensity = al(h.status) ? 0.55 : 0.2;
      group.userData.status = h.status;
      this._prevStatus[h.id] = h.status;

      // Pulse ring when transitioning TO critical / down
      if (al(h.status) && !al(prev ?? '')) {
        this._spawnPulseRing(group.position, cfg.hex);
      }

      // Update wifi heatmap texture
      if (this._wifiMeshes[h.id]) {
        this._wifiMeshes[h.id].material.map.dispose();
        this._wifiMeshes[h.id].material.map = this._genWifiTexture(h.status);
        this._wifiMeshes[h.id].material.needsUpdate = true;
      }

      if (this._activeNode?.id === h.id) {
        this._activeNode.status = h.status;
        this.openInspector(this._activeNode);
      }
    });
    // Keep cockpit visibility in sync
    if (this._cockpitMode) {
      hosts.forEach(h => {
        const g = this.nodeObjects[h.id];
        if (g) g.visible = al(h.status) || h.status === 'warning';
      });
    }
    window.problemList?.update(this.data.nodes.map(n => ({ ...n, status: this.nodeObjects[n.id]?.userData?.status ?? n.status })));
    this._log(`Status update · ${hosts.length} host(s)`);
  }

  connectWS(url) {
    this._log(`Connecting → ${url}`);
    const ws = new WebSocket(url);
    ws.onopen    = () => this._log('WS connected');
    ws.onclose   = () => this._log('WS disconnected');
    ws.onmessage = (e) => {
      try { const m = JSON.parse(e.data); if (m.type === 'status_update' && m.hosts) this.updateNodeStatus(m.hosts); } catch {}
    };
    this.ws = ws;
  }

  // ── Pulse rings ────────────────────────────────────────────

  _spawnPulseRing(pos, color) {
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.8, 4.0, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, pos.y + 0.4, pos.z);
      this.scene.add(ring);
      this._pulseRings.push({ mesh: ring, t: i * 0.35, maxT: 1.4, maxScale: 5.5, baseOpacity: 0.75 });
    }
  }

  // ── Search & Highlight ─────────────────────────────────────

  search(q) {
    if (!q || !q.trim()) { this._clearSearch(true); return; }
    this._highlightSearch(q.trim().toLowerCase());
  }

  _highlightSearch(q) {
    this._clearSearch(false);
    let matches = 0;
    let firstMatchId = null;

    Object.entries(this.nodeObjects).forEach(([id, group]) => {
      const node    = this.data.nodes.find(n => n.id === id);
      const isMatch = node && (
        node.label.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q) ||
        (node.floor ?? '').toLowerCase().includes(q) ||
        (node.type  ?? '').toLowerCase().includes(q)
      );
      const mesh    = group.children.find(c => c.isMesh);
      const labelEl = group.children.find(c => c.isCSS2DObject)?.element;

      if (isMatch) {
        matches++;
        if (!firstMatchId) firstMatchId = id;
        if (mesh) {
          mesh.material.emissiveIntensity = 0.9;
        }
        if (labelEl) { labelEl.style.opacity = '1'; labelEl.style.fontWeight = '700'; }

        // Blue highlight ring
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(3.8, 5.0, 40),
          new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(group.position.x, group.position.y + 0.5, group.position.z);
        ring.userData.nodeId = group.userData.id;
        this.scene.add(ring);
        this._searchRings.push(ring);
      } else {
        if (mesh) {
          const cfg = S(group.userData.status ?? node?.status ?? 'unknown');
          mesh.material.color.setHex(0x1a1e28);
          mesh.material.emissive.setHex(cfg.emissive);
          mesh.material.emissiveIntensity = 0.04;
        }
        if (labelEl) { labelEl.style.opacity = '0.12'; labelEl.style.fontWeight = ''; }
      }
    });

    const el = document.getElementById('search-count');
    if (el) el.textContent = matches ? `${matches}` : '–';

    if (matches === 1 && firstMatchId) this.focusNode(firstMatchId);
  }

  _clearSearch(restore = true) {
    this._searchRings.forEach(r => { this.scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
    this._searchRings = [];
    const el = document.getElementById('search-count');
    if (el) el.textContent = '';
    if (!restore) return;
    Object.entries(this.nodeObjects).forEach(([id, group]) => {
      const node = this.data.nodes.find(n => n.id === id);
      if (!node) return;
      const cfg     = S(group.userData.status ?? node.status);
      const mesh    = group.children.find(c => c.isMesh);
      const labelEl = group.children.find(c => c.isCSS2DObject)?.element;
      if (mesh) {
        mesh.material.color.setHex(cfg.hex);
        mesh.material.emissive.setHex(cfg.emissive);
        mesh.material.emissiveIntensity = al(node.status) ? 0.55 : 0.2;
      }
      if (labelEl) { labelEl.style.opacity = ''; labelEl.style.fontWeight = ''; }
    });
  }

  clearSearch() { this._clearSearch(true); }

  // ── Cockpit mode ───────────────────────────────────────────

  toggleCockpit() {
    this._cockpitMode = !this._cockpitMode;
    document.getElementById('btn-cockpit')?.classList.toggle('active', this._cockpitMode);
    document.getElementById('cockpit-badge')?.classList.toggle('visible', this._cockpitMode);

    if (this._cockpitMode) {
      this.scene.background = new THREE.Color(0x0d0005);
      this.scene.fog        = new THREE.FogExp2(0x0d0005, 0.0018);
      this._accentLight.color.set(0x660000);
      this._setAutoOrbit(false);
    } else {
      this.scene.background = null;
      this.scene.fog        = new THREE.FogExp2(0x080a0e, 0.003);
      this._accentLight.color.set(0x3060aa);
    }

    Object.entries(this.nodeObjects).forEach(([id, group]) => {
      const status  = group.userData.status ?? this.data.nodes.find(n => n.id === id)?.status ?? 'unknown';
      const labelEl = group.children.find(c => c.isCSS2DObject)?.element;
      if (this._cockpitMode) {
        const show = al(status) || status === 'warning';
        group.visible = show;
        if (labelEl) labelEl.style.opacity = show ? (status === 'warning' ? '0.6' : '1') : '0';
      } else {
        group.visible = true;
        if (labelEl) { labelEl.style.opacity = ''; }
      }
    });

    // wifi meshes: hide in cockpit for cleaner look
    Object.values(this._wifiMeshes).forEach(m => { m.visible = !this._cockpitMode; });

    this._log(this._cockpitMode ? '⚡ Cockpit-Modus aktiv — nur Probleme' : '← Cockpit beendet');
  }

  // ── Inspector ──────────────────────────────────────────────

  openInspector(data) {
    this._activeNode = data;
    const cfg = S(data.status);
    const badge = document.getElementById('ins-badge');
    badge.className = `s-badge ${cfg.badge}`; badge.textContent = cfg.label;
    document.getElementById('ins-name').textContent = data.label;
    document.getElementById('ins-id').textContent   = `id: ${data.id}`;
    const pos = this.nodePositions[data.id];
    const geoLine = data.lat
      ? `<div class="m-row"><span>Koordinaten</span><b>${data.lat?.toFixed(4)}°N, ${data.lon?.toFixed(4)}°E</b></div>`
      : '';
    const dbmLine = data.wifiDbm != null
      ? `<div class="m-row"><span>WLAN-Signal</span><b>${data.wifiDbm} dBm · r≈${this._dbmToRadius(data.wifiDbm).toFixed(0)} u</b></div>`
      : '';
    document.getElementById('ins-body').innerHTML = `
      <div class="m-row"><span>Status</span><b class="${cfg.cls}">${cfg.label}</b></div>
      <div class="m-row"><span>Typ</span><b>${data.type}</b></div>
      <div class="m-row"><span>Ebene</span><b>${data.floor ?? '–'}</b></div>
      ${geoLine}
      ${dbmLine}
      ${pos ? `<div class="m-row"><span>Scene X/Y/Z</span><b>${pos.x.toFixed(1)} / ${pos.y.toFixed(1)} / ${pos.z.toFixed(1)}</b></div>` : ''}
    `;
    // Modell-Wechsel-Button für Portal-Nodes
    const foot = document.getElementById('ins-foot');
    const existingPortalBtn = foot.querySelector('.btn-portal');
    if (existingPortalBtn) existingPortalBtn.remove();
    if (data.linkedModel) {
      const target = ModelManager.getById(data.linkedModel);
      if (target) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-portal';
        btn.style.cssText = 'flex:1;background:#0d2a3a;border-color:#13b0f5;color:#13b0f5';
        btn.textContent = `⇒ ${target.name}`;
        btn.onclick = () => { this.closeInspector(); this.loadModel(target); };
        foot.appendChild(btn);
      }
    }

    document.getElementById('inspector').classList.add('open');
    this._log(`Selected: ${data.label} [${cfg.label}]`);
  }

  closeInspector() {
    document.getElementById('inspector').classList.remove('open');
    this._activeNode = null;
  }

  // ── UI ─────────────────────────────────────────────────────

  _setupUI() {
    window.addEventListener('click', (e) => {
      if (e.target.closest('#inspector') || e.target.closest('.hud') ||
          e.target.closest('#floor-panel') || e.target.closest('#zoom-ctrl') ||
          e.target.closest('#panel-2d') || e.target.closest('#model-dialog') ||
          e.target.closest('#problem-panel')) return;
      const mouse = new THREE.Vector2((e.clientX/innerWidth)*2-1, -(e.clientY/innerHeight)*2+1);
      const ray   = new THREE.Raycaster();
      ray.setFromCamera(mouse, this.camera);
      const hits = ray.intersectObjects(this.scene.children, true);
      if (hits.length) {
        let obj = hits[0].object;
        while (obj.parent && !obj.userData.id) obj = obj.parent;
        if (obj.userData.id) this.openInspector(obj.userData);
      }
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeInspector();
        if (this._mode2D) this.exit2D();
        if (this._cockpitMode) this.toggleCockpit();
        const si = document.getElementById('search-input');
        if (si && si.value) { si.value = ''; this._clearSearch(true); }
      }
      // Ctrl+F / Cmd+F → focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
      // M → OSM-Übersichtskarte togglen
      if (e.key === 'm' || e.key === 'M') {
        if (!e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
          window.mapOverlay?.toggle();
        }
      }
    });

    document.getElementById('flow-speed').oninput = (e) => { this.flowSpeed = e.target.value / 100; };

    document.getElementById('orbit-radius').oninput = (e) => {
      this.orbitRadius = parseInt(e.target.value);
      document.getElementById('orbit-radius-val').textContent = e.target.value;
    };

    document.getElementById('explode-slider').oninput = (e) => {
      const factor = e.target.value / 100;
      document.getElementById('explode-val').textContent = factor.toFixed(1) + '×';
      this.setExplode(factor);
    };

    const hint = document.getElementById('ctrl-hint');
    const hide = () => setTimeout(() => hint.classList.add('hidden'), 2500);
    this.renderer.domElement.addEventListener('pointerdown', hide, { once: true });
    this.renderer.domElement.addEventListener('wheel',       hide, { once: true });
  }

  _log(msg) {
    const c = document.getElementById('log-entries');
    const d = document.createElement('div');
    const t = new Date().toLocaleTimeString('de-DE', { hour12:false });
    d.innerHTML = `<span class="ts">[${t}]</span> ${msg}`;
    c.prepend(d);
    while (c.children.length > 10) c.removeChild(c.lastChild);
  }

  // ── Exploded-View ──────────────────────────────────────────

  _storeBasePositions() {
    this._floorCenterY = this._activeFloors.length
      ? this._activeFloors.reduce((s, f) => s + f.y, 0) / this._activeFloors.length
      : 0;
    this._baseNodePositions = {};
    Object.entries(this.nodePositions).forEach(([id, pos]) => {
      this._baseNodePositions[id] = pos.clone();
    });
  }

  setExplode(factor) {
    this._explodeTarget = Math.max(1, Math.min(4, factor));
  }

  _applyExplodePositions() {
    const factor  = this._explodeFactor;
    const center  = this._floorCenterY;

    // baseFloorY → exploded Y
    const floorYMap = new Map();
    this._activeFloors.forEach(fc => {
      floorYMap.set(fc.y, center + (fc.y - center) * factor);
    });

    // Floor plates / edges / labels
    this._floorObjs.forEach(obj => {
      const baseY = obj.userData.floorY;
      if (baseY == null) return;
      const newY = floorYMap.get(baseY) ?? baseY;
      obj.position.y = newY + (obj.userData.floorYOffset ?? 0);
    });

    // Nodes
    Object.values(this.nodeObjects).forEach(g => {
      const id        = g.userData.id;
      const baseFloorY = g.userData.floorBaseY;
      if (id == null || baseFloorY == null) return;
      const newFloorY  = floorYMap.get(baseFloorY) ?? baseFloorY;
      const baseNodeY  = this._baseNodePositions[id]?.y ?? baseFloorY;
      g.position.y = newFloorY + (baseNodeY - baseFloorY);
    });

    // Links – update geometry + spark
    this.linkObjects.forEach(s => {
      const srcG = this.nodeObjects[s.srcId];
      const tgtG = this.nodeObjects[s.tgtId];
      if (!srcG || !tgtG) return;
      s.start.copy(srcG.position);
      s.end.copy(tgtG.position);
      const pos = s.line.geometry.attributes.position;
      pos.setXYZ(0, s.start.x, s.start.y, s.start.z);
      pos.setXYZ(1, s.end.x, s.end.y, s.end.z);
      pos.needsUpdate = true;
    });

    // Tunnels – rebuild TubeGeometry with updated curve endpoints
    this.tunnelObjects.forEach(s => {
      const srcG = this.nodeObjects[s.srcId];
      const tgtG = this.nodeObjects[s.tgtId];
      if (!srcG || !tgtG) return;
      const tStart = srcG.position.clone();
      const tEnd   = tgtG.position.clone();
      const tMid   = tStart.clone().lerp(tEnd, 0.5);
      tMid.y += s.midYOffset;
      const newCurve = new THREE.CatmullRomCurve3([tStart, tMid, tEnd]);
      s.curve = newCurve;
      s.tube.geometry.dispose();
      s.tube.geometry = new THREE.TubeGeometry(newCurve, 28, s.rInner, 8, false);
      s.glow.geometry.dispose();
      s.glow.geometry = new THREE.TubeGeometry(newCurve, 28, s.rOuter, 8, false);
    });

    // Wifi heatmaps follow their node
    Object.entries(this._wifiMeshes).forEach(([id, mesh]) => {
      const g = this.nodeObjects[id];
      if (g) mesh.position.y = g.position.y + 0.25;
    });

    // Search rings follow their node
    this._searchRings.forEach(r => {
      const g = r.userData.nodeId ? this.nodeObjects[r.userData.nodeId] : null;
      if (g) r.position.y = g.position.y + 0.5;
    });
  }

  // ── Render loop ────────────────────────────────────────────

  _animate() {
    requestAnimationFrame(() => this._animate());
    const t = Date.now() * 0.001;

    if (this.autoOrbit) {
      const r = this.orbitRadius;
      this.camera.position.x = Math.sin(t * 0.10) * r;
      this.camera.position.z = Math.cos(t * 0.10) * r;
      this.camera.position.y = r * 0.55 + Math.sin(t * 0.05) * (r * 0.20);
      this.camera.lookAt(0, 0, 0);
    } else {
      this.controls.update();
    }

    const pulse = 0.3 + Math.abs(Math.sin(t * 3.2)) * 0.7;
    this.alertObjs.forEach(obj => {
      if (obj.isMesh) obj.material.emissiveIntensity = pulse;
      else if (obj.isLine) obj.material.opacity = 0.2 + Math.abs(Math.sin(t*4)) * 0.65;
    });

    const step = 0.006 * (this.flowSpeed * 6 + 0.15);
    this.linkObjects.forEach(s => {
      if (!s.spark.visible) return;
      s.prog += step; if (s.prog > 1) s.prog = 0;
      s.spark.position.lerpVectors(s.start, s.end, s.prog);
    });
    // Tunnel sparks: folgen der Kurve (langsamerer Flow für realistischen Tunnel-Feel)
    const tstep = step * 0.65;
    this.tunnelObjects.forEach(s => {
      if (!s.spark.visible) return;
      s.prog += tstep; if (s.prog > 1) s.prog = 0;
      s.spark.position.copy(s.curve.getPoint(s.prog));
    });

    // ── Pulse rings (expand + fade on alert transition) ──────
    const dt = 0.016;
    for (let i = this._pulseRings.length - 1; i >= 0; i--) {
      const r    = this._pulseRings[i];
      r.t       += dt;
      const prog = r.t / r.maxT;
      if (prog >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this._pulseRings.splice(i, 1);
        continue;
      }
      const sc = 1 + prog * r.maxScale;
      r.mesh.scale.set(sc, sc, sc);
      r.mesh.material.opacity = r.baseOpacity * (1 - prog * prog);
    }

    // ── Search rings (pulse glow) ─────────────────────────────
    if (this._searchRings.length) {
      const sp = 0.38 + Math.abs(Math.sin(t * 2.8)) * 0.55;
      this._searchRings.forEach(r => { r.material.opacity = sp; });
    }

    // ── Explode LERP ──────────────────────────────────────────
    if (Math.abs(this._explodeFactor - this._explodeTarget) > 0.001) {
      this._explodeFactor += (this._explodeTarget - this._explodeFactor) * 0.08;
      this._applyExplodePositions();
    }

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    window._minimap?.render();
  }
}

// ─────────────────────────────────────────────────────────────
//  MINIMAP
// ─────────────────────────────────────────────────────────────
