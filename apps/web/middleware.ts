import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = 'better-auth.session_token'

const PUBLIC_PATHS = [
  '/login',
  '/login/two-factor',
  '/signup',
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
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  // API routes: accept Bearer token OR session cookie; never redirect to /login
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ') || request.cookies.get(SESSION_COOKIE)) {
      return NextResponse.next()
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!request.cookies.get(SESSION_COOKIE)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
