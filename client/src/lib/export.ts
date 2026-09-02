import * as XLSX from "xlsx";
import { Occurrence, InventoryResult, getIucnLabel, IUCN_SOURCE_LABEL, getTaxonGroupId, TAXON_GROUPS, ConfidenceScore } from "./gbif";
import { getPreferredTerritorialRedList, isPlantTaxon } from "@shared/iucn";

interface ExportOptions {
  results: InventoryResult;
  filteredSpecies: Occurrence[];
  activeTaxonFilters: Set<string>;
}

function getEnjeuLabel(level: string): string {
  if (level === "high") return "Fort";
  if (level === "medium") return "Moyen";
  return "Faible";
}

function getTaxonGroupLabel(occ: Occurrence): string {
  const groupId = getTaxonGroupId(occ);
  const group = TAXON_GROUPS.find(g => g.id === groupId);
  return group?.label || "Autre";
}

function buildSpeciesRows(species: Occurrence[]) {
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
    "Niveau d'enjeu": getEnjeuLabel(occ.alertLevel),
    "Statut UICN prioritaire": status,
    "Territoire / source du statut": source,
    "Code UICN": territorial?.value || (isPlantTaxon(occ) ? "" : occ.iucnStatus || ""),
    "Noms sources fusionnés": (occ.sourceNames && occ.sourceNames.length > 1) ? occ.sourceNames.join(" | ") : "",
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
  triggerDownload(blob, `inventaire-flash-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportExcel({ results, filteredSpecies }: ExportOptions) {
  const wb = XLSX.utils.book_new();

  const speciesRows = buildSpeciesRows(filteredSpecies);
  const wsSpecies = XLSX.utils.json_to_sheet(speciesRows);

  const colWidths = [
    { wch: 30 }, // Nom scientifique
    { wch: 25 }, // Nom vernaculaire
    { wch: 14 }, // Enjeu
    { wch: 22 }, // Statut UICN
    { wch: 10 }, // Code
    { wch: 18 }, // Groupe
    { wch: 12 }, // Règne
    { wch: 15 }, // Classe
    { wch: 15 }, // Ordre
    { wch: 18 }, // Famille
    { wch: 12 }, // Lat
    { wch: 12 }, // Lng
    { wch: 40 }, // Lien
  ];
  wsSpecies["!cols"] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsSpecies, "Espèces");

  const metaRows = buildMetaRows(results, filteredSpecies.length);
  const wsMeta = XLSX.utils.json_to_sheet(metaRows);
  wsMeta["!cols"] = [{ wch: 25 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, "Métadonnées");

  const summaryRows = TAXON_GROUPS
    .map(g => ({
      "Groupe": g.label,
      "Nombre d'espèces": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id).length,
      "Enjeux forts": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && o.alertLevel === "high").length,
      "Enjeux moyens": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && o.alertLevel === "medium").length,
      "Enjeux faibles": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && o.alertLevel === "low").length,
    }))
    .filter(r => r["Nombre d'espèces"] > 0);

  summaryRows.push({
    "Groupe": "TOTAL",
    "Nombre d'espèces": filteredSpecies.length,
    "Enjeux forts": filteredSpecies.filter(o => o.alertLevel === "high").length,
    "Enjeux moyens": filteredSpecies.filter(o => o.alertLevel === "medium").length,
    "Enjeux faibles": filteredSpecies.filter(o => o.alertLevel === "low").length,
  });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Synthèse");

  const xlsxData = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([xlsxData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, `inventaire-flash-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
