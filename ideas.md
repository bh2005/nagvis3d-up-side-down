# NagVis 3D – v3 Ideen & Feature-Backlog

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
- Radialer Farbverlauf (Canvas-Texture) auf der Etagenebene:
  - Grün (OK), Gelb (WARNING), Rot (CRITICAL/DOWN)
- Konzentrische Signal-Ringe im Gradient
- Additive Blending → mehrere APs überlagern sich realistisch
- Radius aus `wifiDbm` (dBm-Wert): -30 dBm (stark) → 48 u, -90 dBm (schwach) → 8 u
  - Berechnung: `_dbmToRadius(dbm)` linear mapping
- dBm-Wert und berechneter Radius werden im Inspector angezeigt
- Texture wird bei Status-Update neu generiert

---

## 🚀 Nächste Ideen (offen)

### Exploded-View
Slider der die Etagen vertikal auseinanderfährt
→ Nodes auf dicht übereinanderliegenden Etagen besser unterscheidbar.
`FLOOR_STEP` dynamisch skalieren + alle Positionen lerpen.

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

### Minimap (2D-Draufsicht)
Kleines Canvas in einer Ecke das immer die Draufsicht zeigt,
aktuellen Kamerastandpunkt als Pfeil visualisiert.

### Export: Screenshot / Fly-Through Video
`renderer.domElement.toDataURL()` → PNG-Download.
Video: `MediaRecorder` + Canvas-Stream → WebM.

### Echte NagVis-API-Anbindung
`app.connectWS('ws://nagvis-host/ws/...')` ist bereits vorbereitet.
Status-Polling als Fallback (`/api/v1/hosts`), dann auf
WS-Push upgraden sobald verfügbar.

### Custom Icons per Node-Typ
Statt generischer Sphere/Box/Cone: eigene SVG-Icons als
`CSS2DObject` oder `SpriteMaterial` je nach Typ
(Server, Switch, Router, AccessPoint, VM, Container …).

---

## Technische Notizen

| Feature            | Technik                              |
|--------------------|--------------------------------------|
| Pulse-Ringe        | `THREE.RingGeometry` + AnimFrame-Loop |
| WLAN-Heatmap       | `CanvasTexture` + `AdditiveBlending` |
| Search-Rings       | `THREE.RingGeometry` + opacity pulse |
| Cockpit-Bg         | `scene.background = THREE.Color`     |
| Cockpit-Fog        | `THREE.FogExp2` color swap           |
| Wifi-Status-Update | `material.map` dispose + neu generieren |
