'use client';

import { useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { analyzeOtpauthUri, otpauthBlocked } from '@/lib/otpauth-safety';

interface Props {
  onImported?: () => void;
}

type Mode = 'otpauth' | 'google' | 'authy' | 'aegis';

function countAegisTotp(json: string): number {
  const parsed = JSON.parse(json) as { db?: { entries?: Array<{ type?: string }> } | string };
  if (typeof parsed.db === 'string') {
    throw new Error('Encrypted Aegis vault — export as plain JSON from Aegis first');
  }
  const entries = parsed.db?.entries;
  if (!Array.isArray(entries)) {
    throw new Error('Invalid Aegis JSON: missing db.entries');
  }
  return entries.filter((e) => (e.type || '').toLowerCase() === 'totp').length;
}

export default function MobileImport({ onImported }: Props) {
  const [mode, setMode] = useState<Mode>('otpauth');
  const [payload, setPayload] = useState('');
  const [category, setCategory] = useState('Imported');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [ackPhish, setAckPhish] = useState(false);
  const [aegisPreview, setAegisPreview] = useState<number | null>(null);
  const [aegisFileName, setAegisFileName] = useState('');
  const aegisInputRef = useRef<HTMLInputElement>(null);

  const warnings = useMemo(
    () => (mode === 'otpauth' && payload.trim() ? analyzeOtpauthUri(payload) : []),
    [mode, payload],
  );
  const blocked = mode === 'otpauth' && otpauthBlocked(warnings);
  const hasWarn = warnings.some((w) => w.level === 'warn');

  const resetAegis = () => {
    setAegisPreview(null);
    setAegisFileName('');
    setPayload('');
    if (aegisInputRef.current) aegisInputRef.current.value = '';
  };

  const onAegisFile = async (file: File | undefined) => {
    setErr('');
    setOk('');
    setAegisPreview(null);
    if (!file) return;
    try {
      const text = await file.text();
      const count = countAegisTotp(text);
      setPayload(text);
      setAegisFileName(file.name);
      setAegisPreview(count);
    } catch (e) {
      setPayload('');
      setAegisFileName('');
      setErr(e instanceof Error ? e.message : 'Could not read Aegis JSON');
    }
  };

  const run = async () => {
    setErr('');
    setOk('');
    if (mode === 'aegis') {
      if (!payload.trim() || aegisPreview === null) {
        setErr('Choose an Aegis JSON file first');
        return;
      }
      if (aegisPreview === 0) {
        setErr('No TOTP entries found in this file');
        return;
      }
      setBusy(true);
      try {
        const cat = category.trim() || 'Imported';
        const list = await api.importAegisJson(payload, cat);
        setOk(
          `Imported ${list.length} Aegis entr${list.length === 1 ? 'y' : 'ies'}` +
            (list.length < aegisPreview ? ` (${aegisPreview - list.length} duplicate${aegisPreview - list.length === 1 ? '' : 's'} skipped)` : ''),
        );
        resetAegis();
        onImported?.();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Import failed');
      }
      setBusy(false);
      return;
    }

    if (!payload.trim()) {
      setErr('Paste import data first');
      return;
    }
    if (blocked) {
      setErr('Fix the URI before importing');
      return;
    }
    if (hasWarn && !ackPhish) {
      setErr('Acknowledge the phishing warning to continue');
      return;
    }
    setBusy(true);
    try {
      const cat = category.trim() || 'Imported';
      if (mode === 'otpauth') {
        await api.importOtpauthUri(payload.trim(), cat);
        setOk('Authenticator entry imported');
      } else if (mode === 'google') {
        const list = await api.importGoogleAuthenticator(payload.trim(), cat);
        setOk(`Imported ${list.length} Google Authenticator entr${list.length === 1 ? 'y' : 'ies'}`);
      } else {
        const list = await api.importAuthyCsv(payload.trim(), cat);
        setOk(`Imported ${list.length} Authy entr${list.length === 1 ? 'y' : 'ies'}`);
      }
      setPayload('');
      setAckPhish(false);
      onImported?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-vault-muted">
        Import offline from otpauth URIs, Google Authenticator, Authy CSV, or Aegis plain JSON. Secrets stay on device.
      </p>

      <div className="flex flex-wrap gap-1 p-1 rounded-2xl bg-vault-black border border-vault-border">
        {([
          ['otpauth', 'otpauth'],
          ['google', 'Google'],
          ['authy', 'Authy'],
          ['aegis', 'Aegis'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setAckPhish(false);
              setErr('');
              setOk('');
              if (id !== 'aegis') resetAegis();
            }}
            className={cn(
              'flex-1 min-w-[4.5rem] min-h-[40px] rounded-xl text-xs font-medium transition-colors',
              mode === id ? 'bg-cyber-cyan text-black' : 'text-vault-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Folder / category"
        className="w-full min-h-[44px] px-3 rounded-xl bg-vault-black border border-vault-border text-sm text-vault-light"
      />

      {mode === 'aegis' ? (
        <div className="space-y-3">
          <label className="flex items-center justify-center w-full min-h-[48px] rounded-2xl border border-dashed border-vault-border text-xs text-vault-muted cursor-pointer hover:border-cyber-cyan/40 hover:text-cyber-cyan">
            {aegisFileName || 'Choose Aegis JSON file'}
            <input
              ref={aegisInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                void onAegisFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {aegisPreview !== null && (
            <p className="text-xs text-vault-light" role="status">
              Preview: {aegisPreview} TOTP entr{aegisPreview === 1 ? 'y' : 'ies'} ready to import
              {aegisFileName ? ` from ${aegisFileName}` : ''}.
            </p>
          )}
        </div>
      ) : (
        <textarea
          value={payload}
          onChange={(e) => { setPayload(e.target.value); setAckPhish(false); }}
          rows={5}
          placeholder={
            mode === 'otpauth'
              ? 'otpauth://totp/…'
              : mode === 'google'
                ? 'Paste Google Authenticator export JSON'
                : 'Paste Authy CSV'
          }
          className="w-full px-3 py-3 rounded-xl bg-vault-black border border-vault-border text-xs font-mono text-vault-light resize-y min-h-[120px]"
        />
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1.5" role="status">
          {warnings.map((w) => (
            <li
              key={w.message}
              className={cn(
                'text-xs rounded-xl px-3 py-2 border',
                w.level === 'block' && 'border-accent-danger/40 text-accent-danger bg-accent-danger/10',
                w.level === 'warn' && 'border-accent-warning/40 text-accent-warning bg-accent-warning/10',
                w.level === 'info' && 'border-cyber-emerald/30 text-cyber-emerald bg-cyber-emerald/10',
              )}
            >
              {w.level === 'warn' ? 'Phishing check: ' : ''}{w.message}
            </li>
          ))}
        </ul>
      )}

      {hasWarn && !blocked && (
        <label className="flex items-start gap-2 text-xs text-vault-muted min-h-[44px]">
          <input
            type="checkbox"
            checked={ackPhish}
            onChange={(e) => setAckPhish(e.target.checked)}
            className="mt-1 accent-cyber-cyan"
          />
          I verified this QR/URI came from the real service (not a phishing page).
        </label>
      )}

      <button
        type="button"
        disabled={busy || blocked || (mode === 'aegis' && aegisPreview === null)}
        onClick={run}
        className="w-full min-h-[48px] rounded-2xl bg-cyber-cyan text-black text-sm font-semibold disabled:opacity-50"
      >
        {busy
          ? 'Importing…'
          : mode === 'aegis' && aegisPreview !== null
            ? `Confirm import (${aegisPreview})`
            : mode === 'aegis'
              ? 'Import Aegis JSON'
              : 'Import'}
      </button>

      {err && <p className="text-xs text-accent-danger">{err}</p>}
      {ok && <p className="text-xs text-cyber-emerald">{ok}</p>}
    </div>
  );
}
