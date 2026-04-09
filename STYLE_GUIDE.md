# Style Guide – NagVis 2 · NagVis 3D · UI-4-BI

Dieses Dokument legt verbindliche Konventionen für alle drei Projekte fest:

| Projekt | Verzeichnis | Stack |
|---|---|---|
| **NagVis 2** | `nagvis-kurz-vor-2/nagvis2/` | Python 3.11+ / FastAPI · Vanilla JS (Script-Tags) |
| **NagVis 3D** | `nagvis3d-up-side-down/` | Three.js · ES-Module · Vite |
| **UI-4-BI** | `ui-4-bi/` | Vanilla JS (ES-Module) · FastAPI |

Ziel: Die drei Projekte sollen langfristig in NagVis 2 integriert werden.  
Konsistente Stil- und Technikentscheidungen erleichtern diese Integration erheblich.

---

## 1. Code-Stilrichtlinien

### 1.1 Formatierung

#### JavaScript / TypeScript

| Regel | Wert |
|---|---|
| Einrückung | **2 Leerzeichen** (keine Tabs) |
| Max. Zeilenlänge | **120 Zeichen** |
| Anführungszeichen | **einfache** (`'text'`), außer bei Template-Literals |
| Semikolons | **keine** (ASI) |
| Trailing Comma | **ja** bei mehrzeiligen Objekt-/Array-Literals |
| Leerzeile am Dateiende | **ja** (eine) |

```js
// ✅ korrekt
const label = node.title || 'Unbekannt'
const cfg = {
  host: 'srv01',
  port: 8008,
}

// ❌ falsch
const label = node.title || "Unbekannt";
const cfg = {host: "srv01", port: 8008}
```

Abschnittstrennlinien (Kommentar-Banner) einheitlich mit `─` (U+2500):

```js
// ─────────────────────────────────────────────────────────────
//  ABSCHNITTSNAME
// ─────────────────────────────────────────────────────────────
```

#### Python (NagVis 2 / UI-4-BI Backend)

| Regel | Wert |
|---|---|
| Einrückung | **4 Leerzeichen** (PEP 8) |
| Max. Zeilenlänge | **100 Zeichen** |
| Anführungszeichen | **doppelte** (`"text"`) |
| Import-Reihenfolge | stdlib → third-party → local (je Gruppe alphabetisch) |
| Typ-Annotationen | **verpflichtend** bei allen öffentlichen Funktionen |

```python
# ✅ korrekt
async def get_map(map_id: str, current: dict = Depends(require_auth)) -> MapDetail:
    ...

# ❌ falsch
async def get_map(map_id, current=Depends(require_auth)):
    ...
```

#### CSS

| Regel | Wert |
|---|---|
| Einrückung | **2 Leerzeichen** |
| Eigenschafts-Reihenfolge | position → display/flex → box-model → typography → visual |
| Design-Tokens | **immer** CSS-Variablen (`var(--acc)`) statt Hex-Werte |
| Vendor-Prefixes | nur wenn zwingend erforderlich |

```css
/* ✅ korrekt */
.sidebar-search-input {
  position: relative;
  display: flex;
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--bg-surf);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
}
```

---

### 1.2 Benennungskonventionen

#### JavaScript

| Typ | Konvention | Beispiel |
|---|---|---|
| Variablen / Parameter | `camelCase` | `activeMapId`, `nodeCount` |
| Konstanten (Modul-Level) | `SCREAMING_SNAKE_CASE` | `LS_KEY`, `MAX_ZOOM` |
| Funktionen | `camelCase` | `filterSidebarMaps()` |
| Klassen | `PascalCase` | `NV2Map3D`, `ModelDialog` |
| Private Hilfsfunktionen | `_camelCase` (führender Unterstrich) | `_draw()`, `_getObjs()` |
| Globale Window-Exports (NagVis 2) | `NV2_NAMESPACE` (Großbuchstaben) | `NV2_MINIMAP`, `NV2_ZOOM` |
| DOM-IDs | `kebab-case` | `#sidebar-search`, `#btn-minimap` |
| CSS-Klassen | `kebab-case` | `.sidebar-search-wrap` |
| Event-Handler (HTML-Inline) | `camelCase`-Funktion | `onclick="filterSidebarMaps(this.value)"` |

#### localStorage-Schlüssel

Jedes Projekt hat einen eigenen Namespace-Präfix — **niemals** über Projekte hinweg mischen:

