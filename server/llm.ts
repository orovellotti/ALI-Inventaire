import OpenAI from "openai";
import { z } from "zod";
import type { Occurrence } from "@shared/types";
import { fetchSpeciesStatuses, type SpeciesStatus, type Patrimonialite } from "./ali";
import { getNaturaZones, type Zonage } from "./services/geoservices";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const MODEL = "gpt-4o-mini";
const PRIORITY_TEMPERATURE = 0.3;
const REFORMAT_TEMPERATURE = 0.4;
const MAX_SAMPLED_SPECIES = 50;
const MAX_RETURNED_SPECIES = 5;
const NATURA_PROXIMITY_M = 5000;
const NATURA_FETCH_TIMEOUT_MS = 4000;

const PRIORITY_IUCN = new Set(["CR", "EN", "VU", "NT", "DD"]);
const ALLOWED_LEVELS = ["majeur", "fort", "modéré"] as const;

export interface PrioritySpecies {
  scientificName: string;
  vernacularName?: string;
  group: string;
  icon: string;
  reason: string;
  level: (typeof ALLOWED_LEVELS)[number];
  sources: string[];
  inInventory: boolean;
  aliUrl?: string;
  statuses?: SpeciesStatus[];
  patrimonialite?: Patrimonialite;
}

export interface Natura2000Zone {
  type: string;
  name: string;
  url: string | null;
}

export interface PrioritySpeciesAnalysis {
  toponym: string;
  species: PrioritySpecies[];
  natura2000: Natura2000Zone[];
  generatedAt: string;
}

const prioritySpeciesSchema = z.object({
  scientificName: z.string().min(1),
  vernacularName: z.string().optional(),
  group: z.string().optional().default("Autres"),
  icon: z.string().optional().default("🌿"),
  reason: z.string().optional().default(""),
  level: z.enum(ALLOWED_LEVELS).optional().default("modéré"),
  sources: z.array(z.string()).max(5).optional().default([]),
});

const priorityResponseSchema = z.object({
  species: z.array(prioritySpeciesSchema).optional().default([]),
});

const PRIORITY_SYSTEM_PROMPT = `Tu es un expert en écologie française et en pré-diagnostic écologique.
Tu connais les statuts UICN, espèces protégées en France, ZNIEFF déterminantes, directives Habitats/Oiseaux.
Tu réponds en français, concis, opérationnel.`;

const REFORMAT_SYSTEM_PROMPT = `Tu es un écologue rédacteur de notes de pré-diagnostic écologique. Tu rédiges en français professionnel, clair, synthétique, dans un ton neutre et factuel. Tu ne parles jamais d'« étude d'impact » ou « EIE » : il s'agit uniquement d'un pré-diagnostic rapide.`;

function selectRelevantSpecies(occurrences: Occurrence[]): Occurrence[] {
  const uniqueByName = new Map<string, Occurrence>();
  for (const o of occurrences) {
    if (!uniqueByName.has(o.scientificName)) uniqueByName.set(o.scientificName, o);
  }
  const unique = Array.from(uniqueByName.values());

  const high = unique.filter((s) => s.alertLevel === "high");
  const medium = unique.filter((s) => s.alertLevel === "medium");
  const lowPriority = unique.filter(
    (s) => s.alertLevel === "low" && s.iucnStatus && PRIORITY_IUCN.has(s.iucnStatus),
  );

  return [...high, ...medium, ...lowPriority].slice(0, MAX_SAMPLED_SPECIES);
}

function formatSpeciesForPrompt(species: Occurrence[]): string {
  return species
    .map((s) => {
      const parts = [s.scientificName];
      if (s.vernacularName) parts.push(`(${s.vernacularName})`);
      if (s.iucnStatus) parts.push(`UICN:${s.iucnStatus}`);
      if (s.class) parts.push(`[${s.class}]`);
      return parts.join(" ");
    })
    .join("\n");
}

