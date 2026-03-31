# NagVis3D – Up Side Down

Ein interaktives **3D-Visualisierungsprojekt** für NagVis.  
Die klassische 2D-Welt von NagVis wird hier in eine echte dreidimensionale Umgebung gebracht – **"Up Side Down"**.

Besonders geeignet für Visualisierungen **über Tage** (Gebäude, Rechenzentren, Gelände) und **unter Tage** (Tunnel, Stollen, Bergbau, Infrastruktur).

[![Changelog](https://img.shields.io/badge/Changelog-ansehen-blue)](src/changelog.txt)
[![Live Demo](https://img.shields.io/badge/Live_Demo-ansehen-brightgreen)](https://threed-maps-18xj.onrender.com/#dc1)


## ✨ Features

- Interaktive 3D-Umgebung im Browser
- Laden von 3D-Modellen über `models.json`
- Saubere Trennung von Code, Styles und Daten
- Freie Kamerasteuerung und Navigation

## 🚀 Schnellstart

```bash
git clone https://github.com/bh2005/nagvis3d-up-side-down.git
cd nagvis3d-up-side-down

# Lokalen Server starten
python -m http.server 8000
# oder
npx http-server -p 8000
```

Danach im Browser öffnen: [http://localhost:8000](http://localhost:8000)

## Geplante NagVis-Integration

In den nächsten Schritten soll eine echte Anbindung an NagVis erfolgen:
- Import von NagVis-Maps und -Objekten
- Live-Status-Übertragung (OK, WARN, CRIT)
- Automatische Platzierung von Hosts/Services in der 3D-Szene

## Roadmap

- Echte NagVis-Datenanbindung & Live-Status
- Unterstützung für große untertägige Szenarien (Tunnel-Systeme)
- Performance-Optimierungen für viele Objekte
- Benutzerdefinierte 3D-Modelle und Texturen
- Export-Funktionen zurück nach NagVis

## Bekannte Einschränkungen

- Derzeit noch reine Client-seitige Demo (keine echte NagVis-Anbindung)
- Performance bei sehr großen Szenen noch nicht optimiert
- Keine persistente Speicherung von Layouts

## Nächste Schritte

- Integration eines ersten NagVis-Connectors
- Erweiterung der Modelle für untertägige Umgebungen
- Bessere Dokumentation der Datenstruktur (`models.json`)

---

**Lizenz:** LGPL-2.1

Made with ❤️ als Experimentierprojekt

