# NagVis3D – Up Side Down

Ein interaktives **3D-Visualisierungsprojekt** für NagVis / Checkmk.  
Die klassische 2D-Welt wird in eine echte dreidimensionale Umgebung gebracht – **"Up Side Down"**.

Besonders geeignet für Visualisierungen **über Tage** (Gebäude, Rechenzentren) und **unter Tage** (Tunnel, Stollen, Bergbau, Infrastruktur).

[![Changelog](https://img.shields.io/badge/Changelog-ansehen-blue)](src/changelog.txt)
[![Live Demo](https://img.shields.io/badge/Live_Demo-ansehen-brightgreen)](https://threed-maps-18xj.onrender.com/#dc1)

---

## ✨ Features

### 3D-Visualisierung
- Interaktive 3D-Szene im Browser (Three.js r165, keine Build-Pipeline)
- Etagenbasierte Darstellung: Hochhaus-Etagen oder Grubensohlen
- Geo-Projektion für Grubenmodelle (lat/lon → Szenenkoordinaten)
- Tunnel-/Kabelkanal-Glow für unterirdische Verbindungen (TubeGeometry)
- WLAN-Heatmaps für Access Points (dBm-gesteuert, CanvasTexture)
- Pulsringe bei kritischen Statuswechseln (3 expandierende Ringe)

### Exploded View
- Etagen-Spreizungs-Schieberegler (1× bis 4×)
- Smooth LERP-Animation (8 % pro Frame)
- Verbindungen und Tunnel folgen der Spreizung in Echtzeit

### Navigation & Kamera
- Freie Kamerasteuerung (Drehen / Schwenken / Zoom)
- Auto-Orbit (kontinuierliche Rotation)
- Cockpit-Modus: nur problematische Nodes sichtbar, roter Nebel
- Suche & Highlight: Echtzeit-Filterung mit automatischem Kameraschwenk
- `Ctrl+F` öffnet Suchfeld

### Minimap
- 2D-Draufsicht als einblendbares Panel (⊡-Button)
- Kamera-Pfeil zeigt aktuelle Position und Blickrichtung
- Klick auf Node → Kamera fliegt direkt dorthin

### Favoriten-Panel
- Aktuelle Kameraansicht als Screenshot speichern (★-Button)
- Ausklappbares Panel mit Thumbnail-Liste
- Inline-Umbenennen per Klick ins Labelfeld
- Slideshow-Modus: automatischer Wechsel mit einstellbarem Intervall
- Pro-Favorit-Checkbox: einzelne Ansichten aus der Slideshow ausschließen
- Persistenz in `localStorage`

### Modelle & Daten
- Vordefinierte Modelle in `config.js` (Hochhaus / Grube / Datacenter)
- Benutzerdefinierte Modelle ohne Code-Änderung (Dialog + localStorage)
- OSM-Übersichtskarte mit Cluster-Markern für alle Standorte (Leaflet)
- WebSocket-Integration für Live-Statusupdates

### UI & Bedienbarkeit
- Dark-Theme mit WCAG-AA-konformen Kontrastwerten
- Problem-Panel mit Schwere-Sortierung und Klick-to-Focus
- System-Log (ein-/ausklappbar)
- Kein Build-Tool, kein Framework — pure ES-Module

---

## 🚀 Schnellstart

```bash
git clone https://github.com/bh2005/nagvis3d-up-side-down.git
cd nagvis3d-up-side-down/src

# Lokalen Server starten (ES-Module brauchen HTTP)
python -m http.server 8000
# oder
npx serve .
```

Dann im Browser: [http://localhost:8000](http://localhost:8000)

---

## Projektstruktur

```
nagvis3d-up-side-down/
├── src/
│   ├── index.html          ← HUD, Dialoge, Canvas, importmap
│   ├── main.js             ← Entry-Point, Initialisierung
│   ├── config.js           ← Statuskonstanten, Farben, SCENE_MAX, FLOOR_STEP
│   ├── data.js             ← Geo-Helpers, buildFloors(), ModelManager
│   ├── scene.js            ← NV2Map3D-Klasse (Three.js, Exploded-View, WS)
│   ├── panels.js           ← Minimap, FavoritesBar, ProblemList, ModelDialog, MapOverlay
│   ├── style.css           ← Dark-Theme (Design-Tokens, kein backdrop-filter-Hack)
│   ├── changelog.txt       ← UTF-16 kodiert
│   └── admin-handbuch.md   ← Ausführliche Admin-Dokumentation
├── ideas.md                ← Feature-Backlog
└── README.md               ← Diese Datei
```

---

## Geplante NagVis-Integration

Die WebSocket-Schnittstelle (`app.connectWS(url)`) ist fertig implementiert.  
Noch ausstehend:

- Livestatus-Bridge (Python/FastAPI) als eigenständiger Service
- Automatisches Mapping von Nagios-Hostnamen auf Node-IDs
- ACK / Downtime direkt aus der 3D-Ansicht setzen

---

## Roadmap

| Status | Feature |
|---|---|
| ✅ | Etagenbasierte 3D-Visualisierung |
| ✅ | Geo-Projektion (Grubenmodelle) |
| ✅ | WebSocket Live-Status |
| ✅ | WLAN-Heatmaps, Pulsringe, Cockpit-Modus |
| ✅ | Exploded View mit LERP-Animation |
| ✅ | Minimap mit Click-to-fly |
| ✅ | Favoriten-Panel mit Slideshow |
| ✅ | OSM-Standortkarte (Leaflet) |
| ✅ | Modularisierung in 5 ES-Module |
| 🔲 | Livestatus-Backend-Service |
| 🔲 | Favoriten Export/Import (JSON) |
| 🔲 | Keyboard-Shortcuts vollständig (F, Space, …) |
| 🔲 | Performance-Optimierung für >500 Nodes |

---

## Bekannte Einschränkungen

- Derzeit reine Client-Demo (WebSocket vorhanden, aber kein mitgeliefertes Backend)
- Performance bei sehr großen Szenen (>500 Nodes) noch nicht optimiert
- Three.js via CDN — Offline-Betrieb erfordert manuelle Anpassung (→ admin-handbuch.md §8.3)

---

**Lizenz:** LGPL-2.1  
Made with ❤️ als Experimentierprojekt
