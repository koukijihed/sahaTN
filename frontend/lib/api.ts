export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match?.split('=').slice(1).join('=');
}

const STATE_CHANGING = ['POST', 'PUT', 'PATCH', 'DELETE'];

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (STATE_CHANGING.includes(method)) {
    const csrf = readCookie('sahatn_csrf');
    if (csrf) {
      headers.set('x-csrf-token', csrf);
    }
  }

  return fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'include'
  });
}

export interface ApiUser {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: string[];
  createdAt: string;
}
