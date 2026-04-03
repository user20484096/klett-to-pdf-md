#!/usr/bin/env node
/**
 * Extract books from Klett Lernen offline data.
 *
 * Reads the Klett Lernen app container, copies the embedded ePaper PDF,
 * extracts page text from search.xml, and exports supplementary materials
 * (Kopiervorlagen, Lösungen, Tafelbilder).
 *
 * Usage: node bin/klett [--output <dir>] [--book <dua-id>]
 *                       [--no-materials] [--force]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

// -- Path to Klett Lernen app data --
function findKlettBase() {
  const candidates = process.platform === "darwin"
    ? [
        join(homedir(), "Library", "Containers", "de.klett.dua.schueler",
          "Data", "Library", "Application Support", "Klett", "klett_lernen"),
      ]
    : process.platform === "win32"
      ? [
          // Desktop-Installer
          join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
            "Klett", "klett_lernen"),
          // Alternative: direkt im AppData
          join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
            "Klett", "klett_lernen"),
        ]
      : []; // Linux: unbekannt

  // Windows Store (UWP): suche in Packages nach Klett
  if (process.platform === "win32") {
    const packagesDir = join(
      process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Packages");
    if (existsSync(packagesDir)) {
      for (const entry of readdirSync(packagesDir)) {
        if (entry.toLowerCase().includes("klett")) {
          const localState = join(packagesDir, entry, "LocalState", "Klett", "klett_lernen");
          if (existsSync(localState)) candidates.unshift(localState);
          const localCache = join(packagesDir, entry, "LocalCache", "Klett", "klett_lernen");
          if (existsSync(localCache)) candidates.unshift(localCache);
        }
      }
    }
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]; // Return first candidate for error message
}

const KLETT_BASE = findKlettBase();

// -- Decode hex-encoded JSON files (.dat) --
function readHexJson(filePath) {
  const hex = readFileSync(filePath, "ascii").trim();
  const buf = Buffer.from(hex, "hex");
  return JSON.parse(buf.toString("utf8"));
}

// -- Find all user UUIDs (subdirectories with .dat files) --
function findUserDirs() {
  const dirs = [];
  for (const entry of readdirSync(KLETT_BASE, { withFileTypes: true })) {
    if (entry.name === "duas" || !entry.isDirectory()) continue;
    const full = join(KLETT_BASE, entry.name);
    const hasUserDat = readdirSync(full).some((f) => f.startsWith("userOfflineDua"));
    if (hasUserDat) dirs.push(full);
  }
  return dirs;
}

// -- Load product catalog from userOfflineDua_new.dat --
function loadProducts(userDir) {
  for (const name of ["userOfflineDua_new.dat", "userOfflineDua.dat"]) {
    const p = join(userDir, name);
    if (existsSync(p)) {
      try {
        return readHexJson(p);
      } catch { /* try next */ }
    }
  }
  return [];
}

// -- Find DUA content directories --
function findDuas() {
  const duasDir = join(KLETT_BASE, "duas");
  if (!existsSync(duasDir)) return [];

  const results = [];
  for (const entry of readdirSync(duasDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("DUA-")) continue;
    const duaPath = join(duasDir, entry.name);
    const produktXml = join(duaPath, "produkt.xml");
    if (!existsSync(produktXml)) continue;
    results.push({ id: entry.name, path: duaPath, produktXml });
  }
  return results;
}

// -- Parse produkt.xml for metadata --
function parseProduktXml(xmlPath) {
  const text = readFileSync(xmlPath, "utf8");
  const get = (tag) => {
    const m = text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return m ? m[1].trim() : "";
  };
  return {
    title: get("title"),
    subtitle: get("subtitle"),
    productNumber: get("productnumber"),
    publisher: get("publisher"),
    projectId: get("project_id"),
  };
}

