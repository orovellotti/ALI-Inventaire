export function summarizeApiResponse(body: unknown): string | undefined {
  if (Array.isArray(body)) return `items=${body.length}`;
  if (!body || typeof body !== "object") return undefined;

  const record = body as Record<string, unknown>;
  for (const key of ["occurrences", "results", "features", "items"]) {
    const value = record[key];
    if (Array.isArray(value)) return `items=${value.length}`;
  }

  return undefined;
}