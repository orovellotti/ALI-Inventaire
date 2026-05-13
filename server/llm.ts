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
  sources: string[];
  inInventory: boolean;
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

  const PRIORITY_IUCN = new Set(["CR", "EN", "VU", "NT", "DD"]);
  const high = unique.filter((s) => s.alertLevel === "high");
  const medium = unique.filter((s) => s.alertLevel === "medium");
  const lowPriority = unique
    .filter((s) => s.alertLevel === "low" && s.iucnStatus && PRIORITY_IUCN.has(s.iucnStatus));

  const picked = [...high, ...medium, ...lowPriority].slice(0, 50);

  const sample = picked
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
      "reason": "1 phrase factuelle citant les référentiels (UICN France, Arrêté du 29 oct. 2009, Directive Oiseaux Annexe I, Directive Habitats Annexe II/IV, ZNIEFF déterminante…)",
      "level": "majeur|fort|modéré",
      "sources": ["UICN France 2016", "Arrêté du 29 oct. 2009", "Directive Oiseaux 2009/147/CE Annexe I"]
    }
  ]
}

Règles :
- Exactement 5 espèces, triées par enjeu décroissant.
- "sources" = liste courte (1 à 4) des référentiels cités dans "reason" (ex : "UICN France", "UICN Monde", "Arrêté du 29 oct. 2009", "Arrêté du 23 avr. 2007", "Directive Oiseaux Annexe I", "Directive Habitats Annexe II", "ZNIEFF déterminante", "Liste rouge régionale").
- N'invente jamais de source, n'utilise que les référentiels officiels français/européens.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Réponse LLM vide");

  const parsed = JSON.parse(content);
  const inventoryNames = new Set(unique.map((u) => u.scientificName));
  const species: PrioritySpecies[] = Array.isArray(parsed.species)
    ? parsed.species.slice(0, 5).map((s: any) => {
        const scientificName = String(s.scientificName || "");
        return {
          scientificName,
          vernacularName: s.vernacularName ? String(s.vernacularName) : undefined,
          group: String(s.group || "Autres"),
          icon: String(s.icon || "🌿"),
          reason: String(s.reason || ""),
          level: ["majeur", "fort", "modéré"].includes(s.level) ? s.level : "modéré",
          sources: Array.isArray(s.sources) ? s.sources.map(String).slice(0, 5) : [],
          inInventory: inventoryNames.has(scientificName),
        };
      })
    : [];

  return {
    toponym,
    species,
    generatedAt: new Date().toISOString(),
  };
}
