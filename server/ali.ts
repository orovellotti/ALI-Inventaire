import { ALI_BASE, searchAliTaxon, fetchAliStatuts, type RawAliStatus } from "./services/aliApi";

export type StatusTone = "danger" | "warn" | "info" | "neutral";

export interface SpeciesStatus {
  category: string;
  value: string;
  label: string;
  tone: StatusTone;
  scope?: string;
  docUrl?: string;
}

export interface AliEnrichment {
  cdNom: number;
  aliUrl: string;
  statuses: SpeciesStatus[];
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildTaxonUrl(cdNom: number, name: string): string {
  const slug = slugify(name);
  return slug ? `${ALI_BASE}/taxon/${cdNom}-${slug}` : `${ALI_BASE}/taxon/${cdNom}`;
}

export async function resolveAliUrl(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return ALI_BASE;

  const hit = await searchAliTaxon(q);
  if (!hit) return `${ALI_BASE}/?q=${encodeURIComponent(q)}`;
  return buildTaxonUrl(hit.cdRef ?? hit.cdNom, hit.name);
}

const IUCN_SEVERITY: Record<string, number> = {
  EX: 9, EW: 8, RE: 7, CR: 6, EN: 5, VU: 4, NT: 3, DD: 2, LC: 1, NA: 0, NApp: 0, NE: 0,
};

const THREATENED_CODES = ["EX", "EW", "RE", "CR", "EN", "VU", "NT"];

function iucnTone(code: string): StatusTone {
  if (["EX", "EW", "RE", "CR", "EN"].includes(code)) return "danger";
  if (code === "VU" || code === "NT") return "warn";
  return "neutral";
}

function isThreatened(code: string): boolean {
  return THREATENED_CODES.includes(code);
}

function extractAnnexe(label?: string): string {
  if (!label) return "Annexe";
  const m = label.match(/Annexes?\s+([IVX]+(?:\s*(?:et|,|\/|&)\s*[IVX]+)*)/i);
  return m ? `Annexe ${m[1].replace(/\s+/g, " ").trim()}` : "Annexe";
}

const RED_LIST_CATEGORIES: Record<string, string> = {
  LRN: "Liste rouge nationale",
  LRM: "Liste rouge mondiale",
  LRE: "Liste rouge européenne",
  LRR: "Liste rouge régionale",
};

const CATEGORY_ORDER = [
  "Liste rouge nationale",
  "Liste rouge mondiale",
  "Liste rouge européenne",
  "Liste rouge régionale",
  "Protection nationale",
  "Protection régionale",
  "Protection départementale",
  "Directive Habitats",
  "Directive Oiseaux",
  "ZNIEFF déterminante",
  "Plan national d'action",
  "Convention de Berne",
  "Convention de Bonn",
];

function pickWorstRedList(raws: RawAliStatus[]): SpeciesStatus | null {
  let best: RawAliStatus | null = null;
  let bestSeverity = -1;
  for (const s of raws) {
    const code = s.codeStatut ?? "";
    const sev = IUCN_SEVERITY[code] ?? -1;
    if (sev > bestSeverity) {
      bestSeverity = sev;
      best = s;
    }
  }
  if (!best) return null;
  const code = best.codeStatut ?? "";
  return {
    category: RED_LIST_CATEGORIES[best.cdTypeStatut ?? ""] ?? "Liste rouge",
    value: code,
    label: best.labelStatut ?? code,
    tone: iucnTone(code),
    scope: best.lbAdmTr ?? undefined,
    docUrl: best.docUrl ?? undefined,
  };
}

function mapSimpleStatus(raw: RawAliStatus): SpeciesStatus | null {
  const type = raw.cdTypeStatut ?? "";
  const label = raw.labelStatut ?? "";
  const scope = raw.lbAdmTr ?? undefined;
  const docUrl = raw.docUrl ?? undefined;

  switch (type) {
    case "PN":
      return { category: "Protection nationale", value: "Protégée", label, tone: "info", scope, docUrl };
    case "PR":
      return { category: "Protection régionale", value: "Protégée", label, tone: "info", scope, docUrl };
    case "PD":
      return { category: "Protection départementale", value: "Protégée", label, tone: "info", scope, docUrl };
    case "DH":
      return { category: "Directive Habitats", value: extractAnnexe(label), label, tone: "warn", scope, docUrl };
    case "DO":
      return { category: "Directive Oiseaux", value: extractAnnexe(label), label, tone: "warn", scope, docUrl };
    case "BERN":
      return { category: "Convention de Berne", value: extractAnnexe(label), label, tone: "neutral", scope, docUrl };
    case "BONN":
      return { category: "Convention de Bonn", value: extractAnnexe(label), label, tone: "neutral", scope, docUrl };
    case "ZDET":
      return { category: "ZNIEFF déterminante", value: "Déterminante", label: label || "Espèce déterminante ZNIEFF", tone: "warn", scope, docUrl };
    case "PNA":
      return { category: "Plan national d'action", value: "PNA en cours", label: label || "Plan national d'action en cours", tone: "warn", scope, docUrl };
    // Intentionally excluded: SENSNAT/SENSREG (sensibilité de diffusion des
    // données, pas un enjeu de conservation), REGL/REGLSO/REGLII
    // (réglementations diverses — chasse, introduction d'EEE) et exPNA
    // (plan terminé). Hors périmètre d'un pré-diagnostic « espèces à enjeux ».
    default:
      return null;
  }
}

function normalizeStatuses(raws: RawAliStatus[]): SpeciesStatus[] {
  const redListByType = new Map<string, RawAliStatus[]>();
  const others: SpeciesStatus[] = [];
  const seenSimple = new Set<string>();

  for (const raw of raws) {
    const type = raw.cdTypeStatut ?? "";
    if (type in RED_LIST_CATEGORIES) {
      if (type === "LRR" && !isThreatened(raw.codeStatut ?? "")) continue;
      const list = redListByType.get(type) ?? [];
      list.push(raw);
      redListByType.set(type, list);
      continue;
    }
    const mapped = mapSimpleStatus(raw);
    if (!mapped) continue;
    // Presence flags (ZNIEFF, protection, directives, conventions, PNA) repeat
    // across regions/territories — collapse by category+value, drop the scope.
    const key = `${mapped.category}|${mapped.value}`;
    if (seenSimple.has(key)) continue;
    seenSimple.add(key);
    others.push({ ...mapped, scope: undefined });
  }

  const redList: SpeciesStatus[] = [];
  for (const list of Array.from(redListByType.values())) {
    const worst = pickWorstRedList(list);
    if (worst) redList.push(worst);
  }

  return [...redList, ...others].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
}

export async function fetchSpeciesStatuses(scientificName: string): Promise<AliEnrichment | null> {
  const hit = await searchAliTaxon(scientificName);
  if (!hit) return null;

  const raws = await fetchAliStatuts(hit.cdNom);
  return {
    cdNom: hit.cdNom,
    aliUrl: buildTaxonUrl(hit.cdRef ?? hit.cdNom, hit.name),
    statuses: normalizeStatuses(raws),
  };
}
