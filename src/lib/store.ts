'use client';

import { createContext, useContext } from 'react';

export interface VaultEntry {
  id: string;
  name: string;
  issuer: string;
  icon: string;
  type: 'totp' | 'hotp';
  digits: number;
  period: number;
  algorithm: string;
  addedAt: number;
  lastUsed: number;
  category: string;
  color: string;
}

export interface DeviceEntry {
  id: string;
  name: string;
  type: 'desktop' | 'mobile' | 'tablet' | 'browser';
  os: string;
  lastSeen: number;
  trustLevel: number;
  status: 'active' | 'inactive' | 'revoked';
  location: string;
  fingerprint: string;
}

export interface SecurityEvent {
  id: string;
  type: 'login' | 'otp_generated' | 'vault_access' | 'device_added' | 'backup' | 'threat' | 'sync';
  message: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical' | 'success';
}

export interface AppState {
  isOnboarded: boolean;
  vaultLocked: boolean;
  stealthMode: boolean;
  activeView: string;
  securityScore: number;
  encryptionStatus: 'active' | 'idle' | 'processing';
  syncStatus: 'synced' | 'syncing' | 'offline' | 'error';
  lastBackup: number;
  totalCredentials: number;
  activeDevices: number;
  threatLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
}

/** Demo placeholders only — no secrets; not used in production vault flows. */
export const defaultVaultEntries: VaultEntry[] = [];
export const defaultDevices: DeviceEntry[] = [];
export const defaultSecurityEvents: SecurityEvent[] = [];

export const defaultAppState: AppState = {
  isOnboarded: false,
  vaultLocked: false,
  stealthMode: false,
  activeView: 'dashboard',
  securityScore: 0,
  encryptionStatus: 'idle',
  syncStatus: 'offline',
  lastBackup: 0,
  totalCredentials: 0,
  activeDevices: 0,
  threatLevel: 'safe',
};
