import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateOTP(): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

export function formatTime(seconds: number): string {
  return seconds.toString().padStart(2, '0');
}

export function generateDeviceId(): string {
  return 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

export function generateSessionId(): string {
  return 'SES-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

export function getTimeBasedProgress(): number {
  const now = Date.now();
  const period = 30000;
  return ((now % period) / period) * 100;
}

export function getSecondsRemaining(): number {
  const now = Date.now();
  const period = 30000;
  return Math.ceil((period - (now % period)) / 1000);
}

export function hashDisplay(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
}