function buildPriorityPrompt(toponym: string, coords: [number, number], sample: string, totalCount: number, natura: Natura2000Zone[]): string {
  const naturaBlock = natura.length > 0
    ? `\nZones Natura 2000 à proximité (rayon ${NATURA_PROXIMITY_M / 1000} km) :\n${natura.map((z) => `- ${z.type} : ${z.name}`).join("\n")}\n`
    : "";
  return `Site : ${toponym} (lat ${coords[0].toFixed(4)}, lng ${coords[1].toFixed(4)})
Inventaire GBIF (${totalCount} espèces) :
${sample}
${naturaBlock}
Identifie les **5 espèces à enjeux les plus importantes** pour un pré-diagnostic écologique de ce site.
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
- N'invente jamais de source, n'utilise que les référentiels officiels français/européens.
- Si des zones Natura 2000 sont listées ci-dessus, tiens-en compte : privilégie les espèces qui justifient leur désignation (Directive Habitats Annexe II/IV, Directive Oiseaux Annexe I) et, le cas échéant, mentionne le site concerné dans "reason".`;
}

function buildReformatPrompt(rawReport: string): string {
  return `Voici les données brutes d'un inventaire flash. Reformule-les en une **note de synthèse partageable** (mail, rapport interne) en français.

Structure attendue :
1. **Contexte** (1-2 phrases) : lieu, date, coordonnées, et **rappelle explicitement la taille du périmètre analysé** (ex : « rayon de 2 000 m autour du point », ou si plusieurs aires : « 3 cercles concentriques de 500 m, 2 000 m et 6 000 m »). Précise les **sources des occurrences : GBIF (Global Biodiversity Information Facility) et iNaturalist** (observations citoyennes vérifiées, grade « research »).
2. **Synthèse des enjeux** (2-4 phrases narratives) : chiffres clés et espèces les plus marquantes — citer en priorité les noms vernaculaires français.
3. **Espèces à enjeux** : liste à puces concise, regroupée par niveau (Forts / Moyens), max 10 espèces par groupe.
4. **Recommandations rapides** (2-3 points opérationnels). Pour **chaque recommandation, cite le fondement factuel** qui l'a inspirée (ex : « présence de 3 espèces classées VU sur la liste rouge UICN France → … », « 12 espèces d'oiseaux dont 4 inscrites à l'Annexe I de la Directive Oiseaux 2009/147/CE → … », « score de confiance modéré (62/100) lié au faible nombre d'observations récentes → compléter par … », « ZNIEFF déterminantes signalées dans l'analyse IA → vérifier auprès du SINP régional… »). N'invente jamais de référentiel ; appuie-toi uniquement sur ce qui apparaît dans les données brutes.
5. **Limites & sources** (1-2 phrases) : pré-diagnostic indicatif, **ne remplace pas un inventaire terrain**. Données issues de **GBIF + iNaturalist + UICN** ; statuts réglementaires cités quand l'analyse IA les a explicités.

Règles strictes :
- Garde le lien Google Maps et le lien de partage tels quels en bas.
- Si une analyse IA est présente dans les données, intègre ses conclusions dans la synthèse ET cite ses sources (référentiels officiels listés dans le bloc « Sources »).
- N'invente aucune espèce, aucun statut, aucun référentiel absent des données brutes.
- Format texte brut, lisible directement dans un mail/chat (pas de Markdown lourd, juste tirets et sauts de ligne).
- 250-400 mots maximum.

Données brutes :
─────────
${rawReport}
─────────`;
}

