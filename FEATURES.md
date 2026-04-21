# NagVis3D – Up Side Down · Feature-Übersicht
> Stand: April 2026

---

## ✅ Implementiert

### 3D-Szene & Rendering (Three.js r165)
- **Etagenbasierte 3D-Darstellung** – Hochhaus-Etagen oder Grubensohlen; konfigurierbarer `FLOOR_STEP` (35 Scene-Units Standard)
- **Geo-Projektion** – lat/lon → Szenenkoordinaten für Grubenmodelle (automatische Skalierung auf `SCENE_MAX`)
- **Node-Typen** – Server, Router, Switch, Firewall, AccessPoint, generisch; eigene Geometrien je Typ
- **Status-Materialien** – Emissive-Farben nach Checkmk-Palette: OK teal (`#13d389`) / WARNING gelb (`#ffd703`) / UNKNOWN grau / CRITICAL+DOWN rot (`#c83232`); `SC`-Konstanten in `config.js`
- **Tunnel / Kabelkanal-Glow** – `TubeGeometry` für unterirdische Verbindungen länger als 30 Scene-Units; additives Blending
- **Verbindungslinien** – bidirektionale Linien zwischen Nodes; folgen der Exploded-View-Spreizung in Echtzeit
- **CSS2DRenderer** – HTML-Labels (Hostnamen, Status-Badges) als DOM-Overlay über der WebGL-Szene; WeakMap-Cache-Cleanup bei Szenen-Reset

### Exploded View
- **Etagen-Spreizungs-Schieberegler** – 1× bis 4× via HTML-Range-Input
- **Smooth LERP-Animation** – 8 % per AnimationFrame; alle Node-Positionen, Tunnel und Verbindungen folgen synchron
- **Live-Aktualisierung** – Status-Updates während der Spreizung korrekt positioniert

### WLAN-Heatmap (AccessPoints)
- **Disc-Geometrie + Antenne** für AP-Nodes
- **CanvasTexture** – radialer Farbverlauf (grün/gelb/rot) auf Etagenbodenplatte
- **Additive Blending** – mehrere APs überlagern sich realistisch
- **dBm-abhängiger Radius** – `-30 dBm` → 48 Scene-Units, `-90 dBm` → 8 Scene-Units; lineare Berechnung via `_dbmToRadius()`
- **Status-Update** – Texture wird bei jedem Status-Wechsel neu generiert
- **Inspector-Anzeige** – dBm-Wert und berechneter Radius im Detail-Panel

### Effekte & Animationen
- **Pulsringe bei Statuswechsel** – 3 expandierende `THREE.RingGeometry`-Ringe bei Wechsel auf CRITICAL/DOWN; verblassen automatisch
- **Suchring-Highlight** – blau pulsierender Ring beim Suchtreffer; alle anderen Nodes ausgegraut
- **Cockpit-Modus** – ⚡-Button; nur WARNING/CRITICAL/DOWN sichtbar; `scene.background` wechselt auf Dunkelrot; `THREE.FogExp2`-Farbe umschalten; Escape zum Beenden

### Navigation & Kamera
- **OrbitControls** – freies Drehen / Schwenken / Zoom (Three.js Addon)
- **Auto-Orbit** – kontinuierliche Rotation (an/ab über Button)
- **Click-to-fly** – Kamera schwenkt automatisch zu angeklicktem Node
- **Suche & Highlight** – Echtzeit-Filterung über Label, ID, Floor, Typ; `Ctrl+F` öffnet Suchfeld; Escape zurücksetzen; bei 1 Treffer automatischer Kameraschwenk

### Minimap
- **2D-Draufsicht** – einblendbares Panel (⊡-Button); `<canvas>`-basiert
- **Kamera-Pfeil** – zeigt aktuelle Position und Blickrichtung in der Minimap
- **Click-to-fly** – Klick auf Node in der Minimap → Kamera fliegt direkt dorthin

### Favoriten-Panel
- **Screenshot-Speicherung** – aktuelle Kameraansicht als Thumbnail (★-Button); `renderer.domElement.toDataURL()`
- **Panel mit Thumbnail-Liste** – ausklappbar; Inline-Umbenennen per Klick
- **Slideshow-Modus** – automatischer Wechsel der gespeicherten Ansichten; konfigurierbares Intervall
- **Pro-Favorit-Checkbox** – einzelne Ansichten aus der Slideshow ausschließen
- **Persistenz** – `localStorage`

### Modelle & Daten
- **Vordefinierte Modelle** – `grube1.json`, `grube2.json` (Bergbau/Untertage), `dc1.json` (Rechenzentrum), `building.json` (Hochhaus); in `src/data/`
- **Benutzerdefinierte Modelle** – Dialog ohne Code-Änderung; Persistenz in `localStorage`
- **ModelManager** – `data.js`; `buildFloors()` für Etagen-Aufbau aus JSON; Geo-Helper für Koordinatentransformation
- **OSM-Standortkarte** – Leaflet.js; Cluster-Marker für alle konfigurierten Standorte; Klick öffnet 3D-View des jeweiligen Modells

