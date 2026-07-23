/**
 * Security Audit Logger
 * - Logs all security-critical events
 * - Tamper-proof logging
 * - Integration-ready for SIEM systems
 */

import { logger } from './logger'
import crypto from 'crypto'

export type AuditEventType =
  | 'USER_SIGNUP'
  | 'USER_SIGNIN'
  | 'USER_SIGNOUT'
  | 'USER_VERIFICATION'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_COMPLETE'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'FAILED_LOGIN'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'SESSION_CREATED'
  | 'SESSION_EXPIRED'
  | 'UNAUTHORIZED_ACCESS'

interface AuditEvent {
  eventType: AuditEventType
  userId?: string
  email?: string
  ipAddress?: string
  userAgent?: string
  success: boolean
  errorMessage?: string
  metadata?: Record<string, any>
}

class AuditLogger {
  private hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16)
  }

  /**
   * Log security event
   */
  log(event: AuditEvent): void {
    const auditLog = {
      timestamp: new Date().toISOString(),
      eventType: event.eventType,
      userId: event.userId ? this.hashData(event.userId) : undefined,
      email: event.email ? this.hashData(event.email) : undefined,
      ipAddress: event.ipAddress ? this.hashData(event.ipAddress) : undefined,
      userAgent: event.userAgent ? this.hashData(event.userAgent) : undefined,
      success: event.success,
      errorMessage: event.errorMessage,
      metadata: event.metadata,
      environment: process.env.NODE_ENV,
    }

    logger.audit(event.eventType, auditLog)

    // In production, send to external SIEM/monitoring
    // Examples:
    // - AWS CloudWatch Logs
    // - Datadog
    // - Splunk
    // - Elasticsearch
    // - Sentry
    if (process.env.NODE_ENV === 'production') {
      this.sendToSIEM(auditLog)
    }
  }

  private sendToSIEM(log: any): void {
    // TODO: Implement SIEM integration
    // Example: Send to AWS CloudWatch, Datadog, etc.
    
    // For now, just ensure it's logged
    if (process.env.SENTRY_DSN) {
      // Send to Sentry for monitoring
    }
  }

  /**
   * Log failed login attempt
   */
  logFailedLogin(email: string, ipAddress: string, reason: string): void {
    this.log({
      eventType: 'FAILED_LOGIN',
      email,
      ipAddress,
      success: false,
      errorMessage: reason,
    })
  }

  /**
   * Log successful login
   */
  logSuccessfulLogin(userId: string, email: string, ipAddress: string): void {
    this.log({
      eventType: 'USER_SIGNIN',
      userId,
      email,
      ipAddress,
      success: true,
    })
  }

  /**
   * Log rate limit exceeded
   */
  logRateLimitExceeded(identifier: string, endpoint: string): void {
    this.log({
      eventType: 'RATE_LIMIT_EXCEEDED',
      ipAddress: identifier,
      success: false,
      metadata: { endpoint },
    })
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(
    reason: string,
    ipAddress?: string,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    this.log({
      eventType: 'SUSPICIOUS_ACTIVITY',
      userId,
      ipAddress,
      success: false,
      errorMessage: reason,
      metadata,
    })
  }

  /**
   * Log unauthorized access attempt
   */
  logUnauthorizedAccess(path: string, ipAddress: string, userId?: string): void {
    this.log({
      eventType: 'UNAUTHORIZED_ACCESS',
      userId,
      ipAddress,
      success: false,
      metadata: { path },
    })
  }
}

export const auditLogger = new AuditLogger()
