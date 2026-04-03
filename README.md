# klett-to-pdf-md

Extrahiert offline heruntergeladene Schulbücher aus der **Klett Lernen** Desktop-App (macOS + Windows) als PDF + Text/Markdown.

## Was wird extrahiert?

- **PDF** — das eingebettete ePaper-PDF (mit Text-Layer, durchsuchbar)
- **Volltext** — Seitentext aus dem Suchindex als `.txt` (oder `.md` mit `--markdown`)
- **Zusatzmaterial** — Kopiervorlagen (.docx), Lösungen, Tafelbilder (.xml), jeweils auch als Markdown

## Voraussetzungen

- **Node.js** >= 18 (siehe [Installation](#node-installieren))
- **Klett Lernen App** installiert, mindestens ein Buch **offline heruntergeladen**
- Keine `npm install` nötig — das Script hat keine Abhängigkeiten

## Node installieren

### macOS

```bash
# Option 1: Homebrew (empfohlen)
brew install node

# Option 2: Installer von https://nodejs.org herunterladen (LTS-Version)
```

### Windows

1. **https://nodejs.org** aufrufen
2. Die **LTS-Version** (grüner Button) herunterladen und installieren
3. Bei der Installation den Haken bei **"Add to PATH"** gesetzt lassen
4. Nach der Installation ein neues Terminal (CMD oder PowerShell) öffnen
5. Prüfen: `node --version` sollte `v18.x` oder höher anzeigen

Alternativ über **winget** (Windows 10/11):

```powershell
winget install OpenJS.NodeJS.LTS
```

## Verwendung

### macOS (Terminal)

```bash
# In den Projektordner wechseln
cd klett-to-pdf-md

# Alle Bücher extrahieren
node klett.js

# Markdown statt Text
node klett.js --markdown
```

### Windows (PowerShell oder CMD)

```powershell
# In den Projektordner wechseln
cd klett-to-pdf-md

# Alle Bücher extrahieren
node klett.js

# Markdown statt Text
node klett.js --markdown
```

Falls `node` nicht gefunden wird: Terminal schließen und neu öffnen (PATH wird erst nach Neustart der Shell geladen).

### Optionen

```
node klett.js                         # Alle Bücher, Volltext als .txt
node klett.js --markdown              # Volltext als .md statt .txt
node klett.js --book DUA-66SHLYDVUZ   # Einzelnes Buch (DUA-ID aus der Ausgabe)
node klett.js --output ./meinordner   # Ausgabeverzeichnis festlegen
node klett.js --no-materials          # Ohne Zusatzmaterialien
node klett.js --force                 # Vorhandene Dateien überschreiben
```

## Buch offline herunterladen

Bevor das Script funktioniert, muss das Buch in der Klett Lernen App offline verfügbar sein:

1. **Klett Lernen App** öffnen und einloggen
2. Buch auswählen
3. Auf das **Download-Symbol** (Wolke/Pfeil nach unten) klicken
4. Warten bis der Download abgeschlossen ist
5. Erst dann das Script ausführen

## Ausgabestruktur

```
books/
└── Buchtitel (DUA-XXXXXXXX)/
    ├── Buchtitel.pdf          # ePaper-PDF mit Text-Layer
    ├── Buchtitel.txt          # Volltext (Klartext, seitenweise)
    ├── Zusatzmaterial.md      # Index aller Materialien
    └── Zusatzmaterial/
        ├── kv/                # Kopiervorlagen (.docx + .md)
        ├── kv_extra/          # Lösungen (.docx + .md)
        └── tbi/               # Tafelbilder (.xml + .md)
```

Mit `--markdown` wird statt `Buchtitel.txt` eine `Buchtitel.md` erzeugt.

## Datenpfade

Das Script sucht die Klett-Daten automatisch am richtigen Ort:

| Plattform | Pfad |
|---|---|
| macOS | `~/Library/Containers/de.klett.dua.schueler/.../Klett/klett_lernen/` |
| Windows (Desktop) | `%LOCALAPPDATA%\Klett\klett_lernen\` |
| Windows (Store) | `%LOCALAPPDATA%\Packages\*klett*\LocalState\Klett\klett_lernen\` |

Falls das Script den Pfad nicht findet, zeigt es den erwarteten Pfad in der Fehlermeldung an.

## Wie funktioniert es?

Die Klett Lernen App speichert offline heruntergeladene Bücher unverschlüsselt:

| Datei | Inhalt |
|---|---|
| `content/media/ep-*/epaper.pdf` | Vollständiges Buch als PDF |
| `content/media/ep-*/content/search.xml` | Suchindex mit Volltext pro Seite |
| `content/media/kv/*.docx` | Kopiervorlagen (Word) |
| `content/media/kv_extra/*.docx` | Lösungen (Word) |
| `content/media/tbi/*.xml` | Tafelbilder (XML mit HTML-Inhalt) |

### DOCX-zu-Text-Konvertierung

Kopiervorlagen (.docx) werden automatisch nach Markdown konvertiert:

| Plattform | Methode |
|---|---|
| macOS | `textutil` (vorinstalliert, keine Zusatzinstallation) |
| Windows | PowerShell + Word COM-Objekt (Microsoft Word muss installiert sein) |

Ohne Word auf Windows werden die .docx-Dateien trotzdem kopiert, nur die Markdown-Konvertierung entfällt.
