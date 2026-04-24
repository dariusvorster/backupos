import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Cookie name used by better-auth
const SESSION_COOKIE = 'better-auth.session_token'

export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Protect everything except auth routes, static files, and public API endpoints
    '/((?!login|signup|api/auth|api/health|install\\.sh|install\\.ps1|_next|favicon\\.ico|manifest\\.webmanifest|apple-icon|opengraph-image|icon).*)',
  ],
}
