const PUBLIC_VIEWER_STORE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function normalizePublicViewerStore(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !PUBLIC_VIEWER_STORE_RE.test(trimmed)) return null;
  return trimmed;
}

export function readPublicViewerStoreFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return normalizePublicViewerStore(new URLSearchParams(window.location.search).get('store'));
}

export function appendPublicViewerStore(url: string): string {
  const store = readPublicViewerStoreFromLocation();
  if (!store) return url;
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const next = new URL(url, base);
  if (!next.searchParams.has('store')) next.searchParams.set('store', store);
  return next.origin === base
    ? `${next.pathname}${next.search}${next.hash}`
    : next.toString();
}
