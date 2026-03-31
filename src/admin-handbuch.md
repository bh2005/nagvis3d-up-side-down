# NagVis 3D v3 – Admin-Handbuch

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

NagVis 3D v3 ist eine browserbasierte 3D-Netzwerkkarte auf Basis von **Three.js r165**.
Sie visualisiert Hosts, Switches und Access Points in einer interaktiven 3D-Szene mit:

- **Etagenbasierter Darstellung** (Hochhaus-Etagen oder Grubensohlen)
- **Geo-Projektion** für Grubenmodelle (lat/lon → Szenenkoordinaten)
- **Live-Statusupdates** via WebSocket
- **WLAN-Heatmaps** für Access Points (dBm-gesteuert)
- **Tunnel-/Kabelkanal-Glow** für unterirdische/etagen-interne Verbindungen
- **Pulsringen** bei kritischen Statuswechseln

**Keine Build-Pipeline erforderlich.** Die Anwendung ist pure HTML/CSS/JS mit ES-Modulen.
Three.js wird über CDN geladen (`cdn.jsdelivr.net`).

---

## 2 Projektstruktur

```
v3/
├── index.html          # Hauptseite (HUD, Dialoge, Canvas)
├── app.js              # Gesamte Anwendungslogik (Klasse NV2Map3D)
├── style.css           # Styling (Dark-Theme)
├── info.html           # Datenreferenz (Node-Felder, Beispiele)
├── admin-handbuch.md   # Dieses Dokument
└── ideas.md            # Feature-Backlog / Ideen
```

**Wichtige Konstanten in `app.js`:**

| Konstante | Wert | Bedeutung |
|---|---|---|
| `SCENE_MAX` | 180 | Max. Breite des größten Clusters (Szeneneinheiten) |
| `FLOOR_STEP` | 35 | Vertikaler Abstand zwischen Etagen (Szeneneinheiten) |
| `BBOX_PAD` | 300 | Meter-Padding um Node-Cluster bei Geo-Projektion |
| `TUNNEL_MIN_DIST` | 30 | Mindestdistanz für Auto-Tunnel-Erkennung (Grube) |

---

## 3 Modelle konfigurieren

### 3.1 Vordefinierte Modelle (`MODEL_PRESETS`)

Modelle werden in `app.js` im Array `MODEL_PRESETS` definiert.
Zwei Typen sind möglich: `'building'` (Hochhaus) und `'mine'` (Grube/Schacht).

#### Hochhaus-Modell

```js
{
  id:          'mein-gebäude',       // URL-Hash-ID
  name:        'Verwaltungsgebäude', // Anzeigename
  type:        'building',
  floorCount:  5,                    // Anzahl Etagen (EG + 4 OG)
  floorHeight: 3.5,                  // Reale Etagenhöhe in Metern
  width:       80,                   // Gebäudebreite in Metern
  length:      60,                   // Gebäudelänge in Metern
  lat:         51.5062,              // GPS (nur Beschriftung)
  lon:         9.3327,
  data:        MEIN_GEBAEUDE_DATA,   // Eigener Datensatz (s. Abschnitt 4)
}
```

**Y-Werte der Etagen** bei `floorCount: 5`:
- EG: −70, 1.OG: −35, 2.OG: 0, 3.OG: +35, 4.OG: +70

#### Gruben-Modell

```js
{
  id:          'grube-nord',
  name:        'Grube Nord',
  type:        'mine',
  floorHeight: 300,                  // Meter pro Sohle (für Beschriftung)
  lat:         51.48,                // Schacht-Referenzkoordinate
  lon:         9.31,
  floors: [
    { label: 'ÜBERTAGE', sub: 'Schachtanlage' },
    { label: 'SOHLE 1',  sub: '−300 m' },
    { label: 'SOHLE 2',  sub: '−600 m' },
    { label: 'SOHLE 3',  sub: '−900 m' },
  ],
  data: GRUBE_NORD_DATA,
}
```

### 3.2 Benutzerdefinierte Modelle (Browser-LocalStorage)

Über den Modell-Dialog (Button oben rechts in der Karte) können Nutzer
neue Modelle ohne Code-Änderung anlegen. Diese werden in `localStorage` gespeichert.

> **Hinweis:** Browser-Modelle verwenden immer die Standard-Datensätze
> (`BUILDING_DATA` / `MAP_DATA`). Eigene Datensätze erfordern Code-Änderung.

---

## 4 Nodes und Links pflegen

### 4.1 Datensatz-Struktur

Jeder Datensatz hat folgende Form:

```js
const MEIN_DATA = {
  nodes: [ /* Node-Objekte */ ],
  links: [ /* Link-Objekte */ ],
};
```

→ Vollständige Feldbeschreibung: **[info.html](info.html)**

### 4.2 Topologie-Empfehlungen

#### Hochhaus (Sternverteilung)
```
MDF-Switch (EG)
  │ Steigleitung (normale Linie, kein tunnel)
  ├── SW-1.OG ──┬── WS-1-01  (tunnel:true = Kabelkanal)
  │             └── WS-1-02
  ├── SW-2.OG ──┬── WS-2-01
  │             └── Drucker
  └── SW-3.OG ──── Server
```

