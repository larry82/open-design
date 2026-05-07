import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_VIEWER_STORE_COOKIE = 'od_store_lock';
const PUBLIC_VIEWER_STORE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const STATIC_ASSET_RE = /\/[^/?]+\.[A-Za-z0-9]+$/;

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/robots.txt') {
    return new NextResponse('User-agent: *\nDisallow: /\n', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const publicViewerEnabled =
    process.env.OD_PUBLIC_VIEWER === '1' ||
    !!normalizePublicViewerStore(process.env.OD_PUBLIC_STORE);
  if (!publicViewerEnabled) {
    return NextResponse.next();
  }

  const configuredStore = normalizePublicViewerStore(process.env.OD_PUBLIC_STORE);
  const requestedStore =
    normalizePublicViewerStore(request.nextUrl.searchParams.get('store')) ??
    normalizePublicViewerStore(request.cookies.get(PUBLIC_VIEWER_STORE_COOKIE)?.value);

  if (configuredStore && requestedStore && requestedStore !== configuredStore) {
    return notFound();
  }

  const store = requestedStore ?? configuredStore;
  if (!store) {
    return new NextResponse('public viewer store is not configured', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (!isBasicAuthAccepted(request.headers.get('authorization'))) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'www-authenticate': 'Basic realm="Open Design"',
      },
    });
  }

  if (!isAllowedPath(request.nextUrl.pathname)) {
    return notFound();
  }

  if (
    request.nextUrl.pathname === '/' &&
    request.nextUrl.searchParams.get('store') !== store
  ) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.searchParams.set('store', store);
    return withStoreCookie(NextResponse.redirect(nextUrl), store);
  }

  return withStoreCookie(NextResponse.next(), store);
}

export const config = {
  matcher: '/:path*',
};

function normalizePublicViewerStore(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !PUBLIC_VIEWER_STORE_RE.test(trimmed)) return null;
  return trimmed;
}

function isAllowedPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/favicon.ico') return true;
  return pathname.startsWith('/_next/') || STATIC_ASSET_RE.test(pathname);
}

function isBasicAuthAccepted(authHeader: string | null): boolean {
  const expectedPassword = process.env.OD_BASIC_AUTH_PASSWORD?.trim();
  if (!expectedPassword) return true;
  const expectedUsername = process.env.OD_BASIC_AUTH_USERNAME?.trim();
  const decoded = decodeBasicAuth(authHeader);
  if (!decoded) return false;
  if (expectedUsername && decoded.username !== expectedUsername) return false;
  return decoded.password === expectedPassword;
}

function decodeBasicAuth(authHeader: string | null) {
  if (!authHeader?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(authHeader.slice(6));
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

function withStoreCookie(response: NextResponse, store: string) {
  response.cookies.set(PUBLIC_VIEWER_STORE_COOKIE, store, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}

function notFound() {
  return new NextResponse('not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
