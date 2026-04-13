# NagVis3D – Up Side Down · Feature-Übersicht
> Stand: April 2026

---

## ✅ Implementiert

### 3D-Szene & Rendering (Three.js r165)
- **Etagenbasierte 3D-Darstellung** – Hochhaus-Etagen oder Grubensohlen; konfigurierbarer `FLOOR_STEP` (35 Scene-Units Standard)
- **Geo-Projektion** – lat/lon → Szenenkoordinaten für Grubenmodelle (automatische Skalierung auf `SCENE_MAX`)
- **Node-Typen** – Server, Router, Switch, Firewall, AccessPoint, generisch; eigene Geometrien je Typ
- **Status-Materialien** – Emissive-Farben nach Status (OK grün / WARNING orange / UNKNOWN grau / CRITICAL rot / DOWN dunkelrot); `SC`-Konstanten in `config.js`
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

### WebSocket / Live-Status
- **WS-Client-Stub** – `app.connectWS(url)` vollständig implementiert; wartet auf NagVis2-Backend-Bridge
- **Diff-basierte Updates** – nur geänderte Nodes werden verarbeitet; Status-Material, Heatmap-Texture und Labels werden aktualisiert
- **Reconnect** – automatischer Wiederverbindungsversuch bei Verbindungsunterbrechung

### UI & Bedienbarkeit
- **Dark-Theme** – CSS Design-Tokens; WCAG-AA-konformer Kontrast; kein `backdrop-filter`-Hack
- **Problem-Panel** – Liste aller Nodes mit Status ≠ OK; Schwere-Sortierung (DOWN > CRITICAL > WARNING > UNKNOWN); Klick-to-Focus
- **System-Log** – ein-/ausklappbar; Echtzeit-Statusmeldungen
- **Inspector-Panel** – Detail-Ansicht (Label, ID, Typ, Floor, Status, Plugin-Output, dBm bei APs)
- **Keine Build-Pipeline** – pure ES-Module, Vite nur für Tests; `importmap` in `index.html` für Three.js aus CDN

### Tests
- **Vitest** – `tests/config.test.js`, `tests/data.test.js`; Unit-Tests für Konfigurations- und Daten-Module

---

## 🔲 Geplant – Integration mit NagVis2

> Priorisierte Roadmap für die Verschmelzung von NagVis3D mit [nagvis-kurz-vor-2](../nagvis-kurz-vor-2/)

### Phase 1 – Grundlage (macht 3D produktiv nutzbar in NagVis2)

| # | Aufgabe | Aufwand | Status |
|---|---------|---------|--------|
| P1.1 | **Livestatus / NagVis2 Backend-Bridge** – FastAPI WebSocket-Service; liefert Daten aus NagVis2-Connector-Registry an den 3D-Client | 6–8 Tage | 🔲 |
| P1.2 | **Objekt-Mapping** – automatisches Zuordnen von Nagios-Hosts/Services zu 3D-Nodes (Koordinaten, Floor, Etage); JSON-Mapping-Datei pro Map | 4–6 Tage | 🔲 |
| P1.2a | **Add-Hosts-UI** – Dialog zum Hinzufügen / Entfernen von Hosts aus der 3D-Szene; Suche über NagVis2-Host-Liste (`GET /api/v1/hosts`); Zuweisung zu Floor + Node-Typ; Speichern im Mapping via `POST /api/3d/{model_id}/mapping` | 3–4 Tage | 🔲 |
| P1.3 | **Shared Authentication** – JWT / Session-Sharing; Nutzer meldet sich einmal in NagVis2 an, 3D-View übernimmt Token automatisch | 3–5 Tage | 🔲 |
| P1.4 | **3D-Gadget-Typ in NagVis2** – neuer Gadget-Renderer (`gadget-renderer.js`); 3D-Map als Gadget in normalen 2D-Maps einbettbar (ähnlich Graph/Iframe-Gadget) | 4–6 Tage | 🔲 |

**Ziel Phase 1:** 3D-View-Gadget in einer NagVis2-Map platzieren, das Live-Monitoring-Daten zeigt.

