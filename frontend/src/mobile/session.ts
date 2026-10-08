/** Sync workspace/token for frappe-js-sdk and apiFetch. */
let workspace: string | null = null;
let token: string | null = null;

export function getWorkspace(): string | null {
  return workspace;
}

export function setWorkspaceMem(url: string | null): void {
  workspace = url;
}

export function getToken(): string | null {
  return token;
}

export function setTokenMem(value: string | null): void {
  token = value;
}

export function authHeader(): string | null {
  return token ? `TaxMate ${token}` : null;
}