| Projekt | Präfix | Beispiel |
|---|---|---|
| NagVis 2 | `nv2-` / `nv2_` | `nv2-user-settings`, `nv2_sidebar` |
| NagVis 3D | `nv3d_` | `nv3d_models_v1`, `nv3d_theme` |
| UI-4-BI | `bi_` | `bi_user`, `bi_token`, `bi_snap_grid` |

Trennzeichen: **Underscore** (`_`) bevorzugt — Bindestrich (`-`) nur bei bereits bestehenden Legacy-Keys.

#### Python

| Typ | Konvention | Beispiel |
|---|---|---|
| Variablen / Funktionen | `snake_case` | `map_id`, `get_all_hosts()` |
| Klassen | `PascalCase` | `MapDetail`, `UserStore` |
| Konstanten | `SCREAMING_SNAKE_CASE` | `BASE_DIR`, `SAVE_FILE` |
| Private Attribute | `_snake_case` | `_cache`, `_ring_buffer` |
| Pydantic-Modelle | `PascalCase` + Suffix `Model`/`Request`/`Response` | `ObjectCreate`, `MapDetail` |
| FastAPI-Router-Funktionen | `snake_case`, Verb zuerst | `create_map()`, `delete_object()` |

#### CSS-Variablen (Design-Tokens)

| Kategorie | Präfix | Beispiele |
|---|---|---|
| Hintergrund | `--bg-` | `--bg-surf`, `--bg-panel`, `--bg-hover` |
| Text | `--text-` | `--text`, `--text-dim`, `--text-dim-surf` |
| Akzentfarben | `--acc`, `--accent` | `--acc`, `--accent: var(--acc)` |
| Status | `--ok`, `--warn`, `--crit`, `--down` | `--ok: #4caf50` |
| Border / Misc | `--border`, `--radius` | `--border: #3a3a3a` |

Das Alias-Token `--accent: var(--acc)` muss in **beiden** Theme-Blöcken (`:root` Dark + `[data-theme="light"]`) vorhanden sein, damit spätere Integration von NagVis 3D / UI-4-BI reibungslos funktioniert.

---

## 2. Architektur & Designmuster

### 2.1 Modulstruktur

**NagVis 2 (Script-Tag-Modus)**

- Jedes Modul ist eine IIFE oder eine Sammlung von `function`-Deklarationen
- Exporte **ausschließlich** über den konsolidierten Block am Dateiende:
  ```js
  // ── Exports ────────────────────────────────────────────────
  window.openNodePropsDialog  = openNodePropsDialog
  window.applyStatuses        = applyStatuses
  ```
- Kein `window.*`-Export direkt nach einer Funktionsdefinition (verhindert Doppelexporte)
- Globale Namespace-Objekte für Features: `window.NV2_MINIMAP`, `window.NV2_ZOOM`

**NagVis 3D / UI-4-BI (ES-Modul-Modus)**

- Jede Datei hat explizite `export` / `import`-Statements
- Kein `window.*`-Export — öffentliche API über Named Exports
- Verzeichnisstruktur:
  ```
  js/
    core/        # State, Konstanten, Authentifizierung
    renderer/    # Rendering-Logik
    interactions/ # Maus, Tastatur, Drag
    ui/          # Dialoge, Inspector, Toolbar
    utils/       # Reine Hilfsfunktionen (keine Side-Effects)
  ```

### 2.2 Designmuster

| Muster | Verwendung | Projekte |
|---|---|---|
| **Module Pattern** (IIFE) | Kapselung ohne Bundler | NagVis 2 |
| **ES-Module** | Explizite Abhängigkeiten | NagVis 3D, UI-4-BI |
| **Observer / Event** | `dispatchEvent`, `postMessage` | alle drei |
| **Manager-Singleton** | `ModelManager`, `UserStore`, `NV2_MINIMAP` | alle drei |
| **RAF-Loop** | Rendering-Updates (~10–60 fps) | NagVis 3D, NagVis 2 Minimap |
| **Repository** | `StorageManager`, `MapStore` | NagVis 2 Backend |
| **Dependency Injection** | FastAPI `Depends()` | NagVis 2, UI-4-BI Backend |

### 2.3 Integration (iframe + postMessage)

Für die spätere Einbettung von NagVis 3D und UI-4-BI in NagVis 2 gilt:

- Einbettung ausschließlich via **`<iframe>`** (keine direkte DOM-Manipulation über Projektgrenzen)
- Kommunikation via **`window.postMessage`** mit typisiertem Nachrichtenformat:
  ```js
  // Sender (iframe-Inhalt)
  parent.postMessage({ type: 'NV3D_READY', payload: { version: '1.0' } }, '*')

  // Empfänger (NagVis 2)
  window.addEventListener('message', e => {
    if (e.data?.type === 'NV3D_READY') { /* ... */ }
  })
  ```