### WebSocket / Live-Status (nagvis2-kompatibel)

- **Vollständiger WS-Client** – `scene.js`; nagvis2-Protokoll: `event`-Feld mit `snapshot` / `status_update` / `heartbeat` / `backend_error`
- **nagvis2-Statusmapping** – `mapState()` in `config.js` übersetzt `state_label` (`UP`, `DOWN`, `UNREACHABLE`, `WARNING`, `CRITICAL`, `UNKNOWN`, `PENDING`) auf interne Status-Keys
- **Host-Objekt-Format** – `{ name, state_label, acknowledged, in_downtime, output, services_ok, services_warn, services_crit, _backend_id }`
- **Service-Aggregation** – `_applyServiceUpdates()` berechnet schlechtesten Service-Status je Host; überlagert den Node-Status
- **userData-Speicherung** – `acknowledged`, `in_downtime`, `output`, `svc_ok/warn/crit`, `backend_id` je Node-Gruppe für Inspector-Anzeige
- **Exponentieller Backoff** – 2 s → 4 s → 8 s … max. 30 s; setzt sich bei erfolgreicher Verbindung zurück
- **Auth-Token** – optionaler Bearer-Token im WS-Handshake-Header
- **`disconnectWS()`** – sauberes Trennen; unterdrückt Reconnect-Versuche

### WS-Verbindungs-Dialog

- **HUD-Button „WS"** mit farbigem Verbindungspunkt (`#ws-conn-dot`):
  - ⚫ `off` · 🟠 `connecting` · 🟢 `connected` · 🔴 `disconnected` / `error`
- **Dialog** – URL + optionaler Auth-Token; Verbinden / Trennen
- **localStorage-Persistenz** – `nv3d_ws_url`, `nv3d_ws_token`; Auto-Connect beim Seitenstart
- **JS-API** – `window.connectNv3d(url, token)` / `window.disconnectNv3d()`

### Inspector-Panel (erweitert)

- **Status-Badge** mit ACK-Badge (`ACK`, blau) und DT-Badge (`DT`, lila) aus Live-Daten
- **Output-Zeile** – Plugin-Output-Text des Hosts
- **Service-Zähler** – `N OK / N WARN / N CRIT` aus aggregierten Service-Daten
- **Backend-ID** – zeigt das aktive nagvis2-Backend des Nodes
- **Typ, Etage, GPS-Koordinaten** (unverändert)

### Design & Styling (Checkmk / nagvis2-Alignment)

- **Checkmk-Farbpalette** (identisch mit nagvis2):
  - OK: `#13d389` (teal-grün) · WARN: `#ffd703` (gelb) · CRIT/DOWN: `#c83232` (rot) · UNKN: `#9e9e9e`
- **3D-Mesh-Farben** in `config.js` auf gleiche Werte aktualisiert
- **CSS-Tokens** erweitert: `--ok-bg`, `--ok-border`, `--warn-bg`, `--warn-border`, `--crit-bg`, `--crit-border`, `--ack-color`, `--downtime`
- **Hintergrund** blau-grau (`#1c2228`-Basis) statt near-black; Design-Panels aus nagvis2-Palette
- **Roboto / Roboto Mono** als primäre Schriftfamilie (Google Fonts Import)
- **Status-Badges** mit Token-basiertem Hintergrund + Rahmen (statt hartkodiert)
- **Light-Mode** ebenfalls auf nagvis2-Tokens aktualisiert

### Tests
- **Vitest** – `tests/config.test.js`, `tests/data.test.js`; Unit-Tests für Konfigurations- und Daten-Module

---

## 🔲 Geplant – Integration mit NagVis2

> Priorisierte Roadmap für die Verschmelzung von NagVis3D mit [nagvis-kurz-vor-2](../nagvis-kurz-vor-2/)

### Phase 2 – Commands & Gadget

| # | Aufgabe | Aufwand | Status |
|---|---------|---------|--------|
| P2.1 | **Embed-Modus + URL-Parameter** – `?map=xyz&floor=2&highlight=host-abc`; Deep-Linking | 3–4 Tage | 🔲 |
| P2.2 | **Bidirektionale Commands** – ACK, Downtime, Reschedule, „In Monitoring öffnen" per Rechtsklick aus 3D | 5–8 Tage | 🔲 |
| P2.3 | **3D-Gadget-Typ in NagVis2** – 3D-Map als Gadget in normalen 2D-Maps einbettbar | 4–6 Tage | 🔲 |
| P2.4 | **Shared Authentication** – JWT-Session-Sharing; Token aus NagVis2 wird automatisch übernommen | 3–5 Tage | 🔲 |

### Phase 3 – Starke Integration & Polish

| # | Aufgabe | Aufwand | Status |
|---|---------|---------|--------|
| P3.1 | **Performance-Optimierung** – Instanced Mesh, LOD, Frustum Culling für >500 Nodes | 5–7 Tage | 🔲 |
| P3.2 | **3D-Editor light** – Nodes in 3D verschieben und Position persistieren | 6–9 Tage | 🔲 |
| P3.3 | **Export/Import 3D-Layout** – JSON mit Positionsdaten; Versionierung | 3–4 Tage | 🔲 |

