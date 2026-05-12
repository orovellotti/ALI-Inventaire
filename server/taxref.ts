const TAXREF_BASE = "https://taxref.mnhn.fr/api/taxa/search";

const cache = new Map<string, number | null>();

export async function fetchTaxRefCdNom(scientificName: string): Promise<number | undefined> {
  if (!scientificName) return undefined;
  const key = scientificName.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? undefined;

  const binomial = scientificName.trim().split(/\s+/).slice(0, 2).join(" ");
  const params = new URLSearchParams({
    scientificNames: binomial,
    territories: "fr",
    page: "1",
    size: "1",
  });

  try {
    const response = await fetch(`${TAXREF_BASE}?${params.toString()}`, {
      headers: { Accept: "application/hal+json" },
    });
    if (!response.ok) {
      cache.set(key, null);
      return undefined;
    }
    const data = await response.json();
    const taxa: any[] = data?._embedded?.taxa ?? [];
    const first = taxa[0];
    const cdNom: number | undefined =
      first?.referenceId ?? first?.id ?? undefined;
    cache.set(key, typeof cdNom === "number" ? cdNom : null);
    return typeof cdNom === "number" ? cdNom : undefined;
  } catch {
    cache.set(key, null);
    return undefined;
  }
}