- CSS-Variablen können via `postMessage` an iframes weitergegeben werden (Theme-Sync)

### 2.4 State-Management

- **Kein** globaler Redux-/Vuex-ähnlicher Store
- Projektspezifischer State in einem zentralen Objekt (`state`, `graphState`) — alle Module teilen **dieselbe Referenz**
- Mutationen nur über dedizierte Funktionen, niemals direkte Property-Zuweisung aus fremden Modulen:
  ```js
  // ✅ korrekt
  NV2_ZOOM.setState({ zoom: 1.5, panX: 0, panY: 0 })

  // ❌ falsch
  window._zoomState.zoom = 1.5
  ```

---

## 3. Dokumentationsstandards

### 3.1 Code-Kommentare

**Wann kommentieren:**
- Komplexe Algorithmen (Sugiyama-Layout, Bézier-Kollisionserkennung, RAF-Throttling)
- Nicht-offensichtliche Entscheidungen (`// migration from old key nv3d-theme`)
- Öffentliche API-Funktionen (kurze JSDoc / Docstring)
- Bekannte Einschränkungen oder TODOs mit Issue-Referenz

**Wann nicht kommentieren:**
- Selbsterklärenden Code (`const count = nodes.length // Anzahl Nodes` → unnötig)
- Auskommentierten Code — stattdessen löschen (Git-History bewahrt ihn)

**JavaScript (JSDoc für öffentliche Funktionen):**
```js
/**
 * Filtert die Sidebar-Mapliste nach dem übergebenen Suchbegriff.
 * Bei leerem Query wird die normale Favoriten-Ansicht wiederhergestellt.
 * @param {string} query - Suchbegriff (Titel oder Map-ID)
 */
function filterSidebarMaps(query) { ... }
```

**Python (Docstrings für öffentliche Funktionen):**
```python
async def clone_map(source_id: str, new_title: str) -> MapDetail:
    """
    Erstellt eine Deep-Copy der Map.
    Das Hintergrundbild wird mitkopiert; parent_map wird auf None gesetzt.
    Raises StorageError wenn source_id nicht existiert.
    """
```

### 3.2 Projektdokumentation

| Datei | Inhalt | Pflicht |
|---|---|---|
| `README.md` | Schnellstart, Features, Demo-Link, Badges | ✅ |
| `changelog.md` | Versionshistorie (Markdown) | ✅ |
| `changelog.txt` | Versionshistorie (Plain-Text, UTF-16) | NagVis 2 |
| `docs/admin-guide.md` | Installations- und Konfigurationsanleitung | NagVis 2 |
| `docs/api-reference.md` | REST-API-Dokumentation | NagVis 2 |
| `docs/todo-liste.md` | Offene Features und Roadmap | alle drei |
| `STYLE_GUIDE.md` | Dieses Dokument | ✅ |
| `CONTRIBUTING.md` | Beitragsrichtlinien | ✅ |

**Changelog-Format** (einheitlich für alle drei Projekte):

```
[YYYY-MM-DD]   Kategorie: Titel
               - Datei: Beschreibung der Änderung
               - Datei: Beschreibung der Änderung
────────────────────────────────────────────────────────────
```

Kategorien: `Feature` · `Bugfix` · `Refactor` · `Docs` · `Test` · `CI`

---

## 4. Test- und Integrationsrichtlinien

### 4.1 Testabdeckung

| Projekt | Backend-Ziel | Frontend-Ziel | Tool |
|---|---|---|---|
| NagVis 2 | ≥ 70 % (pytest-cov) | — | pytest + pytest-asyncio |
| UI-4-BI | ≥ 70 % (pytest-cov) | ≥ 60 % | pytest + Vitest 1.6 |
| NagVis 3D | — | ≥ 60 % | Vitest 1.6 |

### 4.2 Teststruktur

**Python (pytest):**
```
backend/
  tests/
    conftest.py            # Fixtures: tmp_data, auth_client, anon_client
    test_api_maps.py       # HTTP-Endpunkte (CRUD)
    test_storage.py        # Storage-Layer (Unit)
    test_auth.py           # Auth-Manager, JWT, RBAC
    test_audit.py          # Audit-Log
```

