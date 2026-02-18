const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:3001";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit
): Promise<ApiResult<T>> 
{
  try 
  {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
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
  catch (e) 
  {
    return { ok: false, error: "Network error. Is the server running?" };
  }
}
