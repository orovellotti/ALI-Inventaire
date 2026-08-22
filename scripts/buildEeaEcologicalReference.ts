/**
 * Télécharge et génère le référentiel compact utilisé par le moteur d'espèces
 * potentielles.
 *
 * Usage :
 *   npm run refresh:eea-reference
 *
 * Source officielle :
 * EEA, "Ecological groups of habitats and species", DAT-143-en,
 * https://www.eea.europa.eu/en/datahub/datahubitem-view/e6c5dc03-4df2-4f43-a423-792ed9b4a9d3
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import XLSX from "xlsx";

const DATASET_ID = "DAT-143-en";
const RECORD_ID = "c9d7703d-734d-4471-8467-f768063f38dc";
const EXPECTED_ARCHIVE_VERSION = "v01_r01";
const EXPECTED_SPECIES_WITHOUT_AVAILABILITY = new Set([
  "iris aphylla subsp. hungarica",
]);
const TITLE = "Ecological groups of habitats and species";
const DATAHUB_URL =
  "https://www.eea.europa.eu/en/datahub/datahubitem-view/e6c5dc03-4df2-4f43-a423-792ed9b4a9d3";
const RECORD_DOWNLOAD_URL = `https://sdi.eea.europa.eu/data/${RECORD_ID}`;
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  "server/data/eeaEcologicalGroups.ts",
);

const EXPECTED_SHEETS = [
  "read me",
  "habitats endemism",
  "species endemism",
  "habitat ecological groups",
  "species ecological groups",
  "species availability of info",
] as const;

const EXPECTED_HEADERS: Record<string, string[]> = {
  "habitats endemism": [
    "Habitat code",
    "Habitat name",
    "Degree of endemism",
    "Degree of endemism - code",
  ],
  "species endemism": [
    "Species code",
    "Species name",
    "Endemic to EU?",
    "Degree of endemism",
    "Degree of endemism - code",
  ],
  "habitat ecological groups": [
    "Habitat code",
    "Habitat name",
    "Ecological group",
    "Level",
    "Ecological group - code",
  ],
  "species ecological groups": [
    "Species code",
    "Species name",
    "lifestage",
    "preference for habitat",
    "Ecological group",
    "Level",
    "Ecological group - code",
  ],
  "species availability of info": [
    "Species code",
    "Species name",
    "different habitats in different lifestages",
    "lifestage",
    "availability of knowledge on species",
    "",
    "",
  ],
};

type Group = {
  code: string;
  label: string;
  level: string;
};

type SpeciesGroup = Group & {
  preference: string;
  lifeStage: string;
};

type SpeciesProfile = {
  scientificName: string;
  availability: string;
  groups: SpeciesGroup[];
};

type SourceMetadata = {
  archiveVersion: string;
  packagePeriod: string;
  sourceUpdated: string;
  workbookSha256: string;
};

function fail(message: string): never {
  throw new Error(`[EEA ${DATASET_ID}] ${message}`);
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

function cell(value: unknown): string {
  return String(value ?? "").trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEnglishDate(day: string, month: string, year: string): string {
  const monthNumber = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(month);
  if (monthNumber < 0) fail(`Mois EEA inconnu dans la date source : ${month}`);
  return `${year}-${String(monthNumber + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function download(url: string, label: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/zip;q=0.8,*/*;q=0.7",
          "accept-language": "en-US,en;q=0.9",
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  fail(
    `Impossible de télécharger ${label} après 3 tentatives : ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function validateDatahubPage(html: string): string {
  const text = htmlToText(html);
  if (!new RegExp(`Prod-ID\\s*:\\s*${DATASET_ID}\\b`).test(text)) {
    fail(`l'identifiant ${DATASET_ID} est absent de la page Datahub officielle`);
  }
  if (!text.includes(TITLE)) {
    fail(`le titre officiel attendu est absent de la page Datahub`);
  }
  if (!html.includes(RECORD_DOWNLOAD_URL)) {
    fail(`la page Datahub ne référence plus l'enregistrement ${RECORD_ID}`);
  }
  const modified = text.match(
    /Last modified\s+(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})/,
  );
  if (!modified) fail(`la date de dernière modification EEA est introuvable`);
  return parseEnglishDate(modified[1], modified[2], modified[3]);
}

