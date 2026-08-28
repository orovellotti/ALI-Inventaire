import {
  type User,
  type InsertUser,
  type Natura2000Species,
  type ZnieffReferenceMeta,
  type ZnieffSpecies,
  natura2000Species,
  znieffReferenceMeta,
  znieffSpecies,
  harnessConfigs,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import type { HarnessConfig } from "@shared/harness";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getNaturaSpeciesForSites(siteCodes: string[]): Promise<Natura2000Species[]>;
  getZnieffSpeciesForZones(zoneCodes: string[]): Promise<ZnieffSpecies[]>;
  getZnieffReferenceMeta(): Promise<ZnieffReferenceMeta | undefined>;
  getHarnessConfig(): Promise<HarnessConfig | undefined>;
  saveHarnessConfig(config: HarnessConfig): Promise<HarnessConfig>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getNaturaSpeciesForSites(siteCodes: string[]): Promise<Natura2000Species[]> {
    if (siteCodes.length === 0) return [];
    return db
      .select()
      .from(natura2000Species)
      .where(inArray(natura2000Species.siteCode, siteCodes));
  }

  async getZnieffSpeciesForZones(zoneCodes: string[]): Promise<ZnieffSpecies[]> {
    if (zoneCodes.length === 0) return [];
    return db
      .select()
      .from(znieffSpecies)
      .where(inArray(znieffSpecies.zoneCode, zoneCodes));
  }

  async getZnieffReferenceMeta(): Promise<ZnieffReferenceMeta | undefined> {
    const rows = await db
      .select()
      .from(znieffReferenceMeta)
      .where(eq(znieffReferenceMeta.id, "patrinat-znieff"))
      .limit(1);
    return rows[0];
  }

  async getHarnessConfig(): Promise<HarnessConfig | undefined> {
    const rows = await db.select().from(harnessConfigs).where(eq(harnessConfigs.id, "default")).limit(1);
    return rows[0]?.config as HarnessConfig | undefined;
  }

  async saveHarnessConfig(config: HarnessConfig): Promise<HarnessConfig> {
    await db
      .insert(harnessConfigs)
      .values({ id: "default", version: config.version, config, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: harnessConfigs.id,
        set: { version: config.version, config, updatedAt: new Date() },
      });
    return config;
  }
}

export const storage = new MemStorage();