// -- Find the ePaper directory inside a DUA (contains epaper.pdf + search.xml) --
function findEpaperDir(duaPath) {
  const mediaDir = join(duaPath, "content", "media");
  if (!existsSync(mediaDir)) return null;

  for (const entry of readdirSync(mediaDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(mediaDir, entry.name);
    if (existsSync(join(candidate, "epaper.pdf"))) return candidate;
  }
  return null;
}

// -- Extract page texts from search.xml --
function extractSearchText(searchXmlPath) {
  const raw = readFileSync(searchXmlPath, "utf8");
  const pages = [];
  const re = /<page id="(\d+)">\s*<!\[CDATA\[\s*([\s\S]*?)\s*\]\]>\s*<\/page>/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    pages.push({ id: parseInt(m[1]), text: m[2].trim() });
  }
  pages.sort((a, b) => a.id - b.id);
  return pages;
}

// -- List supplementary materials (skip the epaper directory) --
function listMaterials(duaPath, epaperDirName) {
  const mediaDir = join(duaPath, "content", "media");
  if (!existsSync(mediaDir)) return [];

  const materials = [];
  const skipDirs = new Set(["material_thumbs", epaperDirName]);

  function walk(dir, category) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), category);
      } else {
        materials.push({
          path: join(dir, entry.name),
          name: entry.name,
          category,
        });
      }
    }
  }

  for (const sub of readdirSync(mediaDir, { withFileTypes: true })) {
    if (!sub.isDirectory() || skipDirs.has(sub.name)) continue;
    walk(join(mediaDir, sub.name), sub.name);
  }

  return materials;
}

// -- Convert docx to text (macOS: textutil, Windows: PowerShell) --
function docxToText(docxPath) {
  try {
    if (process.platform === "darwin") {
      return execSync(`textutil -convert txt -stdout ${JSON.stringify(docxPath)}`, {
        encoding: "utf8",
        timeout: 10000,
      });
    }
    if (process.platform === "win32") {
      // Use PowerShell + Word COM object
      const ps = `
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $doc = $word.Documents.Open('${docxPath.replace(/'/g, "''")}')
        $doc.Content.Text
        $doc.Close($false)
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
      `.trim();
      return execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
        encoding: "utf8",
        timeout: 30000,
      });
    }
  } catch { /* conversion failed */ }
  return null;
}

// -- Extract text from TBI XML --
function parseTbiXml(xmlPath) {
  const text = readFileSync(xmlPath, "utf8");
  const cdataBlocks = [];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    cdataBlocks.push(m[1]);
  }
  if (cdataBlocks.length === 0) return null;

  return cdataBlocks
    .map((html) =>
      html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    )
    .filter(Boolean)
    .join("\n\n---\n\n");
}