- Fixtures verwenden `tmp_path` — kein Schreiben in `data/`
- Keine Mocks für Datenbank-/Storage-Layer (Integrationstests bevorzugt)
- Netzwerk-Clients (Checkmk, Zabbix, Icinga2, Livestatus) werden **gemockt**

**JavaScript (Vitest):**
```
tests/
  frontend/
    geometry.test.js       # Reine Berechnungsfunktionen
    cmk-converter.test.js  # Import/Export-Logik
    auth.test.js           # Token-Management
```

- Tests importieren nur Module aus `src/js/` — kein DOM-Setup erforderlich für reine Logik
- DOM-Tests via `jsdom` (in `vitest.config.js` als `environment: 'jsdom'`)
- Testdateinamen: `*.test.js` (Vitest-Standard)

### 4.3 Was getestet wird

**Muss getestet sein:**
- Alle öffentlichen REST-Endpunkte (happy path + Fehlerfall)
- Authentifizierung und Autorisierung (Rollen, Token-Ablauf)
- Daten-Transformationen (CMK-Import/Export, Perfdata-Parsing)
- Berechnungsfunktionen (Geometrie, Snap-Grid, Koordinaten)

**Muss nicht getestet sein:**
- UI-Rendering (manuelle Sichtprüfung ausreichend)
- WebSocket-Polling (Infrastruktur, kein Unit-Test sinnvoll)
- Externe API-Clients in Produktionsinfrastruktur

### 4.4 CI/CD (GitHub Actions)

Alle drei Projekte verwenden `.github/workflows/`:

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | push/PR auf `main`, `develop` | Backend-Tests (Python 3.11/3.12/3.13) + Frontend-Tests (Node 24) |
| `docker.yml` | nach grünem CI | Multi-Arch Build (`amd64` + `arm64`), Push zu Docker Hub |
| `release.yml` | `v*.*.*`-Tag | Tests → Build → GitHub Release mit ZIP + SHA256 |
| `docs.yml` | Änderungen in `docs/` | MkDocs → GitHub Pages |

**Pflichtregeln:**
- Release-Workflow schlägt fehl wenn Tests rot sind
- Coverage-Artefakt wird bei jedem CI-Lauf hochgeladen
- `--cov-fail-under=70` in pytest-Konfiguration

---

## 5. Versionskontrolle

### 5.1 Branch-Strategie

```
main          ← produktionsreif, nur via PR
develop       ← Integrations-Branch
feature/xyz   ← neue Features (von develop abzweigen)
fix/xyz       ← Bugfixes (von main oder develop)
docs/xyz      ← reine Dokumentationsänderungen
```

- **Kein** direktes Pushen auf `main`
- Feature-Branches werden via Pull Request in `develop` gemergt
- `develop` → `main` nur wenn CI grün und mindestens eine Review-Runde

### 5.2 Commit-Nachrichten

Format: `<Typ>(<Scope>): <Kurzbeschreibung>` (angelehnt an Conventional Commits)

| Typ | Verwendung |
|---|---|
| `feat` | Neues Feature |
| `fix` | Bugfix |
| `refactor` | Code-Umstrukturierung ohne Funktionsänderung |
| `style` | Formatierung, Leerzeichen (keine Logikänderung) |
| `test` | Tests hinzufügen oder anpassen |
| `docs` | Nur Dokumentation |
| `ci` | CI/CD-Konfiguration |
| `chore` | Sonstiges (Dependencies, Tooling) |

**Beispiele:**
```
feat(minimap): NV2_MINIMAP Canvas-Panel mit Click-to-Pan
fix(nodes): doppelte window.* Exporte in nodes.js entfernt
refactor(nv3d): localStorage-Keys zu nv3d_* Namespace migriert
docs(changelog): [2026-04-09] Einträge für alle drei Projekte
test(api): TestCloneMapApi – 6 neue Tests für /maps/{id}/clone
```

**Regeln:**
- Imperativ, Gegenwartsform: „füge hinzu" statt „fügte hinzu"
- Kein Punkt am Ende der Kurzzeile
- Body (optional): erklärt das **Warum**, nicht das Was (das steht im Diff)
- Bei Breaking Changes: `BREAKING CHANGE:` im Commit-Body

### 5.3 Tags und Releases

- Versionsnummern nach **Semantic Versioning**: `vMAJOR.MINOR.PATCH`
- `MAJOR` — inkompatible API-Änderungen
- `MINOR` — neues Feature, rückwärtskompatibel
- `PATCH` — Bugfix
- Release-Tags werden auf `main` gesetzt, lösen den `release.yml`-Workflow aus

---

## 6. Werkzeuge und Technologien

