const configuredApiBase = import.meta.env.VITE_API_URL?.trim();
const API_BASE = configuredApiBase ? configuredApiBase.replace(/\/$/, "") : "";

const TOKEN_KEY = "accessToken";
const USERNAME_KEY = "username";
const USER_ID_KEY = "userId";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export function setAuthSession(
  token: string,
  user: { id: string; username: string }
)
{
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USERNAME_KEY, user.username);
  sessionStorage.setItem(USER_ID_KEY, user.id);
}

export function clearAuthSession()
{
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USERNAME_KEY);
  sessionStorage.removeItem(USER_ID_KEY);
}

export function getStoredAccessToken()
{
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername()
{
  return sessionStorage.getItem(USERNAME_KEY);
}

export function getStoredUserId()
{
  return sessionStorage.getItem(USER_ID_KEY);
}

function buildErrorMessage(error?: string | null, status?: number)
{
  const rawMessage = String(error || "").trim();
  const normalized = rawMessage.toLowerCase();
  const isAuthError =
    status === 401
    || status === 403
    || normalized.includes("invalid token")
    || normalized.includes("jwt expired")
    || normalized.includes("missing token")
    || normalized.includes("unauthorized")
    || normalized.includes("forbidden");

  if (isAuthError)
  {
    return "Please log in to continue.";
  }

  return rawMessage || (status ? `Request failed (${status})` : "Request failed.");
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit
): Promise<ApiResult<T>>
{
  try
  {
    const token = getStoredAccessToken();

    const res = await fetch(`${API_BASE}${path}`,
    {
      method: init?.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      body: JSON.stringify(body),
      ...init,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok)
    {
      return {
        ok: false,
        status: res.status,
        error: buildErrorMessage(json?.error, res.status),
      };
    }

    return { ok: true, data: json as T };
  }
  catch
  {
    return { ok: false, error: "Network error. Is the server running?" };
  }
}

export async function apiGet<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>>
{
  try
  {
    const token = getStoredAccessToken();

    const res = await fetch(`${API_BASE}${path}`,
    {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      ...init,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok)
    {
      return {
        ok: false,
        status: res.status,
        error: buildErrorMessage(json?.error, res.status),
      };
    }

    return { ok: true, data: json as T };
  }
  catch
  {
    return { ok: false, error: "Network error. Is the server running?" };
  }
}

export function isAuthErrorMessage(error?: string | null)
{
  const normalized = String(error || "").toLowerCase();

  return normalized.includes("invalid token")
    || normalized.includes("jwt expired")
    || normalized.includes("missing token")
    || normalized.includes("unauthorized")
    || normalized.includes("forbidden")
    || normalized.includes("please log in")
    || normalized.includes("log in to continue");
}

export function isNetworkErrorMessage(error?: string | null)
{
  return String(error || "").toLowerCase().includes("network error");
}

export function isPrivateCodeErrorMessage(error?: string | null)
{
  return String(error || "").toLowerCase().includes("private room code");
}

export function isMissingRoomErrorMessage(error?: string | null)
{
  const normalized = String(error || "").toLowerCase();
  return normalized.includes("room not found") || normalized.includes("private room not found");
}
