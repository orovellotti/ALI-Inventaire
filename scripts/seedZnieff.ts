import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import pgCopyStreams from "pg-copy-streams";
import { pool } from "../server/db";
import {
  parseSemicolonCsvLine,
  prepareZnieffSpeciesRow,
  validateZnieffHeaders,
} from "./znieffImportUtils";

const ARCHIVE_URL =
  "https://assets.patrinat.fr/files/donnees/znieff/ZNIEFF.zip";
const SOURCE_PAGE_URL =
  "https://www.patrinat.fr/fr/page-temporaire-de-telechargement-des-referentiels-de-donnees-lies-linpn-7353";
const DEFAULT_ARCHIVE = "/tmp/inventaire-flash-znieff/ZNIEFF.zip";
const CSV_ENTRY = "ZNIEFF/REF_ESPECE.csv";
const copyFrom = pgCopyStreams.from;

interface CliOptions {
  archivePath: string;
  refresh: boolean;
  sourceUpdated?: string;
  sourceVersion?: string;
}

function readOptions(argv: string[]): CliOptions {
  const valueFor = (prefix: string) =>
    argv.find((arg) => arg.startsWith(`${prefix}=`))?.slice(prefix.length + 1);
  return {
    archivePath: valueFor("--archive") || DEFAULT_ARCHIVE,
    refresh: argv.includes("--refresh"),
    sourceUpdated: valueFor("--source-updated"),
    sourceVersion: valueFor("--source-version"),
  };
}

async function getSourceMetadata(): Promise<{
  sourceUpdated: string;
  sourceVersion: string;
}> {
  try {
    const response = await fetch(ARCHIVE_URL, { method: "HEAD" });
    const modified = response.headers.get("last-modified");
    const etag = response.headers.get("etag")?.replace(/^"|"$/g, "") || "";
    const sourceUpdated = modified
      ? new Date(modified).toISOString().slice(0, 10)
      : "inconnue";
    return { sourceUpdated, sourceVersion: etag || sourceUpdated };
  } catch {
    return { sourceUpdated: "inconnue", sourceVersion: "" };
  }
}

