# NagVis 3D – Ideen & Feature-Backlog

---

## ✅ Implementiert

### Search & Highlight
Echtzeit-Suche über alle Nodes (Label, ID, Floor, Typ).
Treffer werden mit einem blau pulsierenden Ring hervorgehoben,
alle anderen Nodes werden ausgegraut. Bei genau einem Treffer
fliegt die Kamera automatisch dorthin.
- Shortcut: `Ctrl+F` / `Cmd+F`
- Escape: Suche zurücksetzen

### Cockpit-Modus
Ein-Klick-Notfallansicht: Alle OK-Nodes verschwinden,
der Hintergrund wechselt auf Dunkelrot, das Akzentlicht
wird rot. Nur WARNING, CRITICAL und DOWN sind sichtbar.
- Button: ⚡ im Header
- Escape: Cockpit beenden

### Pulse-Ringe bei Statuswechsel
Wenn ein Node von einem unkritischen Zustand auf
CRITICAL oder DOWN wechselt, expandieren 3 Ringe
konzentrisch aus dem Node heraus und verblassen.
Rein mit `THREE.RingGeometry`, kein externes Tween-Framework.

### WLAN-Heatmap für AccessPoints
Nodes mit `type: 'accesspoint'` bekommen:
- Eigene Geometrie: flacher Disc-Körper + Antenne
- Radialer Farbverlauf (Canvas-Texture) auf der Etagenebene
- Additive Blending → mehrere APs überlagern sich realistisch
- Radius aus `wifiDbm`: -30 dBm → 48 u, -90 dBm → 8 u

### Exploded-View
Slider der die Etagen vertikal auseinanderfährt.
`FLOOR_STEP` dynamisch skalieren + alle Positionen per LERP animieren.
Verbindungen und Tunnel folgen synchron.

### Minimap (2D-Draufsicht)
Canvas-Panel (⊡-Button) mit Kamera-Pfeil und Click-to-fly.

### Favoriten-Panel
Screenshot + Thumbnail, Inline-Umbenennen, Slideshow-Modus,
Pro-Favorit-Checkbox; persistiert in `localStorage`.

### NagVis2-WS-Integration (Phase 1)
- nagvis2-kompatibles Protokoll: `event: snapshot/status_update/heartbeat/backend_error`
- `mapState()`: `state_label` (UP/DOWN/WARNING/CRITICAL/…) → interne Status-Keys
- Service-Aggregation: schlechtester Service-Status je Host
- ACK/DT/Output/Backend-ID in `userData` gespeichert
- Exponentieller Backoff 2 s → 30 s
- WS-Settings-Dialog mit localStorage-Persistenz
- `connectNv3d(url, token)` / `disconnectNv3d()` JS-API
- `#ws-conn-dot` Verbindungsstatus-Anzeige im HUD

### Inspector erweitert
ACK-Badge, DT-Badge, Plugin-Output, Services OK/WARN/CRIT, Backend-ID

### Design-Alignment mit nagvis2
- Checkmk-Farbpalette: OK teal, WARN gelb, CRIT/DOWN rot
- Roboto / Roboto Mono als primäre Schriftfamilie
- CSS-Tokens: `--ok-bg`, `--warn-bg`, `--crit-bg`, `--ok-border` etc.
- Blau-graue Hintergründe statt near-black

---

## 🚀 Offen (nächste Ideen)

### ACK / Downtime / Reschedule aus 3D-Ansicht
Kontextmenü per Rechtsklick auf Node:
- ACK (Problem bestätigen) mit Kommentar-Dialog
- Downtime planen mit Start/Ende
- Reschedule Check
Calls an nagvis2 REST API: `POST /api/v1/hosts/{host}/ack` usw.

### Node-Clustering bei weitem Zoom
Kamera-Distanz > Schwellwert → Hosts einer Etage
kollabieren zu einer Blase mit Zähler (✓3 ⚠1 ✗2).
Kamera nähert sich → Auffalten der einzelnen Nodes.

### Status-Timeline-Slider
Zeitstrahl unten: zurückspulen wie der Status ausgesehen hat.
Nodes ändern Farbe je nach historischem Stand.
Datenbasis: WebSocket-History oder simuliertes Replay.

### WebXR / VR-Modus
Three.js hat eingebauten WebXR-Support (`renderer.xr`).
Mit Meta Quest / Browser-XR durch das Gebäude / die Grube laufen.
Hosting per HTTPS Pflicht (WebXR-Anforderung).

### Heatmap-Overlay pro Etage (Status-Dichte)
Canvas-Texture auf der Bodenplatte: grün wo alles OK,
rot wo viele CRITICAL konzentriert sind.
Erfordert Node-Positions-Grid + Kernel-Density-Estimation auf Canvas.

### Sound-Alert (Web Audio API)
Beim Wechsel auf CRITICAL: synthesizierter Alarmton
rein über `AudioContext` (kein Audio-File nötig).
Konfigurierbar (an/aus, Lautstärke).

### Favoriten Export/Import
JSON-Datei mit Slideshow-Konfiguration; Austausch zwischen Instanzen.

### Custom Icons per Node-Typ
Statt generischer Sphere/Box/Cone: eigene SVG-Icons als
`CSS2DObject` oder `SpriteMaterial` je nach Typ
(Server, Switch, Router, AccessPoint, VM, Container …).

### 3D-Gadget in NagVis2
3D-Ansicht als Gadget-Typ in normalen NagVis2-Maps einbettbar
(ähnlich Graph/Iframe-Gadget). Shared JWT-Auth.

### Performance-Optimierung (>500 Nodes)
Instanced Mesh, LOD (Level of Detail), Frustum Culling.

---

## Technische Notizen

| Feature                | Technik                                              |
|------------------------|------------------------------------------------------|
| Pulse-Ringe            | `THREE.RingGeometry` + AnimFrame-Loop                |
| WLAN-Heatmap           | `CanvasTexture` + `AdditiveBlending`                 |
| Search-Rings           | `THREE.RingGeometry` + opacity pulse                 |
| Cockpit-Bg             | `scene.background = THREE.Color`                     |
| Cockpit-Fog            | `THREE.FogExp2` color swap                           |
| Wifi-Status-Update     | `material.map` dispose + neu generieren              |
| WS-Backoff             | `_delay = Math.min(_delay * 2, 30000)` in `connectWS` |
| mapState()             | `STATE_LABEL_MAP` + fallback auf `SC[lo]`            |
| Service-Aggregation    | `_applyServiceUpdates()` in `scene.js`               |
| Inspector userData     | `nodeObjects[id].userData.{ack,dt,output,svc_*,backend_id}` |
