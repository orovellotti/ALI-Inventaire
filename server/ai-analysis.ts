import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

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

export async function analyzeSpecies(speciesList: { scientificName: string; vernacularName?: string }[]): Promise<InventoryAnalysis> {
  const speciesNames = speciesList.map(s => `${s.scientificName}${s.vernacularName ? ` (${s.vernacularName})` : ''}`).join('\n');

  const prompt = `Tu es un expert écologue français. Analyse cette liste d'espèces observées et évalue leur niveau d'enjeu écologique.

ESPÈCES OBSERVÉES:
${speciesNames}

Pour chaque espèce, détermine:
1. Le statut IUCN (CR, EN, VU, NT, LC, DD, NE)
2. Le niveau d'enjeu: "high" (espèce protégée/menacée), "medium" (quasi-menacée ou à surveiller), "low" (commune)
3. Le statut de protection en France (protégée nationalement, régionalement, Natura 2000, etc.)
4. Une courte note écologique (max 50 caractères)

Réponds UNIQUEMENT en JSON valide avec ce format exact:
{
  "species": [
    {
      "scientificName": "Nom latin",
      "vernacularName": "Nom français",
      "alertLevel": "high|medium|low",
      "iucnStatus": "XX",
      "protectionStatus": "Statut de protection",
      "ecologicalNote": "Note courte"
    }
  ],
  "summary": "Résumé en 2-3 phrases des enjeux principaux du site",
  "overallRisk": "high|medium|low"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from AI");
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    if (content.includes("```json")) {
      jsonStr = content.split("```json")[1].split("```")[0];
    } else if (content.includes("```")) {
      jsonStr = content.split("```")[1].split("```")[0];
    }

    const analysis = JSON.parse(jsonStr.trim()) as InventoryAnalysis;
    return analysis;
  } catch (error) {
    console.error("AI Analysis error:", error);
    // Return a fallback analysis
    return {
      species: speciesList.map(s => ({
        scientificName: s.scientificName,
        vernacularName: s.vernacularName,
        alertLevel: "low" as const,
        iucnStatus: "NE",
        protectionStatus: "Non déterminé",
        ecologicalNote: "Analyse IA indisponible"
      })),
      summary: "L'analyse IA n'a pas pu être effectuée. Les données affichées sont basiques.",
      overallRisk: "low"
    };
  }
}
