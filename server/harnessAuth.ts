import type { NextFunction, Request, RequestHandler, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";

type HarnessUser = {
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
};

type HarnessUserLoader = (userId: string) => Promise<HarnessUser>;
type HarnessUserIdReader = (request: Request) => string | null | undefined;

export function hasHarnessAdminRole(user: HarnessUser): boolean {
  return user.publicMetadata?.role === "admin" || user.privateMetadata?.role === "admin";
}

export function createRequireHarnessAdmin(
  loadUser: HarnessUserLoader = (userId) => clerkClient.users.getUser(userId),
  readUserId: HarnessUserIdReader = (request) => getAuth(request).userId,
): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const userId = readUserId(request);
      if (!userId) {
        response.status(401).json({ error: "Authentification requise." });
        return;
      }
      const user = await loadUser(userId);
      if (!hasHarnessAdminRole(user)) {
        response.status(403).json({ error: "Accès administrateur requis." });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireHarnessAdmin = createRequireHarnessAdmin();