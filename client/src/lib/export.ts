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
    critique: "Critical",
    fort: "High",
    modere: "Moderate",
    faible: "Low",
    a_confirmer: "To confirm",
  };
  if (occ.enjeuLevel) return labels[occ.enjeuLevel] || "To confirm";
  return occ.alertLevel === "high" ? "High (heuristic)" : occ.alertLevel === "medium" ? "Moderate (heuristic)" : "Low (heuristic)";
}

function getTaxonGroupLabel(occ: Occurrence): string {
  const groupId = getTaxonGroupId(occ);
  const group = TAXON_GROUPS.find(g => g.id === groupId);
  return group?.label || "Other";
}

export function buildSpeciesRows(species: Occurrence[]) {
  return species.map((occ) => {
    const territorial = getPreferredTerritorialRedList(occ.aliStatuses);
    const status = territorial?.value || (isPlantTaxon(occ) ? "To confirm" : getIucnLabel(occ.iucnStatus));
    const source = territorial
      ? `${territorial.category}${territorial.scope ? ` — ${territorial.scope}` : ""}`
      : isPlantTaxon(occ)
        ? "Regional/national/European status not provided"
        : occ.iucnStatus ? IUCN_SOURCE_LABEL : "Not provided";
    return ({
    "Scientific name": occ.scientificName,
    "Common name": occ.vernacularName || "",
    "Territorial concern level": getEnjeuLabel(occ),
    "Priority IUCN status": status,
    "Status territory / source": source,
    "IUCN code": territorial?.value || (isPlantTaxon(occ) ? "" : occ.iucnStatus || ""),
    "Occurrence sources": occ.sourceNames?.length ? occ.sourceNames.join(" | ") : occ.source === "inaturalist" ? "iNaturalist" : occ.source === "gbif" ? "GBIF" : "Not provided",
    "Evidence type": "Occurrence documented in a public source — presence within the project footprint requires field confirmation",
    "Documented occurrence count": occ.observationCount ?? "",
    "Last documented year": occ.lastObservationYear ?? "",
    "Uncertainties / caveats": occ.enjeuWarnings?.length ? occ.enjeuWarnings.join(" | ") : occ.enjeuLevel ? "" : "Territorial level not enriched; heuristic classification",
    "Taxonomic group": getTaxonGroupLabel(occ),
    "Kingdom": occ.kingdom || "",
    "Class": occ.class || "",
    "Order": occ.order || "",
    "Family": occ.family || "",
    "Latitude": occ.decimalLatitude,
    "Longitude": occ.decimalLongitude,
    "GBIF link": occ.taxonKey ? `https://www.gbif.org/species/${occ.taxonKey}` : "",
    });
  });
}

function buildMetaRows(results: InventoryResult, filteredCount: number) {
  const conf = results.confidence;
  return [
    { "Parameter": "Export date", "Value": new Date().toLocaleDateString("en-GB") },
    { "Parameter": "Centre (latitude)", "Value": results.center[0].toFixed(5) },
    { "Parameter": "Centre (longitude)", "Value": results.center[1].toFixed(5) },
    { "Parameter": "Primary radius", "Value": `${results.radius} m` },
    { "Parameter": "Total species", "Value": String(filteredCount) },
    { "Parameter": "Confidence index", "Value": `${conf.total}/100 (${getConfLabel(conf)})` },
    { "Parameter": "Geographic quality", "Value": `${conf.geo}%` },
    { "Parameter": "Taxonomic quality", "Value": `${conf.tax}%` },
    { "Parameter": "Temporal freshness", "Value": `${conf.time}%` },
    { "Parameter": "Traceability", "Value": `${conf.trace}%` },
    { "Parameter": "GBIF quality", "Value": `${conf.issues}%` },
    { "Parameter": "Uniqueness", "Value": `${conf.dup}%` },
    { "Parameter": "Raw occurrences", "Value": String(conf.rawCount) },
    { "Parameter": "Unique occurrences", "Value": String(conf.dedupCount) },
  ];
}

function getConfLabel(conf: ConfidenceScore): string {
  if (conf.interpretation === "excellent") return "Excellent";
  if (conf.interpretation === "good") return "Good";
  if (conf.interpretation === "moderate") return "Moderate";
  return "Low";
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
  triggerDownload(blob, `biodiversity-desk-study-${new Date().toISOString().slice(0, 10)}.csv`);
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
      "Group": g.label,
      "Species count": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id).length,
      "High or critical concerns": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && (o.enjeuLevel === "fort" || o.enjeuLevel === "critique")).length,
      "Moderate concerns": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && o.enjeuLevel === "modere").length,
      "To confirm": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && (!o.enjeuLevel || o.enjeuLevel === "a_confirmer")).length,
      "Low concerns": filteredSpecies.filter(o => getTaxonGroupId(o) === g.id && o.enjeuLevel === "faible").length,
    }))
    .filter(r => r["Species count"] > 0);

  summaryRows.push({
    "Group": "TOTAL",
    "Species count": filteredSpecies.length,
    "High or critical concerns": filteredSpecies.filter(o => o.enjeuLevel === "fort" || o.enjeuLevel === "critique").length,
    "Moderate concerns": filteredSpecies.filter(o => o.enjeuLevel === "modere").length,
    "To confirm": filteredSpecies.filter(o => !o.enjeuLevel || o.enjeuLevel === "a_confirmer").length,
    "Low concerns": filteredSpecies.filter(o => o.enjeuLevel === "faible").length,
  });

  const blob = await writeExcelFile([
    {
      data: rowsToSheetData(speciesRows),
      sheet: "Species",
      columns: [30, 25, 20, 22, 28, 12, 30, 45, 18, 18, 38, 18, 12, 15, 15, 18, 12, 12, 40].map((width) => ({ width })),
      stickyRowsCount: 1,
    },
    {
      data: rowsToSheetData(metaRows),
      sheet: "Metadata",
      columns: [{ width: 28 }, { width: 42 }],
      stickyRowsCount: 1,
    },
    {
      data: rowsToSheetData(summaryRows),
      sheet: "Summary",
      columns: [20, 18, 24, 18, 16, 16].map((width) => ({ width })),
      stickyRowsCount: 1,
    },
  ]).toBlob();
  triggerDownload(blob, `biodiversity-desk-study-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
