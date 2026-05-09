import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = 'better-auth.session_token'

const PUBLIC_PATHS = [
  '/login',
  '/login/two-factor',
  '/signup',
  '/forgot-password',
  '/install.sh',
  '/install.ps1',
  '/manifest.webmanifest',
]

const PUBLIC_PREFIXES = [
  '/api/auth',
  '/api/health',
  '/_next',
  '/agent/',
  '/favicon',
  '/apple-icon',
  '/opengraph-image',
  '/icon',
  '/reset-password/',
]

/**
 * Builds a per-request CSP that uses a nonce for inline scripts.
 * `strict-dynamic` makes browsers trust scripts loaded by nonce'd scripts,
 * which is required for Next.js dynamic chunk loading.
 *
 * `unsafe-eval` is retained because Next.js 15 still uses Function() for
 * some runtime code paths; removing it requires testing every dynamic route.
 *
 * `style-src 'unsafe-inline'` is retained because the codebase has 22
 * inline <style> tags for skeleton animations and component-scoped styles.
 * Tightening style-src is a separate effort.
 */
function buildCSP(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set('Content-Security-Policy', buildCSP(nonce))
  return response
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Generate a fresh nonce for every request. Even if Next short-circuits the
  // request to a static asset, the cost is one randomUUID call (~1 microsecond).
  const nonce = crypto.randomUUID().replace(/-/g, '')

  // Forward the nonce to the rendering layer via request header.
  // Next.js's React server renderer reads it from the headers() function and
  // applies nonce="..." to every <script> tag it emits.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  ) {
    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      nonce,
    )
  }

  // API routes: accept Bearer token OR session cookie; never redirect to /login
  if (pathname.startsWith('/api/')) {
    // Edge runtime has no DB access, so Bearer presence bypasses the /login redirect
    // but does NOT constitute validation. Route handlers must call validateApiToken
    // from @/lib/api-token-auth themselves before treating the request as authenticated.
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ') || request.cookies.get(SESSION_COOKIE)) {
      return applySecurityHeaders(
        NextResponse.next({ request: { headers: requestHeaders } }),
        nonce,
      )
    }
    return applySecurityHeaders(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      nonce,
    )
  }

  if (!request.cookies.get(SESSION_COOKIE)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return applySecurityHeaders(NextResponse.redirect(loginUrl), nonce)
  }
  return applySecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
