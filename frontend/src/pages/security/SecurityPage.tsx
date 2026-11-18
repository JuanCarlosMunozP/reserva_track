import { useCallback, useEffect, useState } from "react";
import { Download, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useAuth } from "../../context/AuthContext";
import { getApiErrorMessage } from "../../lib/api";
import { authService } from "../../services/auth.service";
import type { MfaSetup, MfaStatus } from "../../types/authentication/auth";

const card = "rounded-2xl border border-[#e5eaf1] bg-white p-6 shadow-sm";

/** Sólo dígitos, máx. 6: el código TOTP nunca lleva otra cosa. */
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const download = () => {
    const blob = new Blob(
      [`ReservaTrack - códigos de recuperación (un solo uso cada uno)\n\n${codes.join("\n")}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reservatrack-codigos-recuperacion.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={card}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-[#172b4d]">
        <KeyRound size={18} /> Guarda tus códigos de recuperación
      </h2>
      <p className="mt-1 text-sm text-[#718096]">
        Si pierdes el celular, cada código te permite entrar <strong>una sola vez</strong>.
        Guárdalos en un lugar seguro. <strong>No volverán a mostrarse.</strong>
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[#f4f7fb] p-4 font-mono text-sm tracking-wider text-[#172b4d]">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Download size={14} />} onClick={download}>
          Descargar
        </Button>
        <Button size="sm" onClick={onDone}>
          Ya los guardé
        </Button>
      </div>
    </div>
  );
}

export function SecurityPage() {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "disable" | "regenerate">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await authService.mfaStatus());
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo cargar el estado de seguridad."));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    authService
      .mfaStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch((err) => !cancelled && setError(getApiErrorMessage(err, "No se pudo cargar el estado de seguridad.")));
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(getApiErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSetup(null);
    setCode("");
    setPassword("");
    setMode("idle");
    setError(null);
  };

  const startSetup = () =>
    run(async () => setSetup(await authService.mfaSetup()), "No se pudo iniciar la activación.");

  const confirm = () =>
    run(async () => {
      const codes = await authService.mfaConfirm(code);
      reset();
      setRecovery(codes);
      await Promise.all([load(), refreshUser()]);
    }, "Código inválido");

  const disable = () =>
    run(async () => {
      await authService.mfaDisable(password, code);
      reset();
      await Promise.all([load(), refreshUser()]);
    }, "No se pudo desactivar.");

  const regenerate = () =>
    run(async () => {
      const codes = await authService.mfaRegenerateRecoveryCodes(code);
      reset();
      setRecovery(codes);
      await load();
    }, "Código inválido");

  if (recovery) {
    return (
      <div className="mx-auto max-w-xl">
        <RecoveryCodes codes={recovery} onDone={() => setRecovery(null)} />
      </div>
    );
  }

  const enabled = status?.enabled ?? false;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-[#172b4d]">Seguridad de la cuenta</h1>
        <p className="mt-1 text-sm text-[#718096]">
          La verificación en dos pasos protege tu cuenta aunque alguien conozca tu contraseña:
          además de ella se pide un código que solo genera tu celular.
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={card}>
        <div className="flex items-center gap-3">
          {enabled ? (
            <ShieldCheck className="text-emerald-600" size={28} />
          ) : (
            <ShieldAlert className="text-amber-500" size={28} />
          )}
          <div>
            <h2 className="font-bold text-[#172b4d]">
              Verificación en dos pasos: {status ? (enabled ? "Activada" : "Desactivada") : "…"}
            </h2>
            {enabled && status && (
              <p className="text-xs text-[#718096]">
                Códigos de recuperación disponibles: {status.recovery_codes_remaining}
                {status.recovery_codes_remaining <= 2 && " — considera generar nuevos."}
              </p>
            )}
          </div>
        </div>

        {/* --- Desactivada: activar --- */}
        {status && !enabled && !setup && (
          <div className="mt-4">
            <Button onClick={startSetup} loading={busy}>
              Activar con código QR
            </Button>
          </div>
        )}

        {status && !enabled && setup && (
          <div className="mt-5 space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-[#243247]">
              <li>Instala Google Authenticator, Microsoft Authenticator o Authy en tu celular.</li>
              <li>Escanea este código QR desde la app.</li>
              <li>Escribe aquí el código de 6 dígitos que muestra la app.</li>
            </ol>
            <div className="flex flex-col items-center gap-3 rounded-lg bg-[#f4f7fb] p-4">
              <img src={setup.qr} alt="Código QR para la app autenticadora" className="size-48 rounded bg-white p-2" />
              <details className="text-xs text-[#718096]">
                <summary className="cursor-pointer">¿No puedes escanear? Ingresa la clave manualmente</summary>
                <code className="mt-2 block break-all rounded bg-white px-2 py-1 font-mono text-[#172b4d]">
                  {setup.secret}
                </code>
              </details>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirm();
              }}
              className="space-y-3"
            >
              <Input
                label="Código de verificación"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(digits(e.target.value))}
                required
              />
              <div className="flex gap-2">
                <Button type="submit" loading={busy} disabled={code.length !== 6}>
                  Activar
                </Button>
                <Button type="button" variant="ghost" onClick={reset}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* --- Activada: gestionar --- */}
        {status && enabled && mode === "idle" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMode("regenerate")}>
              Generar nuevos códigos de recuperación
            </Button>
            <Button variant="danger" size="sm" onClick={() => setMode("disable")}>
              Desactivar
            </Button>
          </div>
        )}

        {status && enabled && mode !== "idle" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void (mode === "disable" ? disable() : regenerate());
            }}
            className="mt-4 space-y-3"
          >
            <p className="text-sm text-[#718096]">
              {mode === "disable"
                ? "Por seguridad, confirma tu contraseña y un código vigente de la app."
                : "Confirma con un código vigente de la app. Los códigos anteriores dejarán de funcionar."}
            </p>
            {mode === "disable" && (
              <Input
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
            <Input
              label="Código de la app"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(digits(e.target.value))}
              required
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                variant={mode === "disable" ? "danger" : "primary"}
                loading={busy}
                disabled={code.length !== 6 || (mode === "disable" && !password)}
              >
                {mode === "disable" ? "Desactivar" : "Generar códigos"}
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
