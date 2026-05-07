import { timingSafeEqual } from 'node:crypto';

type StoreQuery = string | string[] | null | undefined;
type RequestLike = {
  query?: { store?: StoreQuery };
  headers?: { cookie?: string | undefined };
};
type ResponseLike = {
  cookie: (name: string, value: string, options: CookieOptions) => unknown;
};
type CookieOptions = {
  httpOnly: boolean;
  sameSite: 'lax';
  path: '/';
};
type DesignSystemSummary = { id?: string | null; [key: string]: unknown };
type BasicAuthOptions = { username?: string | null; password?: string | null };
type BasicAuthDecoded = { username: string; password: string };

export const PUBLIC_VIEWER_STORE_COOKIE = 'od_store_lock';

const PUBLIC_VIEWER_STORE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readPublicViewerStore(req: RequestLike): string | null {
  const fromQuery = normalizePublicViewerStore(req?.query?.store);
  if (fromQuery) return fromQuery;
  const cookies = parseCookies(req?.headers?.cookie);
  return normalizePublicViewerStore(cookies[PUBLIC_VIEWER_STORE_COOKIE] ?? null);
}

export function persistPublicViewerStore(req: RequestLike, res: ResponseLike): string | null {
  const store = normalizePublicViewerStore(req?.query?.store);
  if (!store) return null;
  res.cookie(PUBLIC_VIEWER_STORE_COOKIE, store, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return store;
}

export function normalizePublicViewerStore(raw: StoreQuery): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !PUBLIC_VIEWER_STORE_RE.test(trimmed)) return null;
  return trimmed;
}

export function filterDesignSystemsForPublicViewer(
  systems: DesignSystemSummary[],
  store: string | null,
): DesignSystemSummary[] {
  if (!store) return systems;
  return systems.filter((system) => isPublicViewerStoreAllowed(store, system?.id));
}

export function isPublicViewerStoreAllowed(store: string | null, id: string | null | undefined): boolean {
  return !!store && normalizePublicViewerStore(id) === store;
}

export function isPublicViewerWriteMethod(method: string | null | undefined): boolean {
  return !SAFE_METHODS.has(String(method ?? '').toUpperCase());
}

export function isPublicViewerDesignSystemPathAllowed(
  pathname: string | null | undefined,
  store: string | null,
): boolean {
  if (!store) return true;
  const match = /^\/design-systems\/([^/]+)(?:\/.*)?$/.exec(String(pathname ?? ''));
  if (!match) return true;
  return isPublicViewerStoreAllowed(store, match[1]);
}

export function isPublicViewerBasicAuthAccepted(
  authHeader: string | undefined,
  { username, password }: BasicAuthOptions,
): boolean {
  if (typeof password !== 'string' || password.length === 0) return true;
  const decoded = decodeBasicAuth(authHeader);
  if (!decoded) return false;
  if (username && decoded.username !== username) return false;
  return safeEqual(decoded.password, password);
}

function decodeBasicAuth(authHeader: string | undefined): BasicAuthDecoded | null {
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx === -1) return null;
    return {
      username: decoded.slice(0, idx),
      password: decoded.slice(idx + 1),
    };
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseCookies(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== 'string' || raw.length === 0) return out;
  for (const entry of raw.split(';')) {
    const idx = entry.indexOf('=');
    if (idx === -1) continue;
    const key = entry.slice(0, idx).trim();
    const value = entry.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}
