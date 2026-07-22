import { createReadStream } from "fs";
import { createInterface } from "readline";
import { pool, db } from "../server/db";
import { natura2000Species, type InsertNatura2000Species } from "@shared/schema";

const CSV_PATH = "exports/Natura2000_especes_designatrices_end2024.csv";
const COUNTRY = "FR";
const BATCH = 1000;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ";") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  let header: string[] | null = null;
  const idx: Record<string, number> = {};
  let batch: InsertNatura2000Species[] = [];
  let inserted = 0;
  let read = 0;

  // Rechargement atomique : purge + insertions dans une seule transaction,
  // pour éviter de laisser la table vide/partielle en cas d'interruption.
  // Le flux CSV est créé À L'INTÉRIEUR de la transaction, juste avant la
  // boucle de consommation, sinon readline émet (et perd) des lignes pendant
  // l'attente du BEGIN/DELETE.
  await db.transaction(async (tx) => {
    console.log("Vidage de la table natura2000_species…");
    await tx.delete(natura2000Species);

    const flush = async () => {
      if (batch.length === 0) return;
      await tx.insert(natura2000Species).values(batch);
      inserted += batch.length;
      batch = [];
    };

    const rl = createInterface({
      input: createReadStream(CSV_PATH, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const raw of rl) {
      const line = raw.replace(/^\uFEFF/, "");
      if (!line) continue;
      const cols = parseCsvLine(line);
      if (!header) {
        header = cols;
        header.forEach((h, i) => (idx[h.trim()] = i));
        continue;
      }
      read++;
      const country = (cols[idx["pays"]] ?? "").trim();
      if (country !== COUNTRY) continue;
      const siteCode = (cols[idx["code_site"]] ?? "").trim();
      const scientificName = (cols[idx["nom_scientifique"]] ?? "").trim();
      if (!siteCode || !scientificName) continue;
      batch.push({
        siteCode,
        siteName: (cols[idx["nom_site"]] ?? "").trim(),
        country,
        scientificName,
        speciesGroup: (cols[idx["groupe"]] ?? "").trim(),
        directive: (cols[idx["directive"]] ?? "").trim(),
        annexes: (cols[idx["annexes"]] ?? "").trim(),
        populationType: (cols[idx["type_population"]] ?? "").trim(),
        evalConservation: (cols[idx["eval_conservation"]] ?? "").trim(),
        evalGlobal: (cols[idx["eval_globale"]] ?? "").trim(),
      });
      if (batch.length >= BATCH) await flush();
    }
    await flush();
  });

  console.log(`Lignes lues: ${read}, insérées (FR): ${inserted}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
