export interface CarhabHabitatSummary {
  code: string;
  label: string;
  areaHa: number | null;
  percentage: number | null;
  polygonCount: number;
}

export interface CarhabSummary {
  totalAreaHa: number | null;
  source: string | null;
  featuresFetched: number | null;
  habitats: CarhabHabitatSummary[];
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseJsonPayload(text: string): Record<string, unknown> | null {
  const starts = [text.lastIndexOf("\n{"), text.indexOf("{")].filter((index) => index >= 0);
  for (const start of starts) {
    try {
      const parsed = JSON.parse(text.slice(start + (text[start] === "\n" ? 1 : 0)));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Le résumé humain peut précéder le JSON : on essaie l’autre position.
    }
  }
  return null;
}

function parseTextHabitats(text: string): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const pattern = /^\s*•\s*\[([^\]]+)\]\s*(.+?)\s+—\s+([\d.,]+)\s*ha\s*\(([\d.,]+)%\)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    rows.push({
      code: match[1],
      label: match[2],
      areaHa: match[3].replace(",", "."),
      percentage: match[4].replace(",", "."),
    });
  }
  return rows;
}

export function parseCarhabOutput(text: string): CarhabSummary | null {
  const payload = parseJsonPayload(text);
  const rawHabitats = Array.isArray(payload?.habitats)
    ? payload.habitats.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    : parseTextHabitats(text);
  if (!rawHabitats.length) return null;

  const grouped = new Map<string, CarhabHabitatSummary>();
  for (const raw of rawHabitats) {
    const code = String(raw.code ?? raw.habitatCode ?? "").trim();
    const label = String(raw.label ?? raw.name ?? raw.description ?? "").trim();
    if (!code && !label) continue;
    const key = code ? `code:${normalize(code)}` : `label:${normalize(label)}`;
    const areaHa = finiteNumber(raw.areaHa ?? raw.area_ha ?? raw.surfaceHa);
    const percentage = finiteNumber(raw.percentage ?? raw.percent ?? raw.coveragePercent);
    const current = grouped.get(key);
    grouped.set(key, {
      code: code || current?.code || "—",
      label: label || current?.label || code,
      areaHa: areaHa === null ? current?.areaHa ?? null : (current?.areaHa ?? 0) + areaHa,
      percentage: percentage === null ? current?.percentage ?? null : (current?.percentage ?? 0) + percentage,
      polygonCount: (current?.polygonCount ?? 0) + 1,
    });
  }

  const habitats = Array.from(grouped.values()).sort((a, b) =>
    (b.areaHa ?? -1) - (a.areaHa ?? -1) ||
    (b.percentage ?? -1) - (a.percentage ?? -1) ||
    a.label.localeCompare(b.label, "fr"),
  );
  if (!habitats.length) return null;

  return {
    totalAreaHa: finiteNumber(payload?.totalAreaHa),
    source: typeof payload?.source === "string" ? payload.source : null,
    featuresFetched: finiteNumber(payload?.featuresFetched),
    habitats,
  };
}

export function formatCarhabSummary(summary: CarhabSummary): string {
  const header = summary.totalAreaHa === null
    ? "Analysed area not specified"
    : `Area analysed by CARHAB: ${summary.totalAreaHa.toLocaleString("en-US", { maximumFractionDigits: 2 })} ha`;
  const rows = summary.habitats.map((habitat) => {
    const metrics = [
      habitat.areaHa === null ? null : `${habitat.areaHa.toLocaleString("en-US", { maximumFractionDigits: 2 })} ha`,
      habitat.percentage === null ? null : `${habitat.percentage.toLocaleString("en-US", { maximumFractionDigits: 1 })} %`,
    ].filter(Boolean).join(" · ");
    return `• [${habitat.code}] ${habitat.label}${metrics ? ` — ${metrics}` : ""}`;
  });
  return [header, ...rows].join("\n");
}