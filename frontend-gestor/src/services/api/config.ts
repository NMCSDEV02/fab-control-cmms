const API_URL_KEY = "fab-control.gestor-api-url";
const LEGACY_GESTOR_TOKEN_PERSISTENT_KEY =
  "fab-control.gestor-token-persistent";
const AUTH_SESSION_KEY = "fab-control.gestor-auth-session";

export type ApiTransport = "auto" | "node" | "apps-script";

export function getEnvironmentApiUrl(): string {
  return (
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? ""
  );
}

function readLocalStorage(key: string): string {
  try {
    return window.localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Configuração em memória/ambiente continua disponível quando o storage é bloqueado.
  }
}

function clearLegacyPersistentToken(): void {
  writeLocalStorage(LEGACY_GESTOR_TOKEN_PERSISTENT_KEY, "");
}

export function getApiUrl(): string {
  const fromEnv = getEnvironmentApiUrl();
  if (fromEnv) return fromEnv;
  return readLocalStorage(API_URL_KEY);
}

export function getLegacyApiUrl(): string {
  return (
    (import.meta.env.VITE_APPS_SCRIPT_API_URL as string | undefined)?.trim() ??
    ""
  );
}

export function getApiTransport(): ApiTransport {
  const value = (import.meta.env.VITE_API_TRANSPORT as string | undefined)
    ?.trim()
    .toLowerCase();
  return value === "node" || value === "apps-script" ? value : "auto";
}

export function usesNodeApi(): boolean {
  const transport = getApiTransport();
  if (transport === "node") return true;
  if (transport === "apps-script") return false;
  return !getApiUrl().toLowerCase().includes("script.google.com");
}

export function isApiUrlManagedByEnvironment(): boolean {
  return Boolean(getEnvironmentApiUrl());
}

export function saveApiUrl(value: string): void {
  writeLocalStorage(API_URL_KEY, value.trim());
}

export function getGestorToken(): string {
  clearLegacyPersistentToken();
  try {
    const raw = window.sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return "";
    const value = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown };
    return typeof value.token === "string" && Number(value.expiresAt) > Date.now()
      ? value.token.trim()
      : "";
  } catch {
    return "";
  }
}

/** @deprecated The authenticated session is the sole token authority. */
export function saveGestorToken(_value: string): void {
  clearLegacyPersistentToken();
}

export function clearGestorToken(): void {
  clearLegacyPersistentToken();
  try {
    window.sessionStorage.removeItem("fab-control.gestor-token");
  } catch {
    // A limpeza da sessão continua no chamador.
  }
}

export function hasApiConfiguration(): boolean {
  return Boolean(getApiUrl() && getGestorToken());
}
