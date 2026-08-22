export interface PreparedZnieffSpeciesRow {
  zoneCode: string;
  cdRef: string;
  cdNom: string;
  scientificName: string;
  citedName: string;
  speciesGroup: string;
  determinationStatus: "D" | "E" | "A";
}

export function parseSemicolonCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        current += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ";") {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current);
  return fields;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractScientificName(citedNameHtml: string): {
  scientificName: string;
  citedName: string;
} {
  const italic = citedNameHtml.match(/<i[^>]*>([\s\S]*?)<\/i>/i)?.[1] ?? "";
  const citedName = stripHtml(citedNameHtml);
  const scientificName = stripHtml(italic) || citedName;
  return { scientificName, citedName };
}

export function validateZnieffHeaders(headers: string[]): Record<string, number> {
  const indexes: Record<string, number> = {};
  headers.forEach((header, index) => {
    indexes[header.replace(/^\uFEFF/, "").trim().toLowerCase()] = index;
  });
  const required = [
    "id_znieff",
    "nm_sffzn",
    "cd_ref",
    "cd_nom",
    "fg_esp",
    "fg_supp",
    "groupe_taxo",
    "nom_cite",
  ];
  const missing = required.filter((field) => indexes[field] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Colonnes ZNIEFF manquantes dans REF_ESPECE.csv : ${missing.join(", ")}`,
    );
  }
  return indexes;
}

export function prepareZnieffSpeciesRow(
  columns: string[],
  indexes: Record<string, number>,
): PreparedZnieffSpeciesRow | null {
  const status = (columns[indexes.fg_esp] ?? "").trim().toUpperCase();
  const suppressed = (columns[indexes.fg_supp] ?? "").trim().toLowerCase();
  // C (confidentielle) n'est jamais exposé. Les statuts inconnus sont refusés
  // plutôt que d'être silencieusement reclassés en « autre espèce ».
  if (
    suppressed === "true" ||
    (status !== "D" && status !== "E" && status !== "A")
  ) {
    return null;
  }
  const zoneCode = (columns[indexes.nm_sffzn] ?? "").trim();
  const citedNameHtml = (columns[indexes.nom_cite] ?? "").trim();
  const names = extractScientificName(citedNameHtml);
  if (!zoneCode || !names.scientificName) return null;

  return {
    zoneCode,
    cdRef: (columns[indexes.cd_ref] ?? "").trim(),
    cdNom: (columns[indexes.cd_nom] ?? "").trim(),
    scientificName: names.scientificName,
    citedName: names.citedName,
    speciesGroup: (columns[indexes.groupe_taxo] ?? "").trim(),
    determinationStatus: status,
  };
}