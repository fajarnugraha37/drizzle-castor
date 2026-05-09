import { AccessDeniedError } from "../errors";
import type { DbAction, Middleware } from "../types";

export function createRbacMiddleware(
  mode: "strict" | "lenient",
): Middleware {
  return async (ctx, next) => {
    const { action, tableName, profile, translatorContext } = ctx;
    const tableConfig = (translatorContext.metadata as any)[tableName];

    if (
      !tableConfig ||
      !tableConfig.profiles ||
      Object.keys(tableConfig.profiles).length === 0
    ) {
      if (mode === "lenient") return next();
      throw new AccessDeniedError(
        `[Access Denied] Table '${tableName}' has no profiles defined in strict mode.`,
      );
    }

    const profilesToCheck = profile
      ? Array.isArray(profile)
        ? profile
        : [profile]
      : ["default"];

    if (profilesToCheck.length === 0) {
      profilesToCheck.push("default");
    }

    let hasAccess = false;
    let missingProfiles: string[] = [];

    for (const profileName of profilesToCheck) {
      const allowedActions = tableConfig.profiles[profileName] as DbAction[];
      if (!allowedActions) {
        missingProfiles.push(profileName);
        continue;
      }
      if (allowedActions.includes(action)) {
        hasAccess = true;
        break;
      }
    }

    if (!hasAccess) {
      const profileStr = profilesToCheck.join(", ");
      if (missingProfiles.length === profilesToCheck.length) {
        throw new AccessDeniedError(
          `[Access Denied] None of the profiles '${profileStr}' are defined for table '${tableName}'.`,
        );
      }
      throw new AccessDeniedError(
        `[Access Denied] Action '${action}' is denied for profiles '${profileStr}' on table '${tableName}'.`,
      );
    }

    return next();
  };
}