#### Grube (Sternverteilung pro Sohle)
```
CORE-SW-ÜBERTAGE
  │ (Schacht, normaler Link, ÜBERTAGE ≠ SOHLE → kein Auto-Tunnel)
  CORE-SW-SOHLE1 ──┬── DIST-SW-ALPHA  (Auto-Tunnel, dist > 30)
                   ├── DIST-SW-BETA
                   └── DIST-SW-GAMMA
  CORE-SW-SOHLE2 ──┬── server-01
                   └── server-02
```

### 4.3 Node-ID Namenskonvention (Empfehlung)

| Typ | Schema | Beispiel |
|---|---|---|
| Core-Switch | `core-sw-<ort>` | `core-sw-s1`, `core-sw-ot` |
| Distribution-Switch | `dist-sw-<name>` | `dist-sw-alpha` |
| Etagen-Switch | `sw-<etage>` | `sw-og2`, `sw-eg` |
| Access Point | `ap-<etage>-<nr>` | `ap-og1-01`, `ap-s2-01` |
| Host/Server | `<funktion>-<nr>` | `web-01`, `db-primary` |

### 4.4 WLAN Access Points

Access Points benötigen das Feld `wifiDbm` für die Heatmap:

| dBm | Signalqualität | Heatmap-Radius |
|---|---|---|
| −30 bis −40 | Sehr stark | 44–48 Szeneneinheiten |
| −41 bis −55 | Gut | 30–43 Szeneneinheiten |
| −56 bis −70 | Mittel | 16–29 Szeneneinheiten |
| −71 bis −90 | Schwach | 8–15 Szeneneinheiten |

Die Farbe der Heatmap folgt dem Node-Status (grün/gelb/rot/grau).

---

## 5 WebSocket-Integration

### 5.1 Verbindung herstellen

In `app.js`, letzte Zeile auskommentieren:

```js
app.connectWS('ws://nagios-server:8008/ws/map/my-map');
```

### 5.2 Nachrichtenformat

```json
{
  "type": "status_update",
  "hosts": [
    { "id": "web-01",    "status": "critical" },
    { "id": "sw-og1",   "status": "ok"        },
    { "id": "nas-01",   "status": "warning"   }
  ]
}
```

**Gültige Status-Werte:** `ok` · `warning` · `critical` · `down` · `unknown`

### 5.3 Automatische Effekte bei Statuswechsel

| Transition | Effekt |
|---|---|
| beliebig → `critical` / `down` | 3 expandierende Pulsringe (rot) |
| `critical` / `down` → besser | Pulsringe enden automatisch |
| `accesspoint` status ändert sich | Heatmap-Textur wird neu generiert |

### 5.4 NagVis-Backend (Beispiel)

Ein minimales Python-Backend (FastAPI + WebSocket) für NagVis-Integration:

```python
# Livestatus → WebSocket-Brücke (Pseudocode)
import json, asyncio
from fastapi import WebSocket

async def push_status(ws: WebSocket, map_id: str):
    while True:
        hosts = query_livestatus()           # eigene Implementierung
        await ws.send_text(json.dumps({
            "type": "status_update",
            "hosts": [{"id": h.name, "status": h.state} for h in hosts]
        }))
        await asyncio.sleep(30)
```

---

## 6 Benutzeroberfläche

### 6.1 Etagennavigation

Der **Etagen-Panel** (rechts) listet alle Etagen des aktiven Modells.
Klick auf eine Etage → Kamera fliegt auf diese Etage, andere Etagen werden ausgeblendet.
**„Alle"** zeigt alle Etagen gleichzeitig (Übersicht).

**Etage doppelklicken** → 2D-Grundriss-Modus (Draufsicht).
Im 2D-Modus kann ein Grundriss-Bild (PNG/JPG) geladen und Deckkraft angepasst werden.

### 6.2 Node Inspector

Klick auf einen Node → Inspector-Panel erscheint (rechts unten).
Zeigt: Status, Typ, Etage, GPS-Koordinaten (falls vorhanden), WLAN-dBm (Access Points).
Button „Focus Camera" → Kamera auf den Node zentrieren.

### 6.3 Problemliste

Button **⚑ N** (oben rechts) öffnet die Problemliste.
Zeigt alle Nodes mit Status ≠ OK, sortiert nach Schwere.
Klick auf einen Eintrag → Kamera auf betroffenen Node fokussieren.

### 6.4 Modell-Dialog

Button mit dem Modellnamen (oben rechts) → öffnet Modell-Auswahl.
Ermöglicht Wechsel zwischen vordefinierten und gespeicherten Modellen.
Neue Modelle können direkt im Dialog angelegt werden (werden in localStorage gespeichert).

---

## 7 Features & Tastenkürzel