### 6.1 Backend (NagVis 2 / UI-4-BI)

| Tool | Version | Zweck |
|---|---|---|
| **Python** | 3.11+ | Laufzeit |
| **FastAPI** | ≥ 0.110 | REST-Framework |
| **Uvicorn** | ≥ 0.29 | ASGI-Server |
| **Pydantic** | ≥ 2.0 | Datenvalidierung, Settings |
| **PyJWT** | ≥ 2.8 | JWT-Authentifizierung |
| **ldap3** | ≥ 2.9 | LDAP-Authentifizierung |
| **pytest** | ≥ 8.0 | Test-Framework |
| **pytest-asyncio** | ≥ 0.23 | Async-Test-Support |
| **pytest-cov** | aktuell | Coverage-Reporting |

Python-Abhängigkeiten werden in `requirements.txt` (Produktion) und `requirements-dev.txt` (Entwicklung) getrennt verwaltet.

### 6.2 Frontend

| Tool | Version | Projekt | Zweck |
|---|---|---|---|
| **Vanilla JS** | ES2020+ | alle drei | Keine Framework-Dependency |
| **Three.js** | r160+ | NagVis 3D | 3D-Rendering |
| **Leaflet** | 1.9.4 | NagVis 2 | OSM-Karte |
| **Leaflet.markercluster** | 1.5.3 | NagVis 2 | Cluster-Bubbles |
| **Vitest** | 1.6 | NagVis 3D, UI-4-BI | Frontend-Tests |
| **jsdom** | 24 | NagVis 3D, UI-4-BI | DOM-Simulation in Tests |
| **MkDocs** | aktuell | NagVis 2 | Docs-Generator |

**Keine** React, Vue, Angular oder ähnliche UI-Frameworks — bewusste Entscheidung für minimale Bundle-Größe und maximale Kontrolle.

### 6.3 DevOps / Infrastruktur

| Tool | Zweck |
|---|---|
| **Docker** + **docker-compose** | Lokale Entwicklung, Produktions-Container |
| **nginx** | Reverse-Proxy, Static-File-Serving, TLS |
| **GitHub Actions** | CI/CD-Pipelines |
| **Docker Hub** | Container-Registry |
| **GitHub Pages** (MkDocs) | Dokumentations-Hosting |
| **Render** | Live-Demo-Hosting |

### 6.4 Linting & Formatting

Aktuell kein automatisierter Linter konfiguriert — manuelle Einhaltung der Konventionen.  
**Empfehlung für zukünftige Einrichtung:**

| Tool | Sprache | Konfigurationsdatei |
|---|---|---|
| `ruff` | Python (Linting + Format) | `pyproject.toml [tool.ruff]` |
| `ESLint` | JavaScript | `.eslintrc.json` |
| `Prettier` | JS + CSS | `.prettierrc` |

Bis zur Einrichtung gilt: **Code so formatieren wie der umgebende Code** (konsistenter Stil wichtiger als perfekte Einhaltung dieser Regeln).

---

## 7. Projektübergreifende Konsistenzregeln

Diese Regeln gelten explizit für alle drei Projekte, um die spätere Integration zu erleichtern:

1. **localStorage-Namespaces** niemals vermischen (`nv2_*`, `nv3d_*`, `bi_*`)
2. **CSS-Variable `--accent`** muss in jedem Projekt als Alias auf den primären Akzent-Token zeigen
3. **Theme-Klassen**: Dark = Standard (kein Attribut), Light = `[data-theme="light"]` auf `<body>`
4. **Status-Farbwerte** einheitlich:
   - OK: `#4caf50`
   - WARNING: `#ffa726`
   - CRITICAL / DOWN: `#e53935`
   - UNKNOWN: `#9c27b0`
   - PENDING / UNREACH: `#757575`
5. **Dead-Code** umgehend entfernen oder mit Kommentar-Banner markieren — kein auskommentierter Code in Commits
6. **Magic Strings** für wiederverwendete Konstanten (localStorage-Keys, API-Pfade, Status-Strings) immer in benannte Konstanten extrahieren:
   ```js
   // ✅
   const LS_KEY = 'nv3d_models_v1'
   // ❌
   localStorage.getItem('nv3d_models_v1')
   ```
7. **Keine `alert()` / `confirm()` / `prompt()`** im Produktionscode — stattdessen `showToast()` bzw. modale Dialoge

---

*Dieses Dokument gilt für alle Commits ab 2026-04-09.  
Änderungen am Style Guide werden via PR in `main` eingepflegt.*