// -- Main --
function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const markdown = args.includes("--markdown");
  const noMaterials = args.includes("--no-materials");
  const bookFilter = args.includes("--book")
    ? args[args.indexOf("--book") + 1]
    : null;
  const outputDir = args.includes("--output")
    ? resolve(args[args.indexOf("--output") + 1])
    : join(process.cwd(), "books");

  if (!existsSync(KLETT_BASE)) {
    console.error("Klett Lernen Daten nicht gefunden unter:", KLETT_BASE);
    console.error("Ist die Klett Lernen App installiert und ein Buch heruntergeladen?");
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });

  // Load product catalog for book titles
  const userDirs = findUserDirs();
  let productCatalog = [];
  for (const dir of userDirs) {
    productCatalog.push(...loadProducts(dir));
  }

  const productMap = {};
  for (const p of productCatalog) {
    productMap[p.id || p.dienst_id] = p;
  }

  // Find all DUAs
  const duas = findDuas();
  if (duas.length === 0) {
    console.error("Keine heruntergeladenen Bücher gefunden.");
    process.exit(1);
  }

  console.log("Gefundene Bücher:");
  for (const dua of duas) {
    const meta = parseProduktXml(dua.produktXml);
    const product = productMap[dua.id];
    const title = product?.titel || meta.subtitle || meta.title;
    console.log(`  ${title} (${dua.id})`);
  }

  for (const dua of duas) {
    if (bookFilter && dua.id !== bookFilter) continue;

    const meta = parseProduktXml(dua.produktXml);
    const product = productMap[dua.id];
    const title = product?.titel || meta.subtitle || meta.title || dua.id;

    console.log(`\n${title}:`);

    // Output directory for this book
    const baseName = title.replace(/[\/\\:*?"<>|]/g, "-");
    const dirName = `${baseName} (${dua.id})`;
    const bookDir = join(outputDir, dirName);

    if (!force && existsSync(join(bookDir, `${baseName}.${markdown ? "md" : "txt"}`))) {
      console.log("  Bereits vorhanden, überspringe. (--force zum Überschreiben)");
      continue;
    }

    mkdirSync(bookDir, { recursive: true });

    // Find ePaper directory
    const epaperDir = findEpaperDir(dua.path);

    // Copy ePaper PDF
    if (epaperDir) {
      const srcPdf = join(epaperDir, "epaper.pdf");
      const destPdf = join(bookDir, `${baseName}.pdf`);
      copyFileSync(srcPdf, destPdf);
      const sizeMB = (readFileSync(srcPdf).length / 1024 / 1024).toFixed(1);
      console.log(`  PDF kopiert: ${sizeMB} MB -> ${destPdf}`);

      // Extract text from search.xml
      const searchXml = join(epaperDir, "content", "search.xml");
      if (existsSync(searchXml)) {
        const pages = extractSearchText(searchXml);
        const nonEmpty = pages.filter((p) => p.text);
        console.log(`  Text extrahiert: ${nonEmpty.length}/${pages.length} Seiten`);

        const ext = markdown ? "md" : "txt";
        const outPath = join(bookDir, `${baseName}.${ext}`);
        let content = "";

        if (markdown) {
          content = `# ${title}\n\n`;
          for (const p of pages) {
            if (!p.text) continue;
            content += `## Seite ${p.id}\n\n${p.text}\n\n`;
          }
        } else {
          for (const p of pages) {
            content += `--- Seite ${p.id} ---\n${p.text}\n\n`;
          }
        }

        writeFileSync(outPath, content, "utf8");
        console.log(`  -> ${outPath}`);
      } else {
        console.log("  Kein search.xml gefunden — kein Volltext verfügbar.");
      }
    } else {
      console.log("  Kein ePaper-Verzeichnis gefunden.");
    }

    // Export materials
    if (!noMaterials) {
      const epaperDirName = epaperDir ? basename(epaperDir) : "";
      const materials = listMaterials(dua.path, epaperDirName);

      // Filter out thumbnails, videos, and other non-text assets
      const textMaterials = materials.filter((m) =>
        m.name.endsWith(".docx") || m.name.endsWith(".xml") || m.name.endsWith(".pdf")
      );

      if (textMaterials.length > 0) {
        console.log(`  Materialien exportieren (${textMaterials.length} Dateien)...`);
        const matDir = join(bookDir, "Zusatzmaterial");
        mkdirSync(matDir, { recursive: true });

        let copied = 0;
        let converted = 0;

        const byCategory = {};
        for (const m of textMaterials) {
          (byCategory[m.category] ??= []).push(m);
        }

        for (const [cat, items] of Object.entries(byCategory)) {
          const catDir = join(matDir, cat);
          mkdirSync(catDir, { recursive: true });

          for (const m of items) {
            const dest = join(catDir, m.name);
            copyFileSync(m.path, dest);
            copied++;

            if (m.name.endsWith(".docx")) {
              const text = docxToText(m.path);
              if (text) {
                writeFileSync(join(catDir, m.name.replace(/\.docx$/, ".md")), text, "utf8");
                converted++;
              }
            }

            if (m.name.endsWith(".xml")) {
              const text = parseTbiXml(m.path);
              if (text) {
                writeFileSync(join(catDir, m.name.replace(/\.xml$/, ".md")), text, "utf8");
                converted++;
              }
            }
          }
        }

        console.log(`  -> ${copied} Dateien kopiert, ${converted} nach Markdown konvertiert`);

        // Material index
        let md = `# Zusatzmaterial — ${title}\n\n`;
        md += `Insgesamt ${textMaterials.length} Dateien.\n\n`;
        for (const [cat, items] of Object.entries(byCategory).sort()) {
          md += `## ${cat} (${items.length})\n\n`;
          for (const m of items) md += `- ${m.name}\n`;
          md += "\n";
        }
        writeFileSync(join(bookDir, "Zusatzmaterial.md"), md, "utf8");
      } else {
        console.log("  Kein Zusatzmaterial gefunden.");
      }
    }
  }

  console.log("\nFertig.");
}

main();
