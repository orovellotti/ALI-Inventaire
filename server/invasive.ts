// Détection des espèces exotiques envahissantes (EEE) en France métropolitaine.
//
// Objectif : une espèce exotique (introduite / envahissante) n'a pas de valeur
// patrimoniale de conservation, même si son statut UICN mondial (évalué dans son
// aire d'origine) est défavorable. On la signale et on neutralise sa
// patrimonialité côté interface.
//
// Sources : liste de l'Union européenne (Règlement UE 1143/2014), arrêtés
// français relatifs aux EEE, et espèces ornementales couramment naturalisées.
// Cette liste est volontairement extensible : ajouter un binôme dans
// INVASIVE_SPECIES ou un genre entier dans INVASIVE_GENERA.

// Genres considérés comme exotiques/envahissants en métropole (tous taxons).
const INVASIVE_GENERA = new Set<string>([
  // Flore
  "agave",
  "yucca",
  "opuntia",
  "carpobrotus",
  "cortaderia",
  "reynoutria",
  "fallopia",
  "ludwigia",
  "ambrosia",
  "baccharis",
  "ailanthus",
  "buddleja",
  "elodea",
  "egeria",
  "lagarosiphon",
  "myriophyllum", // aquatique exotique (M. aquaticum / heterophyllum)
  "heracleum",    // H. mantegazzianum
  "lysichiton",
  "gunnera",
  "pueraria",
  "hakea",
  "microstegium",
  "humulus",      // H. scandens
  "cabomba",
  "hydrocotyle",  // H. ranunculoides
  "asclepias",
  "pennisetum",
  "andropogon",   // A. virginicus
]);

// Espèces précises (binôme genre + espèce, en minuscules).
const INVASIVE_SPECIES = new Set<string>([
  // Flore
  "impatiens glandulifera",
  "impatiens balfourii",
  "robinia pseudoacacia",
  "acacia dealbata",
  "acacia mearnsii",
  "prunus laurocerasus",
  "prunus serotina",
  "senecio inaequidens",
  "solidago canadensis",
  "solidago gigantea",
  "aster novi-belgii",
  "bidens frondosa",
  "azolla filiculoides",
  "spartina anglica",
  "sporobolus anglicus",
  "paspalum distichum",
  "lespedeza cuneata",
  "cardiospermum grandiflorum",
  "gymnocoronis spilanthoides",
  "salvinia molesta",
  "pistia stratiotes",
  "eichhornia crassipes",
  "pontederia crassipes",
  "alternanthera philoxeroides",
  "parthenium hysterophorus",
  "triadica sebifera",
  // Faune
  "myocastor coypus",
  "ondatra zibethicus",
  "procyon lotor",
  "nasua nasua",
  "neovison vison",
  "mustela vison",
  "sciurus carolinensis",
  "callosciurus erythraeus",
  "tamias sibiricus",
  "muntiacus reevesi",
  "nyctereutes procyonoides",
  "herpestes javanicus",
  "trachemys scripta",
  "lithobates catesbeianus",
  "rana catesbeiana",
  "xenopus laevis",
  "procambarus clarkii",
  "procambarus virginalis",
  "faxonius limosus",
  "orconectes limosus",
  "pacifastacus leniusculus",
  "eriocheir sinensis",
  "vespa velutina",
  "harmonia axyridis",
  "leptinotarsa decemlineata",
  "corvus splendens",
  "threskiornis aethiopicus",
  "oxyura jamaicensis",
  "alopochen aegyptiaca",
  "myiopsitta monachus",
  "psittacula krameri",
  "perccottus glenii",
  "pseudorasbora parva",
  "lepomis gibbosus",
  "ameiurus melas",
  "silurus glanis",
  "plotosus lineatus",
]);

function normalize(scientificName: string | undefined | null): { genus: string; binomial: string } {
  const cleaned = (scientificName ?? "")
    .toLowerCase()
    .replace(/[×✕]/g, " ")
    .trim()
    .split(/\s+/);
  const genus = cleaned[0] ?? "";
  const binomial = cleaned.slice(0, 2).join(" ");
  return { genus, binomial };
}

export function isInvasiveExotic(scientificName: string | undefined | null): boolean {
  if (!scientificName) return false;
  const { genus, binomial } = normalize(scientificName);
  if (!genus) return false;
  if (INVASIVE_GENERA.has(genus)) return true;
  if (binomial && INVASIVE_SPECIES.has(binomial)) return true;
  return false;
}