function normalizePriorityResponse(rawJson: string, inventoryNames: Set<string>): PrioritySpecies[] {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJson);
  } catch {
    return [];
  }

  const result = priorityResponseSchema.safeParse(parsedJson);
  const rawSpecies: unknown[] = result.success
    ? result.data.species
    : Array.isArray((parsedJson as any)?.species)
      ? (parsedJson as any).species
      : [];

  const normalized: PrioritySpecies[] = [];
  for (const raw of rawSpecies) {
    const item = prioritySpeciesSchema.safeParse(raw);
    if (!item.success) continue;
    normalized.push({
      scientificName: item.data.scientificName,
      vernacularName: item.data.vernacularName,
      group: item.data.group,
      icon: item.data.icon,
      reason: item.data.reason,
      level: item.data.level,
      sources: item.data.sources,
      inInventory: inventoryNames.has(item.data.scientificName),
    });
    if (normalized.length >= MAX_RETURNED_SPECIES) break;
  }
  return normalized;
}

async function fetchNaturaZones(coords: [number, number]): Promise<Natura2000Zone[]> {
  try {
    const zones = await Promise.race([
      getNaturaZones(coords[0], coords[1], NATURA_PROXIMITY_M),
      new Promise<Zonage[]>((resolve) => setTimeout(() => resolve([]), NATURA_FETCH_TIMEOUT_MS)),
    ]);
    return zones.map((z) => ({ type: z.type, name: z.name, url: z.url }));
  } catch {
    return [];
  }
}

export async function analyzePrioritySpecies(
  toponym: string,
  coords: [number, number],
  occurrences: Occurrence[],
): Promise<PrioritySpeciesAnalysis> {
  const picked = selectRelevantSpecies(occurrences);
  const sample = formatSpeciesForPrompt(picked);
  const uniqueCount = new Set(occurrences.map((o) => o.scientificName)).size;
  const natura2000 = await fetchNaturaZones(coords);

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: PRIORITY_SYSTEM_PROMPT },
      { role: "user", content: buildPriorityPrompt(toponym, coords, sample, uniqueCount, natura2000) },
    ],
    response_format: { type: "json_object" },
    temperature: PRIORITY_TEMPERATURE,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Réponse LLM vide");

  const inventoryNames = new Set(occurrences.map((o) => o.scientificName));
  const species = normalizePriorityResponse(content, inventoryNames);
  const enriched = await enrichWithAliStatuses(species);

  return {
    toponym,
    species: enriched,
    natura2000,
    generatedAt: new Date().toISOString(),
  };
}

// ALI's AI-powered /taxons/search endpoint cannot handle concurrent requests:
// firing several at once makes them ALL time out. Enrich strictly one-at-a-time.
const ALI_CONCURRENCY = 1;
const ALI_ENRICH_BUDGET_MS = 40000;

async function enrichOne(sp: PrioritySpecies): Promise<PrioritySpecies> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const enrichment = await fetchSpeciesStatuses(sp.scientificName);
      if (!enrichment) return sp;
      return { ...sp, aliUrl: enrichment.aliUrl, statuses: enrichment.statuses, patrimonialite: enrichment.patrimonialite };
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
    }
  }
  return sp;
}

async function enrichAllBatches(species: PrioritySpecies[]): Promise<PrioritySpecies[]> {
  const result: PrioritySpecies[] = [];
  for (let i = 0; i < species.length; i += ALI_CONCURRENCY) {
    const batch = species.slice(i, i + ALI_CONCURRENCY);
    result.push(...(await Promise.all(batch.map(enrichOne))));
  }
  return result;
}

async function enrichWithAliStatuses(species: PrioritySpecies[]): Promise<PrioritySpecies[]> {
  return Promise.race([
    enrichAllBatches(species),
    new Promise<PrioritySpecies[]>((resolve) =>
      setTimeout(() => resolve(species), ALI_ENRICH_BUDGET_MS),
    ),
  ]);
}

export async function reformatReport(rawReport: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: REFORMAT_SYSTEM_PROMPT },
      { role: "user", content: buildReformatPrompt(rawReport) },
    ],
    temperature: REFORMAT_TEMPERATURE,
  });
  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("Réponse LLM vide");
  return content;
}
