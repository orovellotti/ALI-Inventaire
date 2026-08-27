import type { BufferCircle, InventoryResult, PotentialSpeciesResult } from "@shared/types";
import type { ProjectPolygon } from "./shapefile";
import type { ZonagesData } from "./zonages";

const DATABASE_NAME = "inventaire-flash";
const DATABASE_VERSION = 1;
const STORE_NAME = "conversations";
const UPDATED_AT_INDEX = "updatedAt";
const MAX_CONVERSATIONS = 20;
const tombstones = new Set<string>();
let mutationQueue: Promise<void> = Promise.resolve();

export type AnalysisConversationStatus =
  | "draft"
  | "running"
  | "partial"
  | "complete"
  | "failed";

/** Erreurs lisibles, indexées par le nom de l'agent ayant échoué. */
export interface AnalysisAgentErrors {
  [agentName: string]: string | undefined;
}

export interface AnalysisConversationParameters {
  toponym: string;
  center: [number, number];
  circles: BufferCircle[];
  activePresetId: string;
  activeTaxonFilters: string[];
  excludeMarine: boolean;
  includeINaturalist: boolean;
  /** Données GeoJSON uniquement : cette structure peut être stockée dans IndexedDB. */
  projectPolygon: ProjectPolygon | null;
}

export interface AnalysisConversationResults {
  inventory: InventoryResult | null;
  zonages: ZonagesData | null;
  potentialSpecies: PotentialSpeciesResult | null;
}

/** Format persistant versionné de l'historique local. */
export interface AnalysisConversation {
  version: 1;
  id: string;
  title: string;
  status: AnalysisConversationStatus;
  parameters: AnalysisConversationParameters;
  results: AnalysisConversationResults;
  agentErrors: AnalysisAgentErrors;
  createdAt: string;
  updatedAt: string;
}

function storageError(detail?: string): Error {
  return new Error(
    `L'historique local des analyses est indisponible${detail ? ` : ${detail}` : "."}`,
  );
}

function getIndexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw storageError("IndexedDB n'est pas pris en charge par ce navigateur");
  }
  return indexedDB;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = getIndexedDb().open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      reject(storageError("IndexedDB ne peut pas être ouvert"));
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains(UPDATED_AT_INDEX)) {
        store.createIndex(UPDATED_AT_INDEX, "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError("IndexedDB n'a pas pu être ouvert"));
    request.onblocked = () => reject(storageError("IndexedDB est bloqué par un autre onglet"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError("une opération de stockage a échoué"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(storageError("une opération de stockage a échoué"));
    transaction.onabort = () => reject(storageError("une opération de stockage a été annulée"));
  });
}

/**
 * IndexedDB sérialise déjà les transactions, mais cette file protège aussi les
 * décisions read-before-write prises côté client. La branche de rejet garantit
 * qu'une mutation en erreur ne bloque jamais la suivante.
 */
function enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const queued = mutationQueue.then(mutation, mutation);
  mutationQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/,
  );
  if (!match) return false;
  const [, year, month, day, hours, minutes, seconds, offsetHours, offsetMinutes] = match;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  return numericMonth >= 1 && numericMonth <= 12 &&
    numericDay >= 1 && numericDay <= new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate() &&
    Number(hours) <= 23 && Number(minutes) <= 59 && Number(seconds) <= 59 &&
    (offsetHours === undefined || (Number(offsetHours) <= 23 && Number(offsetMinutes) <= 59)) &&
    !Number.isNaN(Date.parse(value));
}

function isCircle(value: unknown): value is BufferCircle {
  return isObject(value) &&
    typeof value.id === "string" &&
    isCoordinate(value.center) &&
    isFiniteNumber(value.radius) &&
    typeof value.label === "string" &&
    typeof value.enabled === "boolean";
}

function isProjectPolygon(value: unknown): value is ProjectPolygon | null {
  if (value === null) return true;
  return isObject(value) &&
    isObject(value.geojson) &&
    isCoordinate(value.centroid) &&
    Array.isArray(value.bounds) &&
    value.bounds.length === 2 &&
    isCoordinate(value.bounds[0]) &&
    isCoordinate(value.bounds[1]) &&
    typeof value.name === "string";
}

function isInventoryResult(value: unknown): value is InventoryResult {
  if (!isObject(value) || !Array.isArray(value.occurrences) || !isObject(value.stats) ||
    !isCoordinate(value.center) || !Array.isArray(value.circles) ||
    !value.circles.every(isCircle) || !isObject(value.confidence)) {
    return false;
  }
  return isFiniteNumber(value.stats.total) &&
    isFiniteNumber(value.stats.speciesCount) &&
    isFiniteNumber(value.stats.sensitiveCount) &&
    isFiniteNumber(value.confidence.total);
}

function isZonagesData(value: unknown): value is ZonagesData {
  return isObject(value) &&
    isFiniteNumber(value.lat) &&
    isFiniteNumber(value.lng) &&
    isFiniteNumber(value.radius) &&
    isFiniteNumber(value.count) &&
    Array.isArray(value.groups) &&
    Array.isArray(value.errors);
}

