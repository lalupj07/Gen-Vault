/**
 * Enhanced Security Validation
 * - Stricter password requirements (NIST 2024 guidelines)
 * - Disposable email detection
 * - SQL/NoSQL injection prevention
 * - XSS sanitization
 */

import { z } from 'zod'

// Common disposable email domains (expand this list)
const DISPOSABLE_DOMAINS = [
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
  'getnada.com',
]

// Dangerous patterns for injection attacks
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
  /(--|;|\/\*|\*\/|xp_|sp_)/i,
  /(\bOR\b.*=.*|1=1|'=')/i,
]

const NOSQL_INJECTION_PATTERNS = [
  /\$where/i,
  /\$ne/i,
  /\$gt/i,
  /\$regex/i,
]

const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // onclick, onerror, etc.
]

/**
 * Check if email is from a disposable domain
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return DISPOSABLE_DOMAINS.includes(domain)
}

/**
 * Detect potential SQL injection
 */
export function containsSQLInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input))
}

/**
 * Detect potential NoSQL injection
 */
export function containsNoSQLInjection(input: string): boolean {
  return NOSQL_INJECTION_PATTERNS.some(pattern => pattern.test(input))
}

/**
 * Detect potential XSS
 */
export function containsXSS(input: string): boolean {
  return XSS_PATTERNS.some(pattern => pattern.test(input))
}

/**
 * Sanitize string input
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/['"]/g, '') // Remove quotes
    .substring(0, 1000) // Limit length
}

/**
 * Enhanced email validation schema
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .min(5, 'Email too short')
  .max(254, 'Email too long') // RFC 5321
  .refine((email) => !isDisposableEmail(email), {
    message: 'Disposable email addresses are not allowed',
  })
  .refine((email) => !containsSQLInjection(email), {
    message: 'Invalid email format',
  })
  .transform((email) => email.toLowerCase().trim())

/**
 * Enhanced password validation schema (NIST 2024)
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters') // NIST recommends 12+
  .max(128, 'Password too long')
  .refine((pwd) => /[A-Z]/.test(pwd), {
    message: 'Password must contain at least one uppercase letter',
  })
  .refine((pwd) => /[a-z]/.test(pwd), {
    message: 'Password must contain at least one lowercase letter',
  })
  .refine((pwd) => /[0-9]/.test(pwd), {
    message: 'Password must contain at least one number',
  })
  .refine((pwd) => /[^A-Za-z0-9]/.test(pwd), {
    message: 'Password must contain at least one special character',
  })
  .refine((pwd) => !containsSQLInjection(pwd), {
    message: 'Invalid password format',
  })

/**
 * Name validation schema
 */
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .refine((name) => !containsXSS(name), {
    message: 'Invalid name format',
  })
  .refine((name) => !containsSQLInjection(name), {
    message: 'Invalid name format',
  })
  .transform((name) => sanitizeInput(name))

/**
 * OTP code validation
 */
export const otpSchema = z
  .string()
  .length(6, 'Code must be 6 digits')
  .regex(/^\d{6}$/, 'Code must contain only numbers')

/**
 * Enhanced signup schema
 */
export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
})

/**
 * Enhanced signin schema
 */
export const signinSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

/**
 * Verify email schema
 */
export const verifyEmailSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  code: otpSchema,
  email: emailSchema.optional(),
  name: nameSchema.optional(),
})
