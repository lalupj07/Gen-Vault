// ⚠️ DEAD CODE WARNING ⚠️
// `next.config.js` sets `output: 'export'` for the Tauri desktop build.
// Next.js middleware does NOT run in static-export mode (there is no server
// process — Tauri serves prebuilt static files directly). None of the CSRF
// checks, security headers, or route-protection logic below is active in
// the shipped application. Do not rely on this file for security guarantees;
// equivalent protections must live in `src-tauri/tauri.conf.json` (CSP) and
// the Rust command layer (`src-tauri/src/commands.rs`).
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Protected routes that require authentication
const protectedRoutes = ['/dashboard', '/vault', '/settings']

// Auth routes that should redirect to dashboard if already logged in
const authRoutes = ['/signin', '/signup']

// API routes that need CSRF protection
const csrfProtectedRoutes: string[] = []

export async function middleware(req: NextRequest) {
  const { nextUrl } = req
  const response = NextResponse.next()

  // ===== SECURITY HEADERS =====
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY')
  
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')
  
  // Enable XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block')
  
  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Permissions policy
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  )
  
  // Content Security Policy
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self' data:;
    connect-src 'self';
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
  `.replace(/\s{2,}/g, ' ').trim()
  
  response.headers.set('Content-Security-Policy', cspHeader)
  
  // HSTS (HTTP Strict Transport Security) - only in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  // ===== CSRF PROTECTION FOR API ROUTES =====
  const isApiRoute = csrfProtectedRoutes.some(route => nextUrl.pathname.startsWith(route))
  
  if (isApiRoute && req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin')
    const host = req.headers.get('host')
    
    // Verify origin matches host
    if (origin) {
      const originUrl = new URL(origin)
      if (originUrl.host !== host) {
        return NextResponse.json(
          { error: 'Invalid origin' },
          { status: 403 }
        )
      }
    }
    
    // Check for CSRF token in custom header (for fetch requests)
    const csrfToken = req.headers.get('x-csrf-token')
    const cookieCsrfToken = req.cookies.get('csrf-token')?.value
    
    // For now, we'll rely on SameSite cookies + origin check
    // In production, implement full CSRF token validation
  }

  // ===== AUTHENTICATION CHECKS =====
  // Auth is handled entirely by frontend (localStorage + Tauri keyring)
  // Middleware is dead code in static export mode - only sets security headers
  return response
}

// Configure middleware to run on all routes except static files
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
