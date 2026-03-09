// Prefer explicit base URL for deployments; fall back to current host + port.
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  `${window.location.protocol}//${window.location.hostname}:${(import.meta as any).env?.VITE_API_PORT || '4000'}`;

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

function getToken(): string | null {
  try {
    const stored = localStorage.getItem('user');
    if (stored) {
      const user = JSON.parse(stored);
      return user.token || null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

export async function api(path: string, options: ApiOptions = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
    body:
      options.body !== undefined && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : (options.body as BodyInit | null | undefined),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch (e) {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export { API_BASE };