### Phase 2 – Version 1.0 der Integration

| # | Aufgabe | Aufwand | Status |
|---|---------|---------|--------|
| P2.1 | **Embed-Modus + URL-Parameter** – `?map=xyz&floor=2&highlight=host-abc`; Deep-Linking; Einbettung via Iframe oder Modal | 3–4 Tage | 🔲 |
| P2.2 | **Bidirektionale Commands** – Kontextmenü (Rechtsklick auf Node) mit folgenden Aktionen direkt aus der 3D-Ansicht: | 5–8 Tage | 🔲 |
|      | • **ACK (Problem bestätigen)** – Dialog mit Pflichtfeld „Grund"; `POST /api/v1/hosts/{host}/ack` bzw. Service-ACK; Node-Badge wechselt auf ✔ | | |
|      | • **Downtime planen** – Dialog mit Start/Ende + Grund; `POST /api/v1/hosts/{host}/downtime`; Node zeigt 🔧-Overlay | | |
|      | • **Link zur Datenquelle** – „In Checkmk öffnen"-Eintrag; baut URL aus Backend-Konfiguration (`checkmk_url/{site}/check_mk/index.py?...`); öffnet neuen Tab | | |
|      | • **Reschedule Check** – sofortiger Re-Check via `POST /api/v1/hosts/{host}/reschedule` | | |
|      | • **Service-Liste** – Aufklapper im Inspector zeigt alle Services des Hosts mit Status-Badges | | |
| P2.3 | **Map-spezifische 3D-Konfiguration** – pro NagVis2-Map eine `3d-config.json`; Modelle, Kamera-Startposition, Floor-Zuordnung | 4–5 Tage | 🔲 |
| P2.4 | **„Open in 3D"-Button** in NagVis2 – Toolbar-Button + Rechtsklick-Kontextmenü-Eintrag; öffnet volle 3D-Ansicht | 2–3 Tage | 🔲 |

### Phase 3 – Starke Integration & Polish

| # | Aufgabe | Aufwand | Status |
|---|---------|---------|--------|
| P3.1 | **Performance-Optimierung** – Instanced Mesh, LOD (Level of Detail), Frustum Culling für >500 Nodes | 5–7 Tage | 🔲 |
| P3.2 | **Einheitliches Design** – NagVis2-Design-Tokens (`--bg`, `--ok`, `--crit`, …) in 3D-CSS übernehmen; gleiche Button-Styles und Icon-Sprache | 3–4 Tage | 🔲 |
| P3.3 | **3D-Editor light** – Nodes in 3D verschieben und Position in NagVis2 persistieren; PATCH `/api/maps/{id}/objects/{oid}/pos` | 6–9 Tage | 🔲 |
| P3.4 | **Export/Import 3D-Layout** – JSON mit Positionsdaten; Backup, Versionierung, Map-zu-Map-Austausch | 3–4 Tage | 🔲 |

### Phase 4 – Nice-to-have & Zukunft

| # | Aufgabe | Status |
|---|---------|--------|
| P4.1 | **Node-Clustering bei weitem Zoom** – Hosts einer Etage kollabieren zu Statusblase (✓3 ⚠1 ✗2); Auffalten bei Annäherung | 🔲 |
| P4.2 | **Status-Timeline-Slider** – Zeitstrahl zum Zurückspulen; Nodes zeigen historischen Status | 🔲 |
| P4.3 | **WebXR / VR-Modus** – `renderer.xr` (Three.js built-in); Meta Quest / Browser-XR; HTTPS Pflicht | 🔲 |
| P4.4 | **Heatmap-Overlay pro Etage** – Status-Dichte auf Bodenplatte; Kernel-Density-Estimation auf Canvas | 🔲 |
| P4.5 | **Sound-Alert** – Web Audio API; synthetisierter Alarmton bei CRITICAL/DOWN; an/aus konfigurierbar | 🔲 |
| P4.6 | **Custom Icons** – SVG-Icons als `CSS2DObject` oder `SpriteMaterial` je nach Node-Typ (Server, Switch, Router, VM …) | 🔲 |
| P4.7 | **Checkmk BI-Widget** – BI-Aggregationen als 3D-Node-Typ (Integration mit ui-4-bi) | 🔲 |
| P4.8 | **Geo-Modus erweitern** – volle OSM + 3D-Gebäude (Mapbox GL / deck.gl) | 🔲 |
| P4.9 | **Mobile / Touch** – Pinch-Zoom, Touch-Orbit, responsive Breakpoints für Tablets in Leitzentralen | 🔲 |
| P4.10 | **Favoriten Export/Import** – JSON-Datei; Slideshow-Konfiguration zwischen Instanzen austauschen | 🔲 |

