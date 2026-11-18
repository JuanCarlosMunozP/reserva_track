import { api } from "../lib/api";
import type {
  LoginRequest,
  LoginStep,
  MfaSetup,
  MfaStatus,
  Usuario,
} from "../types/authentication/auth";

export const authService = {
  async login(data: LoginRequest): Promise<LoginStep> {
    // /auth/token/cookie/ (no /auth/token/): esa otra ruta es la que usa la
    // app móvil y devuelve los tokens en el body. El frontend web necesita
    // la variante que los entrega como cookies httpOnly.
    //
    // Si el usuario tiene MFA activo el backend NO emite cookies: responde un
    // desafío firmado (`mfa_token`) que se canjea en `verifyMfa`.
    const res = await api.post<{ mfa_required?: boolean; mfa_token?: string }>(
      "/auth/token/cookie/",
      data,
    );
    if (res.data?.mfa_required && res.data.mfa_token) {
      return { status: "mfa_required", mfaToken: res.data.mfa_token };
    }
    return { status: "ok" };
  },
  /** Paso 2 del login: código de la app autenticadora o de recuperación. */
  async verifyMfa(mfaToken: string, code: string) {
    await api.post("/auth/mfa/verify/cookie/", { mfa_token: mfaToken, code });
  },
  async me() {
    const res = await api.get<Usuario>("/users/me/");
    return res.data;
  },
  async logout() {
    // Invalida el refresh token en el backend (blacklist) y borra las
    // cookies de sesión. Se ignora cualquier error: el logout local
    // (limpiar estado en memoria) debe funcionar igual aunque el request
    // falle (p. ej. sin conexión).
    await api.post("/auth/token/cookie/logout/").catch(() => undefined);
  },

  // --- Gestión de MFA (usuario autenticado) ---
  async mfaStatus() {
    return (await api.get<MfaStatus>("/auth/mfa/status/")).data;
  },
  async mfaSetup() {
    return (await api.post<MfaSetup>("/auth/mfa/setup/")).data;
  },
  async mfaConfirm(code: string) {
    const res = await api.post<{ recovery_codes: string[] }>("/auth/mfa/confirm/", { code });
    return res.data.recovery_codes;
  },
  async mfaRegenerateRecoveryCodes(code: string) {
    const res = await api.post<{ recovery_codes: string[] }>("/auth/mfa/recovery-codes/", { code });
    return res.data.recovery_codes;
  },
  async mfaDisable(password: string, code: string) {
    await api.post("/auth/mfa/disable/", { password, code });
  },
};
