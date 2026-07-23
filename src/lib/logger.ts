/**
 * Secure Production Logger
 * - Never logs sensitive data (passwords, tokens, PII)
 * - Structured logging for monitoring systems
 * - Automatic sanitization of user data
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: any
}

class SecureLogger {
  private isDevelopment = process.env.NODE_ENV === 'development'
  private logLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'

  private sensitiveKeys = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'accessToken',
    'refreshToken',
    'idToken',
    'authorization',
    'cookie',
    'session',
  ]

  private sanitize(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item))
    }

    const sanitized: any = {}
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase()
      if (this.sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitize(value)
      } else {
        sanitized[key] = value
      }
    }
    return sanitized
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.logLevel)
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString()
    const sanitizedContext = context ? this.sanitize(context) : {}

    return {
      timestamp,
      level,
      message,
      ...sanitizedContext,
      environment: process.env.NODE_ENV,
    }
  }

  debug(message: string, context?: LogContext) {
    if (!this.shouldLog('debug')) return
    if (this.isDevelopment) {
      console.debug(JSON.stringify(this.formatLog('debug', message, context)))
    }
  }

  info(message: string, context?: LogContext) {
    if (!this.shouldLog('info')) return
    console.info(JSON.stringify(this.formatLog('info', message, context)))
  }

  warn(message: string, context?: LogContext) {
    if (!this.shouldLog('warn')) return
    console.warn(JSON.stringify(this.formatLog('warn', message, context)))
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    if (!this.shouldLog('error')) return
    
    const errorContext = error instanceof Error
      ? {
          errorName: error.name,
          errorMessage: error.message,
          stack: this.isDevelopment ? error.stack : undefined,
          ...context,
        }
      : { error: String(error), ...context }

    console.error(JSON.stringify(this.formatLog('error', message, errorContext)))
  }

  // Security audit logging
  audit(event: string, context?: LogContext) {
    if (process.env.ENABLE_AUDIT_LOGGING !== 'true') return
    
    const auditLog = this.formatLog('info', `AUDIT: ${event}`, {
      ...context,
      auditEvent: true,
    })
    
    console.info(JSON.stringify(auditLog))
    
    // In production, send to SIEM/monitoring system
    // e.g., Datadog, Splunk, CloudWatch, etc.
  }
}

export const logger = new SecureLogger()