---

## 📊 Gesamtaufwand-Schätzung

| Phase | Inhalt | Aufwand |
|---|---|---|
| Phase 1 | Erste brauchbare NagVis2-Integration | 4–6 Wochen |
| Phase 1 + 2 | Vollständige v1.0-Integration | 8–10 Wochen |
| Phase 1–3 | Starke, produktive Integration | 2,5–3,5 Monate |
| Phase 1–4 | Nahtlose 2D+3D-Erfahrung | 5–6 Monate |

---

## 🏗️ Architektur (aktuell)

```
nagvis3d-up-side-down/
├── src/
│   ├── index.html          ← HUD, Dialoge, Canvas, importmap
│   ├── main.js             ← Entry-Point, Initialisierung, Event-Wiring
│   ├── app.js              ← NV2Map3D-Klasse (Haupt-Three.js-Logik, WS)
│   ├── config.js           ← SC-Status-Konstanten, SCENE_MAX, FLOOR_STEP
│   ├── data.js             ← Geo-Helpers, buildFloors(), ModelManager
│   ├── scene.js            ← Szenen-Setup (Licht, Renderer, OrbitControls)
│   ├── panels.js           ← Minimap, FavoritesBar, ProblemList, Inspector
│   ├── style.css           ← Dark-Theme (Design-Tokens)
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

### Geplante Architektur nach Phase 1 (mit NagVis2-Integration)

```
nagvis3d-up-side-down/
├── src/                    ← Frontend (unverändert)
│   └── bridge-client.js   ← Neu: WS-Client speziell für NagVis2-Bridge
│
nagvis-kurz-vor-2/
└── nagvis2/backend/
    ├── 3d/
    │   ├── __init__.py
    │   ├── bridge.py       ← FastAPI WebSocket-Bridge (Phase 1.1)
    │   └── mapper.py       ← Host→3D-Node-Mapping (Phase 1.2)
    └── frontend/js/
        └── gadget-3d.js    ← 3D-Gadget-Renderer (Phase 1.4)
```

---

## 🔧 Technologie-Stack

| Komponente | Technologie | Version |
|---|---|---|
| 3D-Engine | Three.js | r165 |
| Kamerasteuerung | OrbitControls | Three.js Addon |
| HTML-Labels | CSS2DRenderer | Three.js Addon |
| Geo-Karten | Leaflet.js | 1.9.x |
| Test-Runner | Vitest | aktuell |
| Backend-Bridge (geplant) | FastAPI + WebSocket | – |
| Auth-Integration (geplant) | JWT (RS256, NagVis2-kompatibel) | – |

---

## 🔗 Bezug zu NagVis2

Dieses Projekt ist das **3D-Frontend-Modul** für [nagvis-kurz-vor-2](../nagvis-kurz-vor-2/).

| NagVis2-Komponente | Rolle in der Integration |
|---|---|
| `connectors/registry.py` | Datenquelle für die Backend-Bridge; liefert Host/Service-Status aus allen Backends |
| `ws/ws_manager.py` | Vorlage für die 3D-WebSocket-Bridge (gleiche Broadcast-Logik) |
| `frontend/js/gadget-renderer.js` | Wird um den 3D-Gadget-Typ erweitert |
| JWT-Auth (`core/auth.py`) | Shared Authentication; 3D-View übernimmt NagVis2-Token |
| `data/maps/*.json` | Map-spezifische 3D-Konfiguration wird dort mitgespeichert |
