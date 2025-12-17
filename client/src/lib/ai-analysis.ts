export interface SpeciesAnalysis {
  scientificName: string;
  vernacularName?: string;
  alertLevel: "high" | "medium" | "low";
  iucnStatus: string;
  protectionStatus: string;
  ecologicalNote: string;
}

export interface InventoryAnalysis {
  species: SpeciesAnalysis[];
  summary: string;
  overallRisk: "high" | "medium" | "low";
}

export async function analyzeSpeciesWithAI(
  species: { scientificName: string; vernacularName?: string }[]
): Promise<InventoryAnalysis> {
  const response = await fetch("/api/analyze-species", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ species }),
  });

  if (!response.ok) {
    throw new Error("AI analysis failed");
  }

  return response.json();
}
