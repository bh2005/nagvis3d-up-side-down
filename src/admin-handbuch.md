# NagVis 3D – Admin-Handbuch

## Inhaltsverzeichnis

1. [Systemübersicht](#1-systemübersicht)
2. [Projektstruktur](#2-projektstruktur)
3. [Modelle konfigurieren](#3-modelle-konfigurieren)
4. [Nodes und Links pflegen](#4-nodes-und-links-pflegen)
5. [WebSocket-Integration](#5-websocket-integration)
6. [Benutzeroberfläche](#6-benutzeroberfläche)
7. [Features & Tastenkürzel](#7-features--tastenkürzel)
8. [Deployment](#8-deployment)
9. [Erweiterung & Anpassung](#9-erweiterung--anpassung)
10. [Fehlerbehebung](#10-fehlerbehebung)

---

## 1 Systemübersicht

NagVis 3D ist eine browserbasierte 3D-Netzwerkkarte auf Basis von **Three.js r165**.
Sie visualisiert Hosts, Switches und Access Points in einer interaktiven 3D-Szene mit:

- **Etagenbasierter Darstellung** (Hochhaus-Etagen oder Grubensohlen)
- **Exploded View** — Etagen spreizen sich animiert auseinander (Faktor 1×–4×)
- **Geo-Projektion** für Grubenmodelle (lat/lon → Szenenkoordinaten)
- **Live-Statusupdates** via WebSocket
- **WLAN-Heatmaps** für Access Points (dBm-gesteuert)
- **Tunnel-/Kabelkanal-Glow** für unterirdische/etagenverbindende Leitungen
- **Pulsringen** bei kritischen Statuswechseln
- **Minimap** (2D-Draufsicht) mit Klick-to-fly
- **Favoriten-Panel** mit Slideshow

**Keine Build-Pipeline erforderlich.** Die Anwendung ist pure HTML/CSS/JS mit ES-Modulen.
Three.js wird über CDN geladen (`cdn.jsdelivr.net`).

---

## 2 Projektstruktur

```
src/
├── index.html          # Hauptseite (HUD, Dialoge, Canvas, importmap)
├── main.js             # Entry-Point — initialisiert alle Klassen
├── config.js           # Konstanten & Statuskonfiguration (SC, S, al, SCENE_MAX …)
├── data.js             # Geo-Helpers, buildFloors(), ModelManager
├── scene.js            # NV2Map3D — Three.js-Szene, Exploded View, WebSocket
├── panels.js           # UI-Panels: Minimap, FavoritesBar, ProblemList,
│                       #            ModelDialog, MapOverlay
├── style.css           # Dark-Theme mit Design-Token-System
├── changelog.txt       # Versionshistorie (UTF-16 kodiert!)
└── admin-handbuch.md   # Dieses Dokument
```

**Wichtige Konstanten in `config.js`:**

| Konstante | Wert | Bedeutung |
|---|---|---|
| `SCENE_MAX` | 180 | Max. Breite des größten Clusters (Szeneneinheiten) |
| `FLOOR_STEP` | 35 | Vertikaler Abstand zwischen Etagen |
| `BBOX_PAD` | 300 | Meter-Padding um Node-Cluster bei Geo-Projektion |
| `TUNNEL_MIN_DIST` | 30 | Mindestdistanz für Auto-Tunnel-Erkennung (Grube) |

**Öffentliche Klassen-API:**

| Klasse | Modul | Zweck |
|---|---|---|
| `NV2Map3D` | `scene.js` | Three.js-Szene, Kamera, Nodes, Links |
| `Minimap` | `panels.js` | 2D-Draufsicht-Panel |
| `FavoritesBar` | `panels.js` | Favoriten-Panel mit Slideshow |
| `ProblemList` | `panels.js` | Problemliste (Status ≠ OK) |
| `ModelDialog` | `panels.js` | Modell-Auswahl & -Anlage |
| `MapOverlay` | `panels.js` | OSM-Standortkarte (Leaflet) |
| `ModelManager` | `data.js` | Preset- und localStorage-Modelle verwalten |

---

## 3 Modelle konfigurieren

### 3.1 Vordefinierte Modelle (`ModelManager` in `data.js`)

Modelle werden in `data.js` im Array `MODEL_PRESETS` definiert.
Zwei Typen sind möglich: `'building'` (Hochhaus) und `'mine'` (Grube/Schacht).

#### Hochhaus-Modell

```js
{
  id:          'mein-gebaeude',
  name:        'Verwaltungsgebäude',
  type:        'building',
  floorCount:  5,          // Anzahl Etagen (EG + 4 OG)
  floorHeight: 3.5,        // Reale Etagenhöhe in Metern
  width:       80,
  length:      60,
  lat:         51.5062,
  lon:         9.3327,
  data:        MEIN_GEBAEUDE_DATA,
}
```

**Y-Werte** bei `floorCount: 5`:
EG: −70 · 1.OG: −35 · 2.OG: 0 · 3.OG: +35 · 4.OG: +70

#### Gruben-Modell

```js
{
  id:   'grube-nord',
  name: 'Grube Nord',
  type: 'mine',
  floorHeight: 300,
  lat: 51.48, lon: 9.31,
  floors: [
    { label: 'ÜBERTAGE', sub: 'Schachtanlage' },
    { label: 'SOHLE 1',  sub: '−300 m' },
    { label: 'SOHLE 2',  sub: '−600 m' },
    { label: 'SOHLE 3',  sub: '−900 m' },
  ],
  data: GRUBE_NORD_DATA,
}
```

### 3.2 Benutzerdefinierte Modelle (Browser-localStorage)

Der Modell-Dialog (Button oben rechts) erlaubt das Anlegen neuer Modelle ohne Code-Änderung.
Diese werden in `localStorage` gespeichert und beim nächsten Start automatisch geladen.

> **Hinweis:** Browser-Modelle verwenden die Standard-Datensätze (`BUILDING_DATA` / `MAP_DATA`).
> Eigene Datensätze erfordern eine Ergänzung in `data.js`.

---

## 4 Nodes und Links pflegen

### 4.1 Datensatz-Struktur

```js
const MEIN_DATA = {
  nodes: [ /* Node-Objekte */ ],
  links: [ /* Link-Objekte */ ],
};
```

→ Vollständige Feldbeschreibung: **[info.html](info.html)**

### 4.2 Topologie-Empfehlungen

#### Hochhaus
```
MDF-Switch (EG)
  ├── SW-1.OG ──┬── WS-1-01  (tunnel:true = Kabelkanal)
  │             └── WS-1-02
  └── SW-2.OG ──── Server
```

#### Grube
```
CORE-SW-ÜBERTAGE
  └── CORE-SW-SOHLE1 ──┬── DIST-SW-ALPHA  (Auto-Tunnel, dist > 30)
                       └── DIST-SW-BETA
```

### 4.3 Node-ID Namenskonvention (Empfehlung)

| Typ | Schema | Beispiel |
|---|---|---|
| Core-Switch | `core-sw-<ort>` | `core-sw-s1` |
| Distribution-Switch | `dist-sw-<name>` | `dist-sw-alpha` |
| Etagen-Switch | `sw-<etage>` | `sw-og2` |
| Access Point | `ap-<etage>-<nr>` | `ap-og1-01` |
| Host/Server | `<funktion>-<nr>` | `web-01` |

### 4.4 WLAN Access Points

Access Points benötigen `wifiDbm` für die Heatmap:

| dBm | Qualität | Heatmap-Radius |
|---|---|---|
| −30 bis −40 | Sehr stark | 44–48 Szeneneinheiten |
| −41 bis −55 | Gut | 30–43 |
| −56 bis −70 | Mittel | 16–29 |
| −71 bis −90 | Schwach | 8–15 |

---

## 5 WebSocket-Integration

### 5.1 Verbindung herstellen

In `main.js` nach `loadModel()`:

```js
await window.app.loadModel(initialModel);
window.app.connectWS('ws://nagios-server:8008/ws/map/my-map');
```

### 5.2 Nachrichtenformat

```json
{
  "type": "status_update",
  "hosts": [
    { "id": "web-01",  "status": "critical" },
    { "id": "sw-og1", "status": "ok"        }
  ]
}
```

Gültige Status-Werte: `ok` · `warning` · `critical` · `down` · `unknown`

### 5.3 Automatische Effekte bei Statuswechsel

| Transition | Effekt |
|---|---|
| beliebig → `critical`/`down` | 3 expandierende Pulsringe (rot) |
| `critical`/`down` → besser | Pulsringe enden automatisch |
| `accesspoint`-Status ändert sich | Heatmap-Textur wird neu generiert |

### 5.4 Minimales Python-Backend (FastAPI)

```python
import json, asyncio
from fastapi import WebSocket

async def push_status(ws: WebSocket, map_id: str):
    while True:
        hosts = query_livestatus()
        await ws.send_text(json.dumps({
            "type": "status_update",
            "hosts": [{"id": h.name, "status": h.state} for h in hosts]
        }))
        await asyncio.sleep(30)
```

---

## 6 Benutzeroberfläche

### 6.1 Etagennavigation

Der **Etagen-Panel** (rechts) listet alle Etagen.  
Klick → Kamera fliegt auf diese Etage, andere werden ausgeblendet.  
**„Alle"** → Übersicht aller Etagen.  
**Doppelklick** → 2D-Grundriss-Modus (Draufsicht).

### 6.2 Exploded View

Der **SPREIZUNG**-Schieberegler (unten links, 1×–4×) spreizt alle Etagen auseinander —
Verbindungen und Tunnel folgen animiert mit.  
Wechsel in den 2D-Modus setzt die Spreizung automatisch auf 1× zurück.

### 6.3 Minimap

Button **⊡** öffnet eine 2D-Draufsicht (unten rechts).  
- Etagen-Umrisse als farbige Rahmen  
- Node-Status als farbige Punkte  
- Kamera-Pfeil zeigt aktuelle Position und Blickrichtung  
- **Klick auf einen Node** → Kamera fliegt direkt dorthin

### 6.4 Favoriten-Panel

Button **★** (oben rechts) öffnet das Favoriten-Panel (unten links).

| Aktion | Bedienung |
|---|---|
| Ansicht speichern | **＋ Speichern** im Panel |
| Ansicht laden | Thumbnail oder ↗-Button klicken |
| Umbenennen | Direkt ins Label-Feld klicken und tippen |
| Slideshow starten | **▶ Slideshow** (mind. 2 aktive Einträge) |
| Slideshow-Intervall | Zahlenfeld rechts neben Slideshow-Button (Sekunden) |
| Aus Slideshow ausschließen | ▶/▷-Checkbox pro Eintrag deaktivieren |
| Löschen | ✕-Button (erscheint beim Hover) |
| Favoriten werden gespeichert in | `localStorage` (bleiben nach Reload erhalten) |

> Während der Slideshow wird Auto-Orbit automatisch pausiert und nach dem Stopp wiederhergestellt.

### 6.5 Node Inspector

Klick auf Node → Inspector-Panel (rechts).  
Zeigt: Status, Typ, Etage, GPS, WLAN-dBm.  
„Focus Camera" → Kamera auf Node zentrieren.

### 6.6 Problemliste

Button **⚑ N** öffnet die nach Schwere sortierte Problemliste.  
Klick auf Eintrag → Kamera auf betroffenen Node.

### 6.7 OSM-Standortkarte

Button **🗺** öffnet die Leaflet-Karte aller Modelle mit GPS-Koordinaten.  
Klick auf Marker → Modell sofort laden.

### 6.8 System-Log

Unteres linkes Panel. **▼/▶** im Titel klappt die Einträge ein/aus.

---

## 7 Features & Tastenkürzel

| Aktion | Methode / Kürzel |
|---|---|
| **Drehen** | Linke Maustaste + ziehen |
| **Schwenken** | Rechte Maustaste + ziehen |
| **Zoom** | Mausrad · ± Buttons |
| **Node auswählen** | Linksklick |
| **Inspector schließen** | `Escape` |
| **Suche öffnen** | `Ctrl+F` |
| **Suche leeren** | `Escape` im Suchfeld |
| **Auto-Orbit** | Toggle-Button „Auto-Orbit" |
| **Cockpit-Modus** | Button **⚡** |
| **2D-Modus** | Etage doppelklicken |
| **3D zurück** | Button **← 3D** oder `Escape` |
| **Minimap** | Button **⊡** |
| **Favoriten-Panel** | Button **★** |
| **Slideshow** | **▶ Slideshow** im Favoriten-Panel |

### Cockpit-Modus

Blendet alle OK-Nodes aus, schaltet Hintergrund auf dunkelrot.
Nur warning/critical/down/unknown-Nodes bleiben sichtbar — ideal für NOC-Ansichten.

### Exploded View

Der Spreizungsfaktor kann live per Schieberegler angepasst werden.
TubeGeometry (Tunnel) wird dabei pro Frame neu aufgebaut; normale Verbindungen
werden per `Float32BufferAttribute.setXYZ()` direkt im Buffer aktualisiert.

---

## 8 Deployment

### 8.1 Lokaler Entwicklungsserver

```bash
cd src/
python -m http.server 8080
# oder
npx serve .
```

### 8.2 Nginx (Produktion)

```nginx
server {
    listen 80;
    server_name nagvis3d.intern;
    root /var/www/nagvis3d/src;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache";
    }
    location /ws/ {
        proxy_pass http://localhost:8008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 8.3 Offline-Betrieb (kein CDN)

```bash
npm install three@0.165.0
```

In `index.html` die importmap anpassen:

```json
{
  "imports": {
    "three":         "/lib/three/build/three.module.js",
    "three/addons/": "/lib/three/examples/jsm/"
  }
}
```

---

## 9 Erweiterung & Anpassung

### 9.1 Neuen Node-Typ hinzufügen

In `scene.js`, Methode `_buildNode(node)`: neuen `case` für `node.type` ergänzen.

### 9.2 Neue Statusfarbe

In `config.js`, Objekt `SC`:

```js
export const SC = {
  maintenance: { hex: 0x3498db, emissive: 0x1a6090,
                 badge:'s-maint', cls:'maint', label:'MAINTENANCE', sev: 1.5 },
  // ...
};
```

### 9.3 Tunnel-Schwellenwert anpassen

In `config.js`:

```js
export const TUNNEL_MIN_DIST = 30;  // erhöhen → weniger Auto-Tunnel
```

### 9.4 Heatmap-Radius-Formel

In `scene.js`, Methode `_dbmToRadius()`:

```js
_dbmToRadius(dbm) {
  const clamped = Math.max(-90, Math.min(-30, dbm ?? -65));
  return 8 + (clamped - (-90)) / 60 * 40;  // 8…48 Szeneneinheiten
}
```

### 9.5 Neues Panel hinzufügen

1. Klasse in `panels.js` erstellen und mit `export class` exportieren
2. In `main.js` importieren und instanziieren
3. HTML-Element in `index.html` ergänzen
4. CSS in `style.css` ergänzen (Design-Tokens aus `:root` verwenden)

---

## 10 Fehlerbehebung

| Problem | Ursache | Lösung |
|---|---|---|
| Node erscheint nicht | `floor` stimmt nicht mit Modell-Etagenlabel überein | Exakte Schreibweise prüfen (Umlaute, Leerzeichen) |
| Verbindungen folgen Spreizung nicht | `srcId`/`tgtId` fehlt in `linkObjects` oder `tunnelObjects` | `scene.js: _storeBasePositions()` nach `_buildLinks()` prüfen |
| Kein Tunnel-Glow | Distanz < `TUNNEL_MIN_DIST` oder kein `tunnel:true` | `tunnel:true` explizit setzen oder Konstante in `config.js` senken |
| Heatmap fehlt | `type` nicht `'accesspoint'` oder `wifiDbm` fehlt | Beide Felder prüfen |
| WebSocket verbindet nicht | URL falsch oder Backend nicht erreichbar | Browser-Konsole; CORS/WSS beachten |
| Minimap reagiert nicht auf Klick | `window._minimap` nicht initialisiert | Konsole auf Fehler beim Konstruktor prüfen |
| Favoriten-Panel fehlt | `window._favorites` init-Fehler | try/catch in `main.js` prüfen; `#favorites-panel`, `#btn-fav-panel` etc. in HTML vorhanden? |
| Slideshow startet nicht | Weniger als 2 Einträge mit aktivem ▶-Häkchen | Mindestens 2 Favoriten mit aktivierter Slideshow-Checkbox |
| Labels bleiben nach Modellwechsel | CSS2D-DOM-Leak | `disposeCSS2D()` in `scene.js` prüfen |
| Geo-Projektion falsch | Referenzkoordinate zu weit weg | `cfg.lat/lon` näher am Datenzentrum wählen |

---

*Letzte Änderung: 2026-04-06 · NagVis 3D*
