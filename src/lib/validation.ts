// Comprehensive input validation and sanitization utilities

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: string;
}

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
  sanitize?: boolean;
}

/**
 * Sanitize string to prevent XSS attacks
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

/**
 * Validate email address with comprehensive checks
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  
  if (!email || email.trim() === '') {
    errors.push('Email is required');
    return { isValid: false, errors };
  }

  // Check for suspicious patterns BEFORE sanitization
  const suspiciousPatterns = [
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
    /<script/i,
    /onload/i,
    /onerror/i
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(email)) {
      errors.push('Email contains suspicious content');
      break;
    }
  }

  const sanitized = sanitizeInput(email);
  
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    errors.push('Invalid email format');
  }

  // Additional security checks
  if (sanitized.length > 254) {
    errors.push('Email address too long');
  }

  if (sanitized.includes('..')) {
    errors.push('Email contains invalid characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validate password strength with comprehensive requirements
 */
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];
  
  if (!password || password.length === 0) {
    errors.push('Password is required');
    return { isValid: false, errors };
  }

  // Length requirements
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }

  // Character requirements
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Security pattern checks
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password cannot contain three or more repeating characters');
  }

  if (/123456|password|qwerty|admin|letmein/i.test(password)) {
    errors.push('Password cannot contain common patterns');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate display name with security checks
 */
export function validateDisplayName(name: string): ValidationResult {
  const errors: string[] = [];
  
  if (!name || name.trim() === '') {
    errors.push('Display name is required');
    return { isValid: false, errors };
  }

  const sanitized = sanitizeInput(name);
  
  if (sanitized.length < 2) {
    errors.push('Display name must be at least 2 characters');
  }

  if (sanitized.length > 50) {
    errors.push('Display name must be less than 50 characters');
  }

  // Only allow letters, numbers, spaces, and basic punctuation
  const allowedChars = /^[a-zA-Z0-9\s\-_.]+$/;
  if (!allowedChars.test(sanitized)) {
    errors.push('Display name contains invalid characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validate OTP/TOTP codes
 */
export function validateOtpCode(code: string): ValidationResult {
  const errors: string[] = [];
  
  if (!code || code.trim() === '') {
    errors.push('Verification code is required');
    return { isValid: false, errors };
  }

  const sanitized = code.replace(/\s/g, ''); // Remove spaces
  
  if (!/^\d+$/.test(sanitized)) {
    errors.push('Verification code must contain only numbers');
  }

  if (sanitized.length !== 6) {
    errors.push('Verification code must be exactly 6 digits');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validate vault entry names and issuers
 */
export function validateVaultEntryName(name: string): ValidationResult {
  const errors: string[] = [];
  
  if (!name || name.trim() === '') {
    errors.push('Entry name is required');
    return { isValid: false, errors };
  }

  const sanitized = sanitizeInput(name);
  
  if (sanitized.length < 1) {
    errors.push('Entry name cannot be empty');
  }

  if (sanitized.length > 100) {
    errors.push('Entry name must be less than 100 characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validate TOTP secret
 */
export function validateTotpSecret(secret: string): ValidationResult {
  const errors: string[] = [];
  
  if (!secret || secret.trim() === '') {
    errors.push('TOTP secret is required');
    return { isValid: false, errors };
  }

  const sanitized = secret.replace(/\s/g, '').toUpperCase();
  
  // Base32 validation
  const base32Regex = /^[A-Z2-7]+=*$/;
  if (!base32Regex.test(sanitized)) {
    errors.push('Invalid TOTP secret format');
  }

  if (sanitized.length < 16) {
    errors.push('TOTP secret must be at least 16 characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Generic validation function with custom rules
 */
export function validateInput(input: string, rules: ValidationRule): ValidationResult {
  const errors: string[] = [];
  
  // Check if required
  if (rules.required && (!input || input.trim() === '')) {
    errors.push('This field is required');
    return { isValid: false, errors };
  }

  // Allow empty validation
  if (rules.allowEmpty && (!input || input.trim() === '')) {
    return { isValid: true, errors: [] };
  }

  const sanitized = rules.sanitize ? sanitizeInput(input) : input.trim();

  // Length validation
  if (rules.minLength && sanitized.length < rules.minLength) {
    errors.push(`Must be at least ${rules.minLength} characters`);
  }

  if (rules.maxLength && sanitized.length > rules.maxLength) {
    errors.push(`Must be less than ${rules.maxLength} characters`);
  }

  // Pattern validation
  if (rules.pattern && !rules.pattern.test(sanitized)) {
    errors.push('Invalid format');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Rate limiting validation
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();

  constructor(private maxAttempts: number = 5, private windowMs: number = 60000) {}

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];
    
    // Remove old attempts outside the window
    const validAttempts = attempts.filter(timestamp => now - timestamp < this.windowMs);
    
    if (validAttempts.length >= this.maxAttempts) {
      return false;
    }

    validAttempts.push(now);
    this.attempts.set(identifier, validAttempts);
    return true;
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

/**
 * Content Security Policy helper
 */
export function getCSPHeader(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required for Next.js dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
}
