export type Rol = "admin" | "usuario";
export type TipoUsuario = "student" | "teacher" | "personal_administrator";

export interface Usuario {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Rol;
  type: TipoUsuario;
  type_display?: string;
  course?: string;
  area?: string;
  is_active: boolean;
  is_superuser: boolean;
  /** true si el usuario protegió su cuenta con autenticación de dos factores. */
  mfa_enabled?: boolean;
  date_joined?: string;
  last_login?: string | null;
}

/**
 * Representación mínima de un usuario asignado, tal como la devuelve el
 * backend en los campos anidados `*_detail` (read-only).
 */
export interface AssignedUser {
  id: number;
  username: string;
  full_name: string;
  role: Rol;
  role_display: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

/** Resultado del paso 1 del login (contraseña). */
export type LoginStep =
  | { status: "ok" }
  | { status: "mfa_required"; mfaToken: string };

/** Resultado del login completo expuesto por AuthContext. */
export type LoginOutcome =
  | { status: "ok"; user: Usuario }
  | { status: "mfa_required"; mfaToken: string };

export interface MfaStatus {
  enabled: boolean;
  recovery_codes_remaining: number;
}

export interface MfaSetup {
  /** QR como data URI (SVG) listo para <img src>. */
  qr: string;
  /** Clave para ingreso manual si no se puede escanear. */
  secret: string;
}
