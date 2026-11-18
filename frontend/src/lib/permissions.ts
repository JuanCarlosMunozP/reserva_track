import type { Rol, TipoUsuario } from "../types/authentication/auth";

export type Resource =
  | "users"
  | "branches"
  | "spaces"
  | "reservations"
  | "responsibilities";

export type Action = "view" | "create" | "edit" | "delete" | "review";

type Matrix = Record<Rol, Partial<Record<Resource, Action[]>>>;

const matrix: Matrix = {
  admin: {
    users: ["view", "edit"],
    branches: ["view", "create", "edit", "delete"],
    spaces: ["view", "create", "edit", "delete"],
    reservations: ["view", "create", "edit", "review"],
    responsibilities: ["view", "create", "edit", "delete"],
  },
  usuario: {
    users: [],
    branches: ["view"],
    spaces: ["view"],
    reservations: ["view"],
    responsibilities: [],
  },
};

const typeMatrix: Record<TipoUsuario, Partial<Record<Resource, Action[]>>> = {
  student: { reservations: ["create", "edit"] },
  teacher: { reservations: ["create", "edit", "review"], responsibilities: ["view"] },
  personal_administrator: {
    users: ["view"],
    spaces: ["edit"],
    reservations: ["create", "edit"],
    responsibilities: ["view", "create", "edit"],
  },
};

export function can(
  role: Rol | undefined,
  resource: Resource,
  action: Action,
  type?: TipoUsuario,
  isSoftwareEngineer = false,
): boolean {
  if (isSoftwareEngineer) return true;
  if (!role) return false;
  const actions = [
    ...(matrix[role]?.[resource] ?? []),
    ...(type ? typeMatrix[type]?.[resource] ?? [] : []),
  ];
  return actions.includes(action);
}

export const ASSIGNABLE_ROLES: Rol[] = ["admin", "usuario"];

export function canAssignRole(_actorRole: Rol | undefined, targetRole: Rol, isSoftwareEngineer = false): boolean {
  return isSoftwareEngineer && ASSIGNABLE_ROLES.includes(targetRole);
}

type PermissionUser = Pick<import("../types/authentication/auth").Usuario, "role" | "type" | "is_superuser">;

export function canViewUsersPage(user: PermissionUser | null): boolean {
  return !user || user.is_superuser || user.role === "admin";
}

export function canViewResponsibilitiesPage(user: PermissionUser | null): boolean {
  return canViewUsersPage(user) || user?.type === "personal_administrator";
}

export function canManageAllSpaces(user: PermissionUser | null): boolean {
  return !user || user.is_superuser || user.role === "admin";
}

export function canEditAssignedSpaces(user: PermissionUser | null): boolean {
  return Boolean(
    user &&
    user.role === "usuario" &&
    user.type === "personal_administrator",
  );
}

export function canCreateReservation(user: PermissionUser | null): boolean {
  return canManageAllSpaces(user) ||
    (user?.role === "usuario" && (
      user.type === "student" || user.type === "teacher" || user.type === "personal_administrator"
    ));
}

export function canReviewReservations(user: PermissionUser | null): boolean {
  return canManageAllSpaces(user) || (user?.role === "usuario" && user.type === "teacher");
}

export const ROLE_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  usuario: "Usuario",
};

/** Ruta de entrada al panel: el dashboard personal o el general. */
export function panelHome(_role: Rol | undefined): string {
  return "/";
}