### Phase 4 – Nice-to-have & Zukunft

| # | Aufgabe | Status |
|---|---------|--------|
| P4.1 | **Node-Clustering bei weitem Zoom** – Hosts kollabieren zu Statusblase | 🔲 |
| P4.2 | **Status-Timeline-Slider** – Zeitstrahl zum Zurückspulen | 🔲 |
| P4.3 | **WebXR / VR-Modus** – `renderer.xr`; Meta Quest / Browser-XR | 🔲 |
| P4.4 | **Heatmap-Overlay pro Etage** – Status-Dichte auf Bodenplatte | 🔲 |
| P4.5 | **Sound-Alert** – Web Audio API; Alarmton bei CRITICAL/DOWN | 🔲 |
| P4.6 | **Custom Icons** – SVG-Icons als `CSS2DObject` je nach Node-Typ | 🔲 |
| P4.7 | **Checkmk BI-Widget** – BI-Aggregationen als 3D-Node-Typ (ui-4-bi) | 🔲 |
| P4.8 | **Geo-Modus erweitern** – volle OSM + 3D-Gebäude (Mapbox GL / deck.gl) | 🔲 |
| P4.9 | **Mobile / Touch** – Pinch-Zoom, Touch-Orbit für Tablets | 🔲 |
| P4.10 | **Favoriten Export/Import** – JSON; Slideshow-Konfig austauschen | 🔲 |

---

## 📊 Gesamtaufwand-Schätzung (verbleibende Phasen)

| Phase | Inhalt | Aufwand |
|---|---|---|
| Phase 2 | Commands, Gadget-Einbettung, Shared Auth | 4–6 Wochen |
| Phase 2 + 3 | Vollständige v1.0-Integration | 8–10 Wochen |
| Phase 2–4 | Nahtlose 2D+3D-Erfahrung | 4–5 Monate |

---

## 🏗️ Architektur (aktuell)

```
nagvis3d-up-side-down/
├── src/
│   ├── index.html          ← HUD, WS-Dialog, Modell-Dialog, Canvas, importmap
│   ├── main.js             ← Entry-Point; WS-Persistenz; connectNv3d()/disconnectNv3d()
│   ├── config.js           ← SC-Status-Konstanten (Checkmk-Farben), mapState(), SCENE_MAX
│   ├── data.js             ← Geo-Helpers, buildFloors(), ModelManager
│   ├── scene.js            ← NV2Map3D: Three.js, WS-Client, Inspector, updateNodeStatus()
│   ├── panels.js           ← Minimap, FavoritesBar, ProblemList, ModelDialog, MapOverlay
│   ├── style.css           ← Checkmk-Design-Tokens (Roboto, ok/warn/crit-Tokens)
│   └── data/
│       ├── building.json   ← Hochhaus-Modell
│       ├── dc1.json        ← Rechenzentrum-Modell
│       ├── grube1.json     ← Bergbau/Untertage-Modell 1
│       └── grube2.json     ← Bergbau/Untertage-Modell 2
├── tests/
│   ├── config.test.js      ← Unit-Tests Konfiguration
│   └── data.test.js        ← Unit-Tests Daten-Helpers
├── FEATURES.md             ← Diese Datei
├── ideas.md                ← Feature-Backlog (detailliert)
└── README.md
```

---

## 🔧 Technologie-Stack

| Komponente | Technologie | Version |
|---|---|---|
| 3D-Engine | Three.js | r165 |
| Kamerasteuerung | OrbitControls | Three.js Addon |
| HTML-Labels | CSS2DRenderer | Three.js Addon |
| Geo-Karten | Leaflet.js | 1.9.x |
| Schriftart | Roboto / Roboto Mono | Google Fonts |
| Test-Runner | Vitest | aktuell |
| WS-Protokoll | nagvis2-kompatibel | `/ws/map/<id>` |
| Auth (WS) | Bearer Token (optional) | – |

---

## 🔗 Bezug zu NagVis2

Dieses Projekt ist das **3D-Frontend-Modul** für [nagvis-kurz-vor-2](../nagvis-kurz-vor-2/).
Das nagvis2-Backend sendet Status-Updates direkt per WebSocket — kein Bridge-Layer nötig.

| NagVis2-Komponente | Rolle in der Integration |
|---|---|
| `ws/ws_manager.py` | Sendet `snapshot` / `status_update` Nachrichten im nagvis2-Format |
| `connectors/registry.py` | Liefert Host/Service-Status aus allen Backends |
| `frontend/js/gadget-renderer.js` | Wird um den 3D-Gadget-Typ erweitert (Phase 2) |
| JWT-Auth (`core/auth.py`) | Shared Authentication (Phase 2); Token wird per WS-Dialog eingetragen |
| `data/maps/*.json` | Map-spezifische 3D-Konfiguration wird dort mitgespeichert (Phase 2) |
