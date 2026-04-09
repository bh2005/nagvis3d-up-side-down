# NagVis3D – Up Side Down

**Interaktive 3D-Netzvisualisierung für Nagios / Checkmk / NagVis2**

Die klassische 2D-Welt wird in eine echte dreidimensionale Umgebung gebracht — „Up Side Down".  
Besonders geeignet für Visualisierungen **über Tage** (Gebäude, Rechenzentren) und **unter Tage** (Tunnel, Stollen, Bergbau, Infrastruktur).

[![Changelog](https://img.shields.io/badge/Changelog-ansehen-blue)](src/changelog.txt)
[![Live Demo](https://img.shields.io/badge/Live_Demo-ansehen-brightgreen)](https://threed-maps-18xj.onrender.com/#dc1)
[![Features](https://img.shields.io/badge/Features-ansehen-orange)](FEATURES.md)

> **Live-Demo:** [https://threed-maps-18xj.onrender.com/#dc1](https://threed-maps-18xj.onrender.com/#dc1)  
> ⚠ Gehostet auf Render Free Tier — beim ersten Aufruf kann der Start **30–60 Sekunden** dauern.

---

## Features

| Bereich | Details |
|---|---|
| **3D-Szene** | Three.js r165; Etagen-Darstellung; Tunnel-Glow (TubeGeometry); keine Build-Pipeline |
| **Geo-Projektion** | lat/lon → Szenenkoordinaten für Gruben- und Freigelände-Modelle |
| **Exploded View** | Etagen-Spreizung 1× – 4× mit LERP-Animation; Verbindungen folgen in Echtzeit |
| **WLAN-Heatmaps** | dBm-gesteuerte CanvasTexture-Overlays für Access Points |
| **Pulsringe** | 3 expandierende Ringe bei kritischen Statuswechseln |
| **Cockpit-Modus** | Nur problematische Nodes sichtbar, roter Nebel, automatischer Fokus |
| **Minimap** | 2D-Draufsicht; Kamera-Pfeil; Klick → Kamera fliegt dorthin |
| **Favoriten** | Screenshot + Thumbnail; Slideshow-Modus; Inline-Umbenennen; localStorage |
| **Suche** | Echtzeit-Filter; automatischer Kameraschwenk; `Ctrl+F` |
| **Modelle** | Vordefiniert (Hochhaus / Grube / Datacenter); benutzerdefiniert per Dialog |
| **OSM-Karte** | Leaflet; Cluster-Marker für alle Standorte; Klick → Modell wechseln |
| **WebSocket** | Live-Statusupdates; Auto-Reconnect; bereit für NagVis2-Backend |
| **Modularisierung** | 5 ES-Module (`data.js`, `scene.js`, `panels.js`, `config.js`, `main.js`) |
| **Dark-Theme** | WCAG-AA-konformer Kontrast; Design-Tokens; keine Build-Pipeline |

---

## Schnellstart

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
│   ├── app.js              ← NV2Map3D-Klasse (Three.js, Exploded-View, WS)
│   ├── config.js           ← Statuskonstanten, Farben, SCENE_MAX, FLOOR_STEP
│   ├── data.js             ← Geo-Helpers, buildFloors(), ModelManager
│   ├── scene.js            ← Szenen-Helfer, Tunnel, Heatmap
│   ├── panels.js           ← Minimap, FavoritesBar, ProblemList, ModelDialog, MapOverlay
│   ├── style.css           ← Dark-Theme (Design-Tokens)
│   ├── data/               ← JSON-Datendateien (map_mine.json, map_building.json, …)
│   ├── changelog.txt       ← Änderungshistorie
│   └── admin-handbuch.md   ← Admin-Dokumentation
├── FEATURES.md             ← Feature-Übersicht & Roadmap
├── ideas.md                ← Feature-Backlog
└── README.md               ← Diese Datei
```

---

## Geplante NagVis2-Integration (4 Phasen)

| Phase | Ziel | Status |
|---|---|---|
| **P1** | Livestatus-Bridge (FastAPI) + WebSocket-Feed aus NagVis2 | 🔲 |
| **P2** | Einbettung als NagVis2-Gadget (`type: nagvis3d`); Shared JWT-Auth | 🔲 |
| **P3** | ACK / Downtime / Reschedule direkt aus 3D-Ansicht | 🔲 |
| **P4** | BI-Status (ui-4-bi) als 3D-Node-Typ; Theme-Sync | 🔲 |

Die WebSocket-Schnittstelle (`app.connectWS(url)`) ist bereits fertig implementiert.

---

## Roadmap

| Status | Feature |
|---|---|
| ✅ | Etagenbasierte 3D-Visualisierung (Hochhaus / Grube / Datacenter) |
| ✅ | Geo-Projektion für Grubenmodelle (lat/lon → Szene) |
| ✅ | WebSocket Live-Status + Auto-Reconnect |
| ✅ | WLAN-Heatmaps (dBm), Pulsringe, Cockpit-Modus |
| ✅ | Exploded View mit LERP-Animation |
| ✅ | Minimap mit Click-to-fly |
| ✅ | Favoriten-Panel mit Slideshow + Inline-Rename |
| ✅ | OSM-Standortkarte (Leaflet) mit Cluster-Markern |
| ✅ | Modularisierung in 5 ES-Module; JSON-Datendateien |
| 🔲 | Livestatus-Backend-Service (NagVis2-Bridge) |
| 🔲 | ACK / Downtime aus 3D-Ansicht |
| 🔲 | NagVis2-Gadget-Einbettung + Shared Auth |
| 🔲 | Favoriten Export/Import (JSON) |
| 🔲 | Performance-Optimierung für >500 Nodes |

---

## Bekannte Einschränkungen

- Reine Client-Demo (WebSocket vorhanden, aber kein mitgeliefertes Backend)
- Performance bei sehr großen Szenen (>500 Nodes) noch nicht optimiert
- Three.js via CDN — Offline-Betrieb erfordert manuelle Anpassung (→ `admin-handbuch.md §8.3`)

---

## Links

| | |
|---|---|
| ✨ [Feature-Übersicht](FEATURES.md) | Was ist gebaut, was ist geplant |
| 📋 [Changelog](src/changelog.txt) | Änderungshistorie |
| 📚 [Admin-Handbuch](src/admin-handbuch.md) | Installation, Konfiguration, Betrieb |
| 🗺 [nagvis-kurz-vor-2](../nagvis-kurz-vor-2/) | NagVis2 Backend + 2D-Maps (geplante Integration) |
| 📊 [ui-4-bi](../ui-4-bi/) | Checkmk BI Visual Editor (geplante Integration) |

---

**Lizenz:** LGPL-2.1  
**Projektstatus:** Beta (funktioniert stabil, aktive Weiterentwicklung)  
**Version:** 1.x (April 2026)
