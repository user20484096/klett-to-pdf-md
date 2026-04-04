# Klett — Bücher als PDF und Markdown exportieren

Extrahiert offline heruntergeladene Schulbücher aus der Klett Lernen Desktop-App und erzeugt PDFs, Klartext-/Markdown-Dateien und Zusatzmaterialien (Kopiervorlagen, Tafelbilder).
Kein OCR — die Buchtexte werden direkt aus dem Klett-Suchindex übernommen. Keine Zugangsdaten nötig, es werden nur die lokal heruntergeladenen Dateien gelesen.
Die Markdown-Ausgabe eignet sich besonders gut zur Weiterverarbeitung durch KI-Modelle.

## Voraussetzungen

- Klett Lernen Desktop-App (`https://www.klett.de/inhalt/klett-lernen/158307`) mit mindestens einem offline heruntergeladenen Buch

## Download (empfohlen)

Unter [Releases](../../releases) stehen fertige Executables zum Download — keine Installation von Python oder Node.js nötig:

- **macOS**: `klett-macos.zip` — entpacken, dann im Terminal `./klett` ausführen
- **Windows**: `klett.exe` — direkt ausführen oder ins Terminal ziehen

### macOS: Gatekeeper-Warnung

macOS blockiert unsignierte Programme. Beim ersten Start:

1. Doppelklick auf `klett` → "kann nicht geöffnet werden" Meldung
2. **Systemeinstellungen → Datenschutz & Sicherheit** → nach unten scrollen
3. Bei "klett wurde blockiert" auf **Trotzdem öffnen** klicken

Alternativ im Terminal: `xattr -cr klett && ./klett`

### Windows: SmartScreen-Warnung

Beim ersten Start erscheint "Der Computer wurde durch Windows geschützt":

1. Auf **Weitere Informationen** klicken
2. **Trotzdem ausführen** klicken

## Alternative: Python oder Node.js

### uv (Python)

```bash
# uv installieren (macOS / Linux)
curl -LsSf https://astral.sh/uv/install.sh | sh

# uv installieren (Windows)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Ausführen — uv installiert Python automatisch (keine Dependencies nötig)
uv run klett.py
```

### Node.js

```bash
npm install && node klett.js
```

## Optionen

| Flag | Beschreibung |
|------|-------------|
| `--output <dir>` | Ausgabeverzeichnis (Standard: `./books`) |
| `--book <DUA-ID>` | Nur ein bestimmtes Buch (z.B. `--book DUA-66SHLYDVUZ`) |
| `--no-materials` | Ohne Zusatzmaterialien |
| `--markdown` | Volltext als .md statt .txt |
| `--force` | Vorhandene Bücher überschreiben |

## Ausgabe

```text
books/
  Buchtitel (DUA-XXXXXXXX)/
    Buchtitel.pdf          — ePaper-PDF mit Text-Layer
    Buchtitel.txt          — Klartext aller Seiten
    Zusatzmaterial.md      — Übersicht Zusatzmaterialien
    Zusatzmaterial/
      kv/                  — Kopiervorlagen (.docx + .md)
      kv_extra/            — Lösungen (.docx + .md)
      tbi/                 — Tafelbilder (.xml + .md)
```

## Wie funktioniert es?

Die Klett Lernen App speichert offline heruntergeladene Bücher **unverschlüsselt**:

1. **ePaper-PDF** — Vollständiges Buch als PDF direkt im App-Container
2. **Suchindex** — `search.xml` mit Volltext pro Seite
3. **Materialien** — Kopiervorlagen (.docx), Lösungen, Tafelbilder (.xml)
4. **DOCX-Konvertierung** — automatisch per `textutil` (macOS) oder Word COM (Windows)

## Plattform-Unterstützung

| Plattform | Klett-Daten |
|---|---|
| macOS | `~/Library/Containers/de.klett.dua.schueler/.../Klett/klett_lernen/` |
| Windows (Desktop) | `%LOCALAPPDATA%\Klett\klett_lernen\` |
| Windows (Store) | `%LOCALAPPDATA%\Packages\*klett*\LocalState\Klett\klett_lernen\` |