function findArchiveUrl(html: string): string {
  const match = html.match(
    /https:\/\/sdi\.eea\.europa\.eu\/datashare\/s\/[A-Za-z0-9]+\/download/,
  );
  if (!match) {
    fail(`le lien de l'archive officielle est introuvable pour ${RECORD_ID}`);
  }
  return match[0];
}

function listArchiveEntries(archivePath: string): string[] {
  let output: string;
  try {
    output = execFileSync("unzip", ["-Z1", archivePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    fail(
      `archive ZIP illisible : ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const entries = output.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0) fail(`l'archive officielle est vide`);
  for (const entry of entries) {
    const parts = entry.replaceAll("\\", "/").split("/");
    if (entry.startsWith("/") || parts.includes("..")) {
      fail(`chemin non sûr dans l'archive : ${entry}`);
    }
  }
  return entries;
}

function validateArchive(
  archivePath: string,
  destination: string,
): { workbookPath: string; metadataPath: string; version: string; period: string } {
  const entries = listArchiveEntries(archivePath);
  const roots = new Set(entries.map((entry) => entry.split("/")[0]));
  if (roots.size !== 1) {
    fail(`l'archive doit contenir un unique dossier racine`);
  }
  const root = [...roots][0];
  const rootMatch = root.match(
    /^eea_t_habitats-directive-ecological-groups_p_(\d{4}(?:-\d{4})?)_(v\d{2}_r\d{2})$/,
  );
  if (!rootMatch) {
    fail(`nom/version du paquet EEA non reconnu : ${root}`);
  }
  const [, period, version] = rootMatch;
  if (version !== EXPECTED_ARCHIVE_VERSION) {
    fail(
      `version officielle ${version} incompatible avec la version validée ${EXPECTED_ARCHIVE_VERSION}; examiner le nouveau paquet avant de modifier EXPECTED_ARCHIVE_VERSION`,
    );
  }

  const workbooks = entries.filter((entry) => entry.endsWith(".xlsx"));
  const metadataFiles = entries.filter((entry) =>
    /_metadata_[0-9a-f-]+\.xml$/i.test(entry),
  );
  if (workbooks.length !== 1) {
    fail(`un seul classeur .xlsx était attendu, ${workbooks.length} trouvé(s)`);
  }
  if (metadataFiles.length !== 1) {
    fail(
      `un seul fichier de métadonnées XML était attendu, ${metadataFiles.length} trouvé(s)`,
    );
  }

  try {
    execFileSync("unzip", ["-q", archivePath, "-d", destination], {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (error) {
    fail(
      `échec de l'extraction ZIP : ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return {
    workbookPath: path.join(destination, workbooks[0]),
    metadataPath: path.join(destination, metadataFiles[0]),
    version,
    period,
  };
}

function validateRecordMetadata(metadataPath: string): void {
  const xml = fs.readFileSync(metadataPath, "utf8");
  if (!xml.includes(`<gco:CharacterString>${RECORD_ID}</gco:CharacterString>`)) {
    fail(`l'identifiant ${RECORD_ID} est absent des métadonnées de l'archive`);
  }
  if (!htmlToText(xml).includes(TITLE)) {
    fail(`le titre attendu est absent des métadonnées de l'archive`);
  }
}

function workbookRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) fail(`feuille absente : ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

function validateWorkbookSchema(workbook: XLSX.WorkBook): void {
  if (
    workbook.SheetNames.length !== EXPECTED_SHEETS.length ||
    workbook.SheetNames.some((sheet, index) => sheet !== EXPECTED_SHEETS[index])
  ) {
    fail(
      `schéma des feuilles incompatible.\nAttendu : ${EXPECTED_SHEETS.join(", ")}\nReçu : ${workbook.SheetNames.join(", ")}`,
    );
  }
  const readMe = cell(workbookRows(workbook, "read me")[0]?.[0]);
  if (!readMe.includes("attribution of the Habitats Directive habitats and species")) {
    fail(`contenu de la feuille "read me" non reconnu`);
  }
  for (const [sheetName, expected] of Object.entries(EXPECTED_HEADERS)) {
    const actual = (workbookRows(workbook, sheetName)[0] ?? []).map(cell);
    if (
      actual.length !== expected.length ||
      actual.some((header, index) => header !== expected[index])
    ) {
      fail(
        `colonnes incompatibles dans "${sheetName}".\nAttendu : ${JSON.stringify(expected)}\nReçu : ${JSON.stringify(actual)}`,
      );
    }
  }
}

function dataRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  return workbookRows(workbook, sheetName)
    .slice(1)
    .filter((row) => row.some((value) => cell(value) !== ""));
}

function requireCells(
  row: unknown[],
  indexes: number[],
  sheetName: string,
  rowNumber: number,
): void {
  const missing = indexes.filter((index) => cell(row[index]) === "");
  if (missing.length > 0) {
    fail(
      `valeur(s) obligatoire(s) absente(s) dans "${sheetName}", ligne ${rowNumber}, colonne(s) ${missing.map((index) => index + 1).join(", ")}`,
    );
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function recordKeyComparator(a: string, b: string): number {
  const aIsInteger = /^(0|[1-9]\d*)$/.test(a) && Number(a) < 4_294_967_295;
  const bIsInteger = /^(0|[1-9]\d*)$/.test(b) && Number(b) < 4_294_967_295;
  if (aIsInteger && bIsInteger) return Number(a) - Number(b);
  if (aIsInteger) return -1;
  if (bIsInteger) return 1;
  return compareText(a, b);
}

function groupComparator(a: Group, b: Group): number {
  return (
    compareText(a.code, b.code) ||
    compareText(a.label, b.label) ||
    compareText(a.level, b.level)
  );
}

function speciesGroupComparator(a: SpeciesGroup, b: SpeciesGroup): number {
  return (
    groupComparator(a, b) ||
    compareText(a.preference, b.preference) ||
    compareText(a.lifeStage, b.lifeStage)
  );
}

function buildReference(workbook: XLSX.WorkBook): {
  habitats: Record<string, Group[]>;
  species: Record<string, SpeciesProfile>;
} {
  const habitats = new Map<string, Map<string, Group>>();
  const habitatRows = dataRows(workbook, "habitat ecological groups");
  habitatRows.forEach((row, index) => {
    requireCells(row, [0, 2, 3, 4], "habitat ecological groups", index + 2);
    const habitatCode = cell(row[0]);
    const group: Group = {
      code: cell(row[4]),
      label: cell(row[2]),
      level: cell(row[3]),
    };
    const groups = habitats.get(habitatCode) ?? new Map<string, Group>();
    const previous = groups.get(group.code);
    if (previous && JSON.stringify(previous) !== JSON.stringify(group)) {
      fail(
        `définition contradictoire du groupe ${group.code} pour l'habitat ${habitatCode}`,
      );
    }
    groups.set(group.code, group);
    habitats.set(habitatCode, groups);
  });

  const availabilityBySpecies = new Map<
    string,
    {
      scientificName: string;
      values: Set<string>;
      allRowsAreStageSpecific: boolean;
    }
  >();
  const availabilityRows = dataRows(workbook, "species availability of info");
  availabilityRows.forEach((row, index) => {
    requireCells(row, [0, 1, 4], "species availability of info", index + 2);
    const name = normalizeName(row[1]);
    const value = cell(row[4]);
    if (!["good", "sufficient", "not sufficient"].includes(value)) {
      fail(`niveau de connaissance inconnu "${value}" pour ${cell(row[1])}`);
    }
    const entry = availabilityBySpecies.get(name) ?? {
      scientificName: cell(row[1]),
      values: new Set<string>(),
      allRowsAreStageSpecific: true,
    };
    entry.values.add(value);
    entry.allRowsAreStageSpecific &&=
      cell(row[2]).toUpperCase() === "YES" && cell(row[3]) !== "";
    availabilityBySpecies.set(name, entry);
  });
  const availability = new Map<string, string>();
  for (const [name, entry] of availabilityBySpecies) {
    if (entry.values.size > 1 && !entry.allRowsAreStageSpecific) {
      fail(`disponibilité contradictoire pour l'espèce ${entry.scientificName}`);
    }
    // Certaines espèces ont un niveau distinct par stade de vie. Le format
    // compact restant global, cette priorité explicite préserve la valeur
    // historique sans dépendre de l'ordre des lignes du classeur.
    const value = ["sufficient", "good", "not sufficient"].find((candidate) =>
      entry.values.has(candidate),
    );
    if (!value) fail(`disponibilité absente pour l'espèce ${entry.scientificName}`);
    availability.set(name, value);
  }

  const species = new Map<
    string,
    Omit<SpeciesProfile, "groups"> & { groups: Map<string, SpeciesGroup> }
  >();
  const speciesRows = dataRows(workbook, "species ecological groups");
  speciesRows.forEach((row, index) => {
    requireCells(row, [0, 1, 3, 4, 5, 6], "species ecological groups", index + 2);
    const scientificName = cell(row[1]);
    const key = normalizeName(scientificName);
    const group: SpeciesGroup = {
      code: cell(row[6]),
      label: cell(row[4]),
      level: cell(row[5]),
      preference: cell(row[3]).toUpperCase(),
      lifeStage: cell(row[2]),
    };
    if (!["1", "E", "O", "P", "S"].includes(group.preference)) {
      fail(
        `préférence écologique inconnue "${group.preference}" pour ${scientificName}`,
      );
    }
    const profile = species.get(key) ?? {
      scientificName,
      availability: availability.get(key) ?? "",
      groups: new Map<string, SpeciesGroup>(),
    };
    if (profile.scientificName !== scientificName) {
      fail(
        `noms scientifiques contradictoires après normalisation : "${profile.scientificName}" et "${scientificName}"`,
      );
    }
    const groupKey = [group.code, group.preference, group.lifeStage].join("\u0000");
    const previous = profile.groups.get(groupKey);
    if (previous && JSON.stringify(previous) !== JSON.stringify(group)) {
      fail(
        `définition contradictoire du groupe ${group.code} pour ${scientificName}`,
      );
    }
    profile.groups.set(groupKey, group);
    species.set(key, profile);
  });

  const missingAvailability = [...species.entries()]
    .filter(([, profile]) => profile.availability === "")
    .map(([name]) => name)
    .sort();
  const expectedMissingAvailability = [
    ...EXPECTED_SPECIES_WITHOUT_AVAILABILITY,
  ].sort();
  if (
    missingAvailability.length !== expectedMissingAvailability.length ||
    missingAvailability.some(
      (name, index) => name !== expectedMissingAvailability[index],
    )
  ) {
    fail(
      `liste inattendue d'espèces sans niveau de connaissance.\nAttendu : ${expectedMissingAvailability.join(", ")}\nReçu : ${missingAvailability.join(", ") || "aucune"}`,
    );
  }
  const habitatGroupCount = [...habitats.values()].reduce(
    (total, groups) => total + groups.size,
    0,
  );
  const speciesGroupCount = [...species.values()].reduce(
    (total, profile) => total + profile.groups.size,
    0,
  );
  if (habitats.size < 200 || habitatGroupCount < 1_500) {
    fail(
      `référentiel habitats manifestement incomplet (${habitats.size} habitats, ${habitatGroupCount} associations)`,
    );
  }
  if (species.size < 1_400 || speciesGroupCount < 8_000) {
    fail(
      `référentiel espèces manifestement incomplet (${species.size} espèces, ${speciesGroupCount} associations)`,
    );
  }

  return {
    habitats: Object.fromEntries(
      [...habitats.entries()]
        .sort(([a], [b]) => recordKeyComparator(a, b))
        .map(([code, groups]) => [
          code,
          [...groups.values()].sort(groupComparator),
        ]),
    ),
    species: Object.fromEntries(
      [...species.entries()]
        .sort(([a], [b]) => recordKeyComparator(a, b))
        .map(([key, profile]) => [
          key,
          {
            scientificName: profile.scientificName,
            availability: profile.availability,
            groups: [...profile.groups.values()].sort(speciesGroupComparator),
          },
        ]),
    ),
  };
}

function renderReference(
  habitats: Record<string, Group[]>,
  species: Record<string, SpeciesProfile>,
  metadata: SourceMetadata,
): string {
  return `/* eslint-disable */
/**
 * FICHIER GÉNÉRÉ — ne pas modifier manuellement.
 * Source : EEA, Ecological groups of habitats and species (${DATASET_ID}).
 * Paquet ${metadata.archiveVersion}, source mise à jour le ${metadata.sourceUpdated}.
 * Généré par scripts/buildEeaEcologicalReference.ts.
 */
export interface EeaEcologicalGroup {
  code: string;
  label: string;
  level: string;
}
export interface EeaSpeciesEcologicalGroup extends EeaEcologicalGroup {
  preference: string;
  lifeStage: string;
}
export const EEA_ECOLOGICAL_REFERENCE_META = ${JSON.stringify(
    {
      id: DATASET_ID,
      recordId: RECORD_ID,
      title: TITLE,
      publisher: "European Environment Agency",
      sourceUrl: DATAHUB_URL,
      sourceUpdated: metadata.sourceUpdated,
      archiveVersion: metadata.archiveVersion,
      packagePeriod: metadata.packagePeriod,
      workbookSha256: metadata.workbookSha256,
    },
    null,
    2,
  )} as const;
export const EEA_HABITAT_ECOLOGICAL_GROUPS: Record<string, EeaEcologicalGroup[]> = ${JSON.stringify(
    habitats,
    null,
    2,
  )};
export const EEA_SPECIES_ECOLOGICAL_GROUPS: Record<string, {
  scientificName: string;
  availability: string;
  groups: EeaSpeciesEcologicalGroup[];
}> = ${JSON.stringify(species, null, 2)};
`;
}

async function main(): Promise<void> {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "eea-ecological-reference-"),
  );
  try {
    console.log(`Vérification de la source officielle ${DATASET_ID}…`);
    const datahubPage = (
      await download(DATAHUB_URL, "la page Datahub")
    ).toString("utf8");
    const sourceUpdated = validateDatahubPage(datahubPage);

    const recordPage = (
      await download(RECORD_DOWNLOAD_URL, "la page de téléchargement")
    ).toString("utf8");
    const archiveUrl = findArchiveUrl(recordPage);
    const archive = await download(archiveUrl, "l'archive DAT-143");
    if (
      archive.length < 4 ||
      archive[0] !== 0x50 ||
      archive[1] !== 0x4b
    ) {
      fail(`le téléchargement officiel n'est pas une archive ZIP`);
    }
    const archivePath = path.join(temporaryDirectory, "source.zip");
    fs.writeFileSync(archivePath, archive);

    const extractedDirectory = path.join(temporaryDirectory, "extracted");
    fs.mkdirSync(extractedDirectory);
    const source = validateArchive(
      archivePath,
      extractedDirectory,
    );
    validateRecordMetadata(source.metadataPath);

    const workbook = XLSX.readFile(source.workbookPath);
    validateWorkbookSchema(workbook);
    const { habitats, species } = buildReference(workbook);
    const workbookSha256 = createHash("sha256")
      .update(fs.readFileSync(source.workbookPath))
      .digest("hex");
    const output = renderReference(habitats, species, {
      archiveVersion: source.version,
      packagePeriod: source.period,
      sourceUpdated,
      workbookSha256,
    });

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    const temporaryOutput = `${OUTPUT_PATH}.tmp`;
    fs.writeFileSync(temporaryOutput, output);
    fs.renameSync(temporaryOutput, OUTPUT_PATH);
    console.log(
      `Référentiel ${DATASET_ID} ${source.version} généré : ${Object.keys(species).length} espèces, ${Object.keys(habitats).length} habitats`,
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});