import writeExcelFile from "write-excel-file/browser";
import type { SheetData } from "write-excel-file/browser";
import { Occurrence, InventoryResult, getIucnLabel, IUCN_SOURCE_LABEL, getTaxonGroupId, TAXON_GROUPS, ConfidenceScore } from "./gbif";
import { getPreferredTerritorialRedList, isPlantTaxon } from "@shared/iucn";

interface ExportOptions {
  results: InventoryResult;
  filteredSpecies: Occurrence[];
  activeTaxonFilters: Set<string>;
}

function getEnjeuLabel(occ: Occurrence): string {
  const labels: Record<string, string> = {
    critique: "Critique",
    fort: "Fort",
    modere: "Modéré",
    faible: "Faible",
    a_confirmer: "À confirmer",
  };
  if (occ.enjeuLevel) return labels[occ.enjeuLevel] || "À confirmer";
  return occ.alertLevel === "high" ? "Fort (heuristique)" : occ.alertLevel === "medium" ? "Modéré (heuristique)" : "Faible (heuristique)";
}

function getTaxonGroupLabel(occ: Occurrence): string {
  const groupId = getTaxonGroupId(occ);
  const group = TAXON_GROUPS.find(g => g.id === groupId);
  return group?.label || "Autre";
}

export function buildSpeciesRows(species: Occurrence[]) {
  return species.map((occ) => {
    const territorial = getPreferredTerritorialRedList(occ.aliStatuses);
    const status = territorial?.value || (isPlantTaxon(occ) ? "À confirmer" : getIucnLabel(occ.iucnStatus));
    const source = territorial
      ? `${territorial.category}${territorial.scope ? ` — ${territorial.scope}` : ""}`
      : isPlantTaxon(occ)
        ? "Statut régional/national/européen non renseigné"
        : occ.iucnStatus ? IUCN_SOURCE_LABEL : "Non renseigné";
    return ({
    "Nom scientifique": occ.scientificName,
    "Nom vernaculaire": occ.vernacularName || "",
    "Niveau d'enjeu territorial": getEnjeuLabel(occ),
    "Statut UICN prioritaire": status,
    "Territoire / source du statut": source,
    "Code UICN": territorial?.value || (isPlantTaxon(occ) ? "" : occ.iucnStatus || ""),
    "Provenance des occurrences": occ.sourceNames?.length ? occ.sourceNames.join(" | ") : occ.source === "inaturalist" ? "iNaturalist" : occ.source === "gbif" ? "GBIF" : "Non renseignée",
    "Nature de la preuve": "Occurrence documentée dans une source publique — présence dans l’emprise à confirmer par des relevés de terrain",
    "Nombre d'occurrences documentées": occ.observationCount ?? "",
    "Dernière année documentée": occ.lastObservationYear ?? "",
    "Incertitudes / réserves": occ.enjeuWarnings?.length ? occ.enjeuWarnings.join(" | ") : occ.enjeuLevel ? "" : "Niveau territorial non enrichi ; classement heuristique",
    "Groupe taxonomique": getTaxonGroupLabel(occ),
    "Règne": occ.kingdom || "",
    "Classe": occ.class || "",
    "Ordre": occ.order || "",
    "Famille": occ.family || "",
    "Latitude": occ.decimalLatitude,
    "Longitude": occ.decimalLongitude,
    "Lien GBIF": occ.taxonKey ? `https://www.gbif.org/species/${occ.taxonKey}` : "",
    });
  });
}

function buildMetaRows(results: InventoryResult, filteredCount: number) {
  const conf = results.confidence;
  return [
    { "Paramètre": "Date d'export", "Valeur": new Date().toLocaleDateString("fr-FR") },
    { "Paramètre": "Centre (latitude)", "Valeur": results.center[0].toFixed(5) },
    { "Paramètre": "Centre (longitude)", "Valeur": results.center[1].toFixed(5) },
    { "Paramètre": "Rayon principal", "Valeur": `${results.radius} m` },
    { "Paramètre": "Total espèces", "Valeur": String(filteredCount) },
    { "Paramètre": "Indice de confiance", "Valeur": `${conf.total}/100 (${getConfLabel(conf)})` },
    { "Paramètre": "Qualité géographique", "Valeur": `${conf.geo}%` },
    { "Paramètre": "Qualité taxonomique", "Valeur": `${conf.tax}%` },
    { "Paramètre": "Fraîcheur temporelle", "Valeur": `${conf.time}%` },
    { "Paramètre": "Traçabilité", "Valeur": `${conf.trace}%` },
    { "Paramètre": "Qualité GBIF", "Valeur": `${conf.issues}%` },
    { "Paramètre": "Unicité", "Valeur": `${conf.dup}%` },
    { "Paramètre": "Occurrences brutes", "Valeur": String(conf.rawCount) },
    { "Paramètre": "Occurrences uniques", "Valeur": String(conf.dedupCount) },
  ];
}

