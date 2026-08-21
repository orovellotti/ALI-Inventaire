/**
 * Génère le référentiel compact utilisé par le moteur d'espèces potentielles.
 *
 * Usage :
 *   npx tsx scripts/buildEeaEcologicalReference.ts /chemin/vers/annexes.xlsx
 *
 * Source officielle :
 * EEA, "Ecological groups of habitats and species", DAT-143-en,
 * https://www.eea.europa.eu/en/datahub/datahubitem-view/e6c5dc03-4df2-4f43-a423-792ed9b4a9d3
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const input = process.argv[2];
if (!input) {
  throw new Error("Chemin du classeur EEA requis");
}

type Group = {
  code: string;
  label: string;
  level: string;
};
type SpeciesGroup = Group & {
  preference: string;
  lifeStage: string;
};

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

function rows(sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Feuille absente : ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

const workbook = XLSX.readFile(input);
const habitats: Record<string, Group[]> = {};
for (const row of rows("habitat ecological groups").slice(1)) {
  const code = String(row[0] ?? "").trim();
  const groupCode = String(row[4] ?? "").trim();
  if (!code || !groupCode) continue;
  const group = {
    code: groupCode,
    label: String(row[2] ?? "").trim(),
    level: String(row[3] ?? "").trim(),
  };
  habitats[code] ??= [];
  if (!habitats[code].some((item) => item.code === group.code)) {
    habitats[code].push(group);
  }
}

const availability = new Map<string, string>();
for (const row of rows("species availability of info").slice(1)) {
  const name = normalizeName(row[1]);
  if (name) availability.set(name, String(row[4] ?? "").trim());
}

const species: Record<
  string,
  { scientificName: string; availability: string; groups: SpeciesGroup[] }
> = {};
for (const row of rows("species ecological groups").slice(1)) {
  const scientificName = String(row[1] ?? "").trim();
  const key = normalizeName(scientificName);
  const groupCode = String(row[6] ?? "").trim();
  if (!key || !groupCode) continue;
  species[key] ??= {
    scientificName,
    availability: availability.get(key) ?? "",
    groups: [],
  };
  const group = {
    code: groupCode,
    label: String(row[4] ?? "").trim(),
    level: String(row[5] ?? "").trim(),
    preference: String(row[3] ?? "").trim().toUpperCase(),
    lifeStage: String(row[2] ?? "").trim(),
  };
  if (
    !species[key].groups.some(
      (item) =>
        item.code === group.code &&
        item.preference === group.preference &&
        item.lifeStage === group.lifeStage,
    )
  ) {
    species[key].groups.push(group);
  }
}

for (const groups of Object.values(habitats)) {
  groups.sort((a, b) => a.code.localeCompare(b.code));
}
for (const profile of Object.values(species)) {
  profile.groups.sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      a.preference.localeCompare(b.preference),
  );
}

const output = `/* eslint-disable */
/**
 * FICHIER GÉNÉRÉ — ne pas modifier manuellement.
 * Source : EEA, Ecological groups of habitats and species (DAT-143-en).
 * Classeur publié le 15 novembre 2022, fichier EEA mis à jour le 10 octobre 2025.
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
    id: "DAT-143-en",
    title: "Ecological groups of habitats and species",
    publisher: "European Environment Agency",
    sourceUrl:
      "https://www.eea.europa.eu/en/datahub/datahubitem-view/e6c5dc03-4df2-4f43-a423-792ed9b4a9d3",
    sourceUpdated: "2025-10-10",
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

const outputPath = path.resolve(
  process.cwd(),
  "server/data/eeaEcologicalGroups.ts",
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
console.log(
  `Référentiel généré : ${Object.keys(species).length} espèces, ${Object.keys(habitats).length} habitats`,
);