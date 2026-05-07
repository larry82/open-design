// @ts-nocheck
import { timingSafeEqual } from 'node:crypto';

export const PUBLIC_VIEWER_STORE_COOKIE = 'od_store_lock';

const PUBLIC_VIEWER_STORE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_VIEWER_API_RE = /^\/api\/design-systems(?:\/|$)/;
const STATIC_ASSET_RE = /\/[^/?]+\.[A-Za-z0-9]+$/;

export function readPublicViewerStore(req) {
  const fromQuery = normalizePublicViewerStore(req?.query?.store);
  if (fromQuery) return fromQuery;
  const cookies = parseCookies(req?.headers?.cookie);
  return normalizePublicViewerStore(cookies[PUBLIC_VIEWER_STORE_COOKIE] ?? null);
}

export function persistPublicViewerStore(req, res, fallbackStore = null) {
  const store = normalizePublicViewerStore(req?.query?.store) ?? normalizePublicViewerStore(fallbackStore);
  if (!store) return null;
  res.cookie(PUBLIC_VIEWER_STORE_COOKIE, store, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return store;
}

export function normalizePublicViewerStore(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !PUBLIC_VIEWER_STORE_RE.test(trimmed)) return null;
  return trimmed;
}

export function filterDesignSystemsForPublicViewer(systems, store) {
  if (!store) return systems;
  return systems.filter((system) => isPublicViewerStoreAllowed(store, system?.id));
}

export function isPublicViewerStoreAllowed(store, id) {
  return !!store && normalizePublicViewerStore(id) === store;
}

export function isReadOnlyMethod(method) {
  return !SAFE_METHODS.has(String(method ?? '').toUpperCase());
}

export function isPublicViewerRequestPathAllowed(pathname) {
  const path = String(pathname ?? '');
  if (path === '/' || path === '/robots.txt' || path === '/favicon.ico') return true;
  if (path.startsWith('/api/')) return PUBLIC_VIEWER_API_RE.test(path);
  return path.startsWith('/_next/') || STATIC_ASSET_RE.test(path);
}

export function isPublicViewerBasicAuthAccepted(authHeader, { username, password }) {
  if (typeof password !== 'string' || password.length === 0) return true;
  const decoded = decodeBasicAuth(authHeader);
  if (!decoded) return false;
  if (username && decoded.username !== username) return false;
  return safeEqual(decoded.password, password);
}

function decodeBasicAuth(authHeader) {
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

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseCookies(raw) {
  const out = {};
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
