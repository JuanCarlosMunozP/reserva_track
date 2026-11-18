/**
 * Banderas de funcionalidad de la aplicación.
 *
 * PUBLIC_REGISTRATION_ENABLED
 *   Registro público de usuarios (formulario /registro).
 */
export const PUBLIC_REGISTRATION_ENABLED = true;

/**
 * DEMO_FALLBACK_ENABLED
 *   Sustituye datos de demostración (localStorage) cuando la API falla o
 *   devuelve una lista vacía. Solo en desarrollo: en producción un error o
 *   una lista vacía se muestran tal cual, nunca como datos inventados.
 */
export const DEMO_FALLBACK_ENABLED: boolean = import.meta.env.DEV;