async function ensureArchive(path: string, refresh: boolean): Promise<void> {
  if (!refresh) {
    try {
      const info = await stat(path);
      if (info.size > 0) {
        console.log(`Archive ZNIEFF réutilisée : ${path}`);
        return;
      }
    } catch {
      // Le téléchargement ci-dessous créera l'archive.
    }
  }
  await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  console.log(`Téléchargement de ${ARCHIVE_URL}…`);
  const response = await fetch(ARCHIVE_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Téléchargement ZNIEFF impossible (HTTP ${response.status})`);
  }
  const temporaryPath = `${path}.part`;
  await rm(temporaryPath, { force: true });
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      createWriteStream(temporaryPath),
    );
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  console.log(`Archive téléchargée : ${path}`);
}

function copyField(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

async function importSpecies(
  archivePath: string,
  sourceUpdated: string,
  sourceVersion: string,
): Promise<void> {
  const client = await pool.connect();
  let unzipError = "";
  let copyStream: ReturnType<typeof copyFrom> | null = null;
  try {
    // Le gros chargement s'effectue hors de la table active. Les SELECT de
    // l'API continuent donc pendant l'extraction et le COPY (>2 M de lignes).
    await client.query("DROP TABLE IF EXISTS znieff_species_staging");
    await client.query("DROP TABLE IF EXISTS znieff_species_previous");
    await client.query(`
      CREATE TABLE znieff_species_staging (
        zone_code varchar NOT NULL,
        cd_ref varchar NOT NULL DEFAULT '',
        cd_nom varchar NOT NULL DEFAULT '',
        scientific_name text NOT NULL,
        cited_name text NOT NULL DEFAULT '',
        species_group text NOT NULL DEFAULT '',
        determination_status varchar(1) NOT NULL DEFAULT 'A'
      )
    `);
    copyStream = client.query(
      copyFrom(
        "COPY znieff_species_staging (zone_code, cd_ref, cd_nom, scientific_name, cited_name, species_group, determination_status) FROM STDIN",
      ),
    );
    const unzip = spawn("unzip", ["-p", archivePath, CSV_ENTRY], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const closePromise = new Promise<number | null>((resolve, reject) => {
      unzip.once("error", reject);
      unzip.once("close", resolve);
    });
    unzip.stderr.setEncoding("utf8");
    unzip.stderr.on("data", (chunk) => {
      unzipError += chunk;
    });
    const lines = createInterface({
      input: unzip.stdout,
      crlfDelay: Infinity,
    });

    let indexes: Record<string, number> | null = null;
    let read = 0;
    let inserted = 0;
    const byStatus = { D: 0, E: 0, A: 0 };
    for await (const rawLine of lines) {
      if (!rawLine) continue;
      const columns = parseSemicolonCsvLine(rawLine.replace(/^\uFEFF/, ""));
      if (!indexes) {
        indexes = validateZnieffHeaders(columns);
        continue;
      }
      read++;
      const row = prepareZnieffSpeciesRow(columns, indexes);
      if (!row) continue;
      const output = [
        row.zoneCode,
        row.cdRef,
        row.cdNom,
        row.scientificName,
        row.citedName,
        row.speciesGroup,
        row.determinationStatus,
      ]
        .map(copyField)
        .join("\t");
      if (!copyStream.write(`${output}\n`)) {
        await once(copyStream, "drain");
      }
      inserted++;
      byStatus[row.determinationStatus]++;
      if (read % 250_000 === 0) {
        console.log(`${read.toLocaleString("fr-FR")} lignes lues…`);
      }
    }
    const unzipCode = await closePromise;
    if (unzipCode !== 0) {
      throw new Error(
        `Extraction de ${CSV_ENTRY} impossible (${unzipCode}) : ${unzipError}`,
      );
    }
    copyStream.end();
    await finished(copyStream);
    copyStream = null;

    console.log("Création des index de la table de staging…");
    await client.query(`
      CREATE INDEX idx_znieff_species_staging_zone_code
      ON znieff_species_staging (zone_code)
    `);
    await client.query(`
      CREATE INDEX idx_znieff_species_staging_cd_ref
      ON znieff_species_staging (cd_ref)
    `);
    await client.query("ANALYZE znieff_species_staging");

    // Seule cette bascule de noms prend un verrou exclusif sur la table active.
    // Elle ne dépend pas de la durée de lecture et d'indexation de l'archive.
    await client.query("BEGIN");
    await client.query(
      "ALTER INDEX IF EXISTS idx_znieff_species_zone_code RENAME TO idx_znieff_species_previous_zone_code",
    );
    await client.query(
      "ALTER INDEX IF EXISTS idx_znieff_species_cd_ref RENAME TO idx_znieff_species_previous_cd_ref",
    );
    await client.query(
      "ALTER TABLE znieff_species RENAME TO znieff_species_previous",
    );
    await client.query(
      "ALTER TABLE znieff_species_staging RENAME TO znieff_species",
    );
    await client.query(
      "ALTER INDEX idx_znieff_species_staging_zone_code RENAME TO idx_znieff_species_zone_code",
    );
    await client.query(
      "ALTER INDEX idx_znieff_species_staging_cd_ref RENAME TO idx_znieff_species_cd_ref",
    );
    await client.query(
      `INSERT INTO znieff_reference_meta
        (id, source_url, source_updated, source_version, imported_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
        source_url = EXCLUDED.source_url,
        source_updated = EXCLUDED.source_updated,
        source_version = EXCLUDED.source_version,
        imported_at = EXCLUDED.imported_at`,
      [
        "patrinat-znieff",
        SOURCE_PAGE_URL,
        sourceUpdated,
        sourceVersion,
      ],
    );
    await client.query("COMMIT");
    await client.query("DROP TABLE znieff_species_previous");
    console.log(
      `Import ZNIEFF terminé : ${inserted.toLocaleString("fr-FR")} espèces actives ` +
        `(D ${byStatus.D.toLocaleString("fr-FR")}, E ${byStatus.E.toLocaleString("fr-FR")}, A ${byStatus.A.toLocaleString("fr-FR")}).`,
    );
  } catch (error) {
    copyStream?.destroy(error instanceof Error ? error : new Error(String(error)));
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  const remoteMeta = await getSourceMetadata();
  await ensureArchive(options.archivePath, options.refresh);
  await importSpecies(
    options.archivePath,
    options.sourceUpdated || remoteMeta.sourceUpdated,
    options.sourceVersion || remoteMeta.sourceVersion,
  );
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});