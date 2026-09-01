import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";

type HarnessUser = {
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
};

type HarnessUserLoader = (userId: string) => Promise<HarnessUser>;
type HarnessUserIdReader = (request: Request) => string | null | undefined;

export type HarnessAccess = {
  signedIn: boolean;
  canManage: boolean;
};

export function configuredAdminIds(value = process.env.HARNESS_ADMIN_USER_IDS): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function hasHarnessAdminRole(user: HarnessUser): boolean {
  return user.publicMetadata?.role === "admin" || user.privateMetadata?.role === "admin";
}

export function isHarnessAdmin(
  userId: string,
  user: HarnessUser,
  adminIds = configuredAdminIds(),
): boolean {
  return adminIds.has(userId) || hasHarnessAdminRole(user);
}

export async function getHarnessAccess(req: Request): Promise<HarnessAccess> {
  const { userId } = getAuth(req);
  if (!userId) return { signedIn: false, canManage: false };

  const adminIds = configuredAdminIds();
  if (adminIds.has(userId)) return { signedIn: true, canManage: true };

  const user = await clerkClient.users.getUser(userId);
  return { signedIn: true, canManage: isHarnessAdmin(userId, user, adminIds) };
}

export function createRequireHarnessAdmin(
  loadUser: HarnessUserLoader = (userId) => clerkClient.users.getUser(userId),
  readUserId: HarnessUserIdReader = (request) => getAuth(request).userId,
  adminIds = configuredAdminIds(),
): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const userId = readUserId(request);
      if (!userId) {
        response.status(401).json({
          error: "Connexion administrateur requise pour modifier le Harnais.",
        });
        return;
      }
      if (!adminIds.has(userId)) {
        const user = await loadUser(userId);
        if (!isHarnessAdmin(userId, user, adminIds)) {
          response.status(403).json({
            error: "Votre compte n’est pas autorisé à administrer le Harnais.",
          });
          return;
        }
      }
      next();
    } catch (error) {
      console.error("[harness] administrator verification failed:", error);
      response.status(503).json({
        error: "Vérification des droits d’administration temporairement indisponible.",
      });
    }
  };
}

export const requireHarnessAdmin = createRequireHarnessAdmin();