function isPotentialSpeciesResult(value: unknown): value is PotentialSpeciesResult {
  return isObject(value) &&
    Array.isArray(value.species) &&
    isFiniteNumber(value.observedCount) &&
    isFiniteNumber(value.potentialCount) &&
    isFiniteNumber(value.evaluatedCount) &&
    isFiniteNumber(value.siteCount) &&
    isFiniteNumber(value.habitatCount) &&
    isObject(value.znieff);
}

function isValidConversation(value: unknown): value is AnalysisConversation {
  if (!isObject(value) || value.version !== 1 ||
    typeof value.id !== "string" || !value.id ||
    typeof value.title !== "string" || value.title.trim().length < 1 || value.title.trim().length > 120 ||
    !["draft", "running", "partial", "complete", "failed"].includes(String(value.status)) ||
    !isValidIsoDate(value.createdAt) || !isValidIsoDate(value.updatedAt) ||
    !isObject(value.parameters) || !isObject(value.results) || !isObject(value.agentErrors)) {
    return false;
  }

  const parameters = value.parameters;
  const results = value.results;
  return typeof parameters.toponym === "string" &&
    isCoordinate(parameters.center) &&
    Array.isArray(parameters.circles) && parameters.circles.every(isCircle) &&
    typeof parameters.activePresetId === "string" &&
    Array.isArray(parameters.activeTaxonFilters) &&
    parameters.activeTaxonFilters.every((filter) => typeof filter === "string") &&
    typeof parameters.excludeMarine === "boolean" &&
    typeof parameters.includeINaturalist === "boolean" &&
    isProjectPolygon(parameters.projectPolygon) &&
    (results.inventory === null || isInventoryResult(results.inventory)) &&
    (results.zonages === null || isZonagesData(results.zonages)) &&
    (results.potentialSpecies === null || isPotentialSpeciesResult(results.potentialSpecies)) &&
    Object.values(value.agentErrors).every((error) => typeof error === "string");
}

function sortByMostRecent(conversations: AnalysisConversation[]): AnalysisConversation[] {
  return conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Liste les conversations valides, de la plus récemment modifiée à la plus ancienne. */
export async function listAnalysisConversations(): Promise<AnalysisConversation[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const values = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    await transactionDone(transaction);
    return sortByMostRecent(values.filter(isValidConversation));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("L'historique local")) throw error;
    throw storageError("la lecture a échoué");
  } finally {
    database.close();
  }
}

/** Renvoie null lorsqu'aucune conversation valide ne correspond à cet identifiant. */
export async function getAnalysisConversation(id: string): Promise<AnalysisConversation | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const value = await requestResult(transaction.objectStore(STORE_NAME).get(id));
    await transactionDone(transaction);
    return isValidConversation(value) ? value : null;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("L'historique local")) throw error;
    throw storageError("la lecture a échoué");
  } finally {
    database.close();
  }
}

/** Enregistre la conversation et supprime les entrées les plus anciennes au-delà de 20. */
export async function saveAnalysisConversation(conversation: AnalysisConversation): Promise<void> {
  if (!isValidConversation(conversation)) {
    throw new Error("La conversation d'analyse à enregistrer est invalide.");
  }
  if (tombstones.has(conversation.id)) return;

  return enqueueMutation(async () => {
    if (tombstones.has(conversation.id)) return;
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const persisted = await requestResult(store.get(conversation.id));
      if (isValidConversation(persisted) && persisted.updatedAt > conversation.updatedAt) {
        await transactionDone(transaction);
        return;
      }

      store.put(conversation);
      const allValues = await requestResult(store.getAll());
      const valid = allValues.filter(isValidConversation);
      for (const invalid of allValues.filter((value) => !isValidConversation(value))) {
        if (isObject(invalid) && typeof invalid.id === "string") store.delete(invalid.id);
      }
      for (const outdated of sortByMostRecent(valid).slice(MAX_CONVERSATIONS)) {
        store.delete(outdated.id);
      }
      await transactionDone(transaction);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("L'historique local")) throw error;
      throw storageError("l'enregistrement a échoué");
    } finally {
      database.close();
    }
  });
}

export async function deleteAnalysisConversation(id: string): Promise<void> {
  tombstones.add(id);
  return enqueueMutation(async () => {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      await transactionDone(transaction);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("L'historique local")) throw error;
      throw storageError("la suppression a échoué");
    } finally {
      database.close();
    }
  });
}

export async function renameAnalysisConversation(id: string, title: string): Promise<AnalysisConversation> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle || trimmedTitle.length > 120) {
    throw new Error("Le titre de la conversation doit contenir entre 1 et 120 caractères.");
  }

  return enqueueMutation(async () => {
    if (tombstones.has(id)) throw new Error("La conversation d'analyse est introuvable.");
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const conversation = await requestResult(store.get(id));
      if (!isValidConversation(conversation)) {
        transaction.abort();
        throw new Error("La conversation d'analyse est introuvable.");
      }
      const renamed: AnalysisConversation = {
        ...conversation,
        title: trimmedTitle,
        updatedAt: new Date().toISOString(),
      };
      store.put(renamed);
      await transactionDone(transaction);
      return renamed;
    } catch (error) {
      if (error instanceof Error &&
        (error.message.startsWith("L'historique local") || error.message === "La conversation d'analyse est introuvable.")) {
        throw error;
      }
      throw storageError("le renommage a échoué");
    } finally {
      database.close();
    }
  });
}

export function createAnalysisConversationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `analysis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}