function getConfLabel(conf: ConfidenceScore): string {
  if (conf.interpretation === "excellent") return "Excellent";
  if (conf.interpretation === "good") return "Bon";
  if (conf.interpretation === "moderate") return "Modéré";
  return "Faible";
}

function sanitizeCsvValue(val: string): string {
  if (val.length > 0 && "=+-@\t".includes(val[0])) {
    return "'" + val;
  }
  return val;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV({ results, filteredSpecies }: ExportOptions) {
  const rows = buildSpeciesRows(filteredSpecies);
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(";"),
    ...rows.map(row => headers.map(h => {
      const raw = String((row as Record<string, unknown>)[h] ?? "");
      const val = sanitizeCsvValue(raw);
      return val.includes(";") || val.includes('"') || val.includes("\n")
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(";"))
  ].join("\n");

  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `pre-etude-documentaire-biodiversite-${new Date().toISOString().slice(0, 10)}.csv`);
}

function rowsToSheetData(
  rows: Array<Record<string, string | number>>,
): SheetData {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return [
    headers.map((header) => ({
      value: header,
      fontWeight: "bold",
      backgroundColor: "#EDF2E9",
      textColor: "#17483D",
    })),
    ...rows.map((row) => headers.map((header) => row[header] ?? "")),
  ];
}

export async function exportExcel({ results, filteredSpecies }: ExportOptions) {
  const speciesRows = buildSpeciesRows(filteredSpecies);
  const metaRows = buildMetaRows(results, filteredSpecies.length);

  const summaryRows = TAXON_GROUPS
    .map(g => ({
      "Groupe": g.label,
      "Nombre d'espèces": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id).length,
      "Enjeux forts ou critiques": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && (o.enjeuLevel === "fort" || o.enjeuLevel === "critique")).length,
      "Enjeux modérés": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && o.enjeuLevel === "modere").length,
      "À confirmer": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && (!o.enjeuLevel || o.enjeuLevel === "a_confirmer")).length,
      "Enjeux faibles": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && o.enjeuLevel === "faible").length,
    }))
    .filter(r => r["Nombre d'espèces"] > 0);

  summaryRows.push({
    "Groupe": "TOTAL",
    "Nombre d'espèces": filteredSpecies.length,
    "Enjeux forts ou critiques": filteredSpecies.filter(o => o.enjeuLevel === "fort" || o.enjeuLevel === "critique").length,
    "Enjeux modérés": filteredSpecies.filter(o => o.enjeuLevel === "modere").length,
    "À confirmer": filteredSpecies.filter(o => !o.enjeuLevel || o.enjeuLevel === "a_confirmer").length,
    "Enjeux faibles": filteredSpecies.filter(o => o.enjeuLevel === "faible").length,
  });

  const blob = await writeExcelFile([
    {
      data: rowsToSheetData(speciesRows),
      sheet: "Espèces",
      columns: [30, 25, 20, 22, 28, 12, 30, 45, 18, 18, 38, 18, 12, 15, 15, 18, 12, 12, 40].map((width) => ({ width })),
      stickyRowsCount: 1,
    },
    {
      data: rowsToSheetData(metaRows),
      sheet: "Métadonnées",
      columns: [{ width: 28 }, { width: 42 }],
      stickyRowsCount: 1,
    },
    {
      data: rowsToSheetData(summaryRows),
      sheet: "Synthèse",
      columns: [20, 18, 24, 18, 16, 16].map((width) => ({ width })),
      stickyRowsCount: 1,
    },
  ]).toBlob();
  triggerDownload(blob, `pre-etude-documentaire-biodiversite-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
