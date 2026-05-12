import OpenAI from "openai";
import type { Occurrence } from "@shared/types";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export interface PrioritySpecies {
  scientificName: string;
  vernacularName?: string;
  group: string;
  icon: string;
  reason: string;
  level: "majeur" | "fort" | "modéré";
}

export interface PrioritySpeciesAnalysis {
  toponym: string;
  species: PrioritySpecies[];
  generatedAt: string;
}

const SYSTEM_PROMPT = `Tu es un expert en écologie française et études d'impact environnemental (EIE).
Tu connais les statuts UICN, espèces protégées en France, ZNIEFF déterminantes, directives Habitats/Oiseaux.
Tu réponds en français, concis, opérationnel.`;

export async function analyzePrioritySpecies(
  toponym: string,
  coords: [number, number],
  occurrences: Occurrence[]
): Promise<PrioritySpeciesAnalysis> {
  const seen = new Map<string, Occurrence>();
  for (const o of occurrences) {
    if (!seen.has(o.scientificName)) seen.set(o.scientificName, o);
  }
  const unique = Array.from(seen.values());

  const sample = unique
    .filter((s) => s.alertLevel === "high" || s.alertLevel === "medium")
    .slice(0, 60)
    .concat(unique.filter((s) => s.alertLevel === "low").slice(0, 40))
    .map((s) => {
      const parts = [s.scientificName];
      if (s.vernacularName) parts.push(`(${s.vernacularName})`);
      if (s.iucnStatus) parts.push(`UICN:${s.iucnStatus}`);
      if (s.class) parts.push(`[${s.class}]`);
      return parts.join(" ");
    })
    .join("\n");

  const userPrompt = `Site : ${toponym} (lat ${coords[0].toFixed(4)}, lng ${coords[1].toFixed(4)})
Inventaire GBIF (${unique.length} espèces) :
${sample}

Identifie les **5 espèces à enjeux les plus importantes** pour une étude d'impact sur ce site.
Choisis-les en priorité parmi les espèces ci-dessus, mais tu peux ajouter une espèce attendue sur le secteur (connaissance écorégionale) si elle est plus pertinente que la donnée GBIF disponible.

Réponds en JSON strict :
{
  "species": [
    {
      "scientificName": "...",
      "vernacularName": "...",
      "group": "Oiseaux|Mammifères|Reptiles|Amphibiens|Insectes|Plantes|...",
      "icon": "🦅",
      "reason": "1 phrase : statut UICN + protection + raison de l'enjeu local",
      "level": "majeur|fort|modéré"
    }
  ]
}

Exactement 5 espèces, triées par enjeu décroissant.`;

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
  const species: PrioritySpecies[] = Array.isArray(parsed.species)
    ? parsed.species.slice(0, 5).map((s: any) => ({
        scientificName: String(s.scientificName || ""),
        vernacularName: s.vernacularName ? String(s.vernacularName) : undefined,
        group: String(s.group || "Autres"),
        icon: String(s.icon || "🌿"),
        reason: String(s.reason || ""),
        level: ["majeur", "fort", "modéré"].includes(s.level) ? s.level : "modéré",
      }))
    : [];

  return {
    toponym,
    species,
    generatedAt: new Date().toISOString(),
  };
}
