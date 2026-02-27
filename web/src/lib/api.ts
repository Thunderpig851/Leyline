const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:3001";

const TOKEN_KEY = "accessToken";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export function setAccessToken(token: string) 
{
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() 
{
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit
): Promise<ApiResult<T>>
{
  try
  {
    const token = sessionStorage.getItem("accessToken");
    
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
        error: json?.error || `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: json as T };
  }
  catch (err)
  {
    return { ok: false, error: "Network error. Is the server running?" };
  }
}

