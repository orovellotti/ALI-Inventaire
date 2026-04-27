import OpenAI from "openai";
import type { Occurrence } from "@shared/types";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export interface PrioritySpeciesAnalysis {
  toponym: string;
  summary: string;
  priorityGroups: Array<{
    group: string;
    icon: string;
    species: Array<{
      scientificName: string;
      vernacularName?: string;
      reason: string;
      level: "majeur" | "fort" | "modéré";
    }>;
  }>;
  recommendations: string[];
  generatedAt: string;
}

const SYSTEM_PROMPT = `Tu es un expert en écologie et biodiversité française, spécialisé dans les études d'impact environnemental (EIE).
Tu analyses les inventaires GBIF d'un site donné et identifies les espèces à enjeux de conservation.
Tu connais les statuts UICN, les espèces protégées en France (arrêtés ministériels), les listes rouges régionales,
les ZNIEFF déterminantes, et les enjeux liés aux directives Habitats et Oiseaux.
Tu réponds toujours en français, de manière concise et opérationnelle pour un bureau d'études EIE.`;

export async function analyzePrioritySpecies(
  toponym: string,
  coords: [number, number],
  occurrences: Occurrence[]
): Promise<PrioritySpeciesAnalysis> {
  const speciesMap = new Map<string, Occurrence>();
  for (const o of occurrences) {
    if (!speciesMap.has(o.scientificName)) speciesMap.set(o.scientificName, o);
  }
  const uniqueSpecies = Array.from(speciesMap.values());

  const sensitiveOnly = uniqueSpecies
    .filter((s) => s.alertLevel === "high" || s.alertLevel === "medium")
    .slice(0, 80);

  const otherSample = uniqueSpecies
    .filter((s) => s.alertLevel === "low")
    .slice(0, 40);

  const speciesList = [...sensitiveOnly, ...otherSample]
    .map((s) => {
      const parts = [s.scientificName];
      if (s.vernacularName) parts.push(`(${s.vernacularName})`);
      if (s.iucnStatus) parts.push(`UICN:${s.iucnStatus}`);
      if (s.class) parts.push(`[${s.class}]`);
      return parts.join(" ");
    })
    .join("\n");

  const userPrompt = `Site analysé : ${toponym} (lat ${coords[0].toFixed(4)}, lng ${coords[1].toFixed(4)})
Nombre total d'espèces inventoriées (GBIF) : ${uniqueSpecies.length}

Espèces relevées (extrait priorisé sur les statuts sensibles) :
${speciesList}

Identifie les ESPÈCES À ENJEUX de conservation pertinentes pour une étude d'impact environnemental sur ce site.
Pour chaque espèce retenue, indique :
- son nom scientifique et vernaculaire
- la raison de l'enjeu (statut UICN, protection nationale, directive Habitats/Oiseaux, espèce déterminante ZNIEFF, vulnérabilité régionale…)
- le niveau d'enjeu : "majeur", "fort" ou "modéré"

Regroupe par groupe taxonomique (Oiseaux, Mammifères, Reptiles, Amphibiens, Insectes, Plantes, etc.).
Ajoute 2 à 4 recommandations opérationnelles courtes pour l'étude (inventaires complémentaires, périodes sensibles, mesures à anticiper).
Réponds en JSON strict suivant ce schéma :
{
  "summary": "2-3 phrases sur le contexte écologique global du site",
  "priorityGroups": [
    {
      "group": "Oiseaux",
      "icon": "🦅",
      "species": [
        {"scientificName": "...", "vernacularName": "...", "reason": "...", "level": "majeur|fort|modéré"}
      ]
    }
  ],
  "recommendations": ["...", "..."]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Réponse LLM vide");

  const parsed = JSON.parse(content);

  return {
    toponym,
    summary: parsed.summary || "",
    priorityGroups: Array.isArray(parsed.priorityGroups) ? parsed.priorityGroups : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    generatedAt: new Date().toISOString(),
  };
}
