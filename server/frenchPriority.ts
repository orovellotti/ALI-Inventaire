// Familles / ordres / classes considérés comme à enjeux en France métropolitaine
// (protection nationale, Directive Habitats/Oiseaux, ZNIEFF déterminantes)
// Boost à "medium" même si UICN mondial = LC

const PRIORITY_FAMILIES = new Set([
  // Rapaces diurnes
  "Accipitridae", "Falconidae", "Pandionidae",
  // Rapaces nocturnes
  "Strigidae", "Tytonidae",
  // Oiseaux marins, échassiers, ardéidés
  "Ardeidae", "Ciconiidae", "Threskiornithidae", "Phalacrocoracidae", "Sulidae",
  "Procellariidae", "Hydrobatidae", "Laridae", "Sternidae", "Alcidae",
  // Oiseaux protégés emblématiques
  "Alcedinidae", "Upupidae", "Picidae", "Coraciidae", "Meropidae",
  // Galliformes patrimoniaux
  "Tetraonidae", "Phasianidae",
  // Passereaux d'intérêt
  "Hirundinidae", "Sylviidae",
  // Chauves-souris (toutes protégées en France)
  "Vespertilionidae", "Rhinolophidae", "Molossidae", "Miniopteridae",
  // Mammifères patrimoniaux
  "Mustelidae", "Felidae", "Canidae", "Ursidae", "Castoridae",
  // Reptiles & amphibiens (quasi tous protégés)
  "Lacertidae", "Colubridae", "Viperidae", "Natricidae", "Anguidae",
  "Testudinidae", "Emydidae", "Geoemydidae",
  "Ranidae", "Bufonidae", "Hylidae", "Pelobatidae", "Pelodytidae",
  "Salamandridae", "Plethodontidae", "Discoglossidae", "Alytidae",
  // Poissons d'eau douce patrimoniaux
  "Salmonidae", "Petromyzontidae", "Acipenseridae", "Anguillidae",
  // Insectes protégés / patrimoniaux
  "Lucanidae", "Cerambycidae", "Lycaenidae", "Papilionidae",
  "Aeshnidae", "Gomphidae", "Cordulegastridae", "Coenagrionidae",
  "Lestidae", "Calopterygidae", "Libellulidae", "Corduliidae",
  // Plantes patrimoniales
  "Orchidaceae", "Liliaceae", "Iridaceae", "Gentianaceae",
]);

const PRIORITY_ORDERS = new Set([
  "Chiroptera",       // toutes les chauves-souris
  "Squamata",         // lézards & serpents (presque tous protégés en métropole)
  "Testudines",       // tortues
  "Anura", "Caudata", "Urodela", // amphibiens
  "Odonata",          // libellules
]);

const PRIORITY_CLASSES = new Set([
  "Amphibia",
  "Reptilia",
]);

/**
 * Boost le niveau d'enjeu pour les espèces protégées en France
 * que l'UICN mondial classe en LC/DD/NA.
 * Ne dégrade jamais un statut déjà "high".
 */
export function applyFrenchPriorityBoost(
  current: "high" | "medium" | "low",
  family: string | undefined,
  order: string | undefined,
  klass: string | undefined,
): "high" | "medium" | "low" {
  if (current === "high") return current;
  if (family && PRIORITY_FAMILIES.has(family)) return current === "low" ? "medium" : current;
  if (order && PRIORITY_ORDERS.has(order)) return current === "low" ? "medium" : current;
  if (klass && PRIORITY_CLASSES.has(klass)) return current === "low" ? "medium" : current;
  return current;
}

/**
 * Indique si l'espèce appartient à un groupe protégé / patrimonial en France
 * (famille, ordre ou classe), indépendamment de son statut UICN mondial.
 */
export function isFrenchPriority(
  family: string | undefined,
  order: string | undefined,
  klass: string | undefined,
): boolean {
  return (
    (!!family && PRIORITY_FAMILIES.has(family)) ||
    (!!order && PRIORITY_ORDERS.has(order)) ||
    (!!klass && PRIORITY_CLASSES.has(klass))
  );
}