| Aktion | Methode |
|---|---|
| **Drehen** | Linke Maustaste gedrückt + ziehen |
| **Schwenken** | Rechte Maustaste gedrückt + ziehen |
| **Zoom** | Mausrad · oder ± Buttons |
| **Node auswählen** | Links auf Node klicken |
| **Inspector schließen** | `Escape` |
| **Suche öffnen** | `Ctrl+F` oder in Suchfeld klicken |
| **Suche leeren** | `Escape` im Suchfeld |
| **Cockpit-Modus** | Button **⚡** oder `Escape` zum Beenden |
| **2D-Modus** | Etage doppelklicken |
| **3D zurück** | Button **← 3D** oder `Escape` |
| **Auto-Orbit** | Toggle-Button „Auto-Orbit" |
| **Flow-Speed** | Schieberegler (Animationsgeschwindigkeit der Datenfunken) |

### Cockpit-Modus

Blendet alle OK-Nodes aus, schaltet auf roten Hintergrund mit Nebel.
Nur problematische Nodes (warning/critical/down/unknown) bleiben sichtbar.
Ideal für NOC-Monitoring-Ansichten.

### Suche & Highlight

Echtzeit-Suche über Label, ID, Typ und Etage.
Nicht-passende Nodes werden ausgegraut (Suchring in Blau pulsiert um Treffer).
Bei genau einem Treffer springt die Kamera automatisch auf diesen Node.

---

## 8 Deployment

### 8.1 Lokaler Entwicklungsserver

```bash
# Python (empfohlen, unterstützt ES-Module-CORS korrekt)
cd v3/
python -m http.server 8080

# Node.js
npx serve .
```

Aufruf: `http://localhost:8080/`

### 8.2 Nginx (Produktion)

```nginx
server {
    listen 80;
    server_name nagvis3d.intern;

    root /var/www/nagvis3d/v3;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache";
    }

    # WebSocket-Proxy (falls Backend auf gleichem Server)
    location /ws/ {
        proxy_pass http://localhost:8008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 8.3 CDN-Abhängigkeit

Three.js wird von `cdn.jsdelivr.net` geladen. Für Offline-Betrieb:

1. `npm install three@0.165.0`
2. In `index.html` importmap anpassen:
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

1. In `_buildNode(node)` einen neuen `case` für `node.type` hinzufügen
2. Geometrie und Material definieren
3. Optional: `_genWifiTexture` analog für andere Overlay-Effekte erweitern

### 9.2 Neue Statusfarbe hinzufügen

In der `SC`-Konstante (oben in `app.js`):

```js
const SC = {
  maintenance: { hex: 0x3498db, emissive: 0x1a6090, badge:'s-maint',
                 cls:'maint', label:'MAINTENANCE', sev: 1.5 },
  // ...
};
```

### 9.3 Tunnel-Schwellenwert anpassen

```js
const TUNNEL_MIN_DIST = 30;  // Szeneneinheiten – erhöhen für weniger Tunnel
```

### 9.4 Eigene Datensätze

Neuen Datensatz als `const MEIN_DATA = { nodes: [], links: [] }` in `app.js` anlegen
und in `MODEL_PRESETS` mit `data: MEIN_DATA` referenzieren.

### 9.5 Heatmap-Radius-Formel anpassen

```js
_dbmToRadius(dbm) {
  const clamped = Math.max(-90, Math.min(-30, dbm ?? -65));
  return 8 + (clamped - (-90)) / 60 * 40;  // 8…48 Szeneneinheiten
  //         ↑ Minimum       ↑ Bereich
}
```

---

## 10 Fehlerbehebung

| Problem | Ursache | Lösung |
|---|---|---|
| Node erscheint nicht | `floor` stimmt nicht mit Modell-Etagenlabel überein | Exakte Schreibweise prüfen (inkl. Leerzeichen, Umlaute) |
| Node auf falscher Höhe | `y`-Wert passt nicht zur Etage | Y-Wert laut Etagen-Tabelle (Abschnitt 3.1) korrigieren |
| Kein Tunnel-Glow | Distanz < `TUNNEL_MIN_DIST` oder kein `tunnel:true` | `tunnel:true` explizit setzen oder `TUNNEL_MIN_DIST` senken |
| Heatmap fehlt | `type` nicht `'accesspoint'` oder `wifiDbm` fehlt | Beide Felder prüfen |
| WebSocket verbindet nicht | URL falsch oder Backend nicht erreichbar | Browser-Konsole auf Fehler prüfen; CORS/WSS beachten |
| Nodes verschwinden bei Etagenwechsel | `floor`-Label weicht ab | `floor` exakt wie in `floors[].label` schreiben |
| Geo-Projektion falsch | Referenzkoordinate (`cfg.lat/lon`) zu weit weg | Referenzpunkt näher an Datenzentrum wählen |
| Labels bleiben nach Modellwechsel | CSS2D-DOM-Leak | `disposeCSS2D()` wird beim Cleanup aufgerufen – Three.js Version prüfen |

---

*Letzte Änderung: 2026-03-31 · NagVis 3D v3 POC*
