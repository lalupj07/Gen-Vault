'use client';

import { useEffect, useState, FormEvent } from 'react';
import {
  subscribeMasterPasswordPrompt,
  resolveMasterPasswordPrompt,
} from '@/lib/prompt-master-password';

/** App-wide masked password dialog for re-auth prompts. */
export function MasterPasswordPromptHost() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [value, setValue] = useState('');

  useEffect(() => {
    return subscribeMasterPasswordPrompt((isOpen, msg) => {
      setOpen(isOpen);
      setMessage(msg);
      if (!isOpen) setValue('');
    });
  }, []);

  if (!open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    resolveMasterPasswordPrompt(value);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="master-pw-prompt-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-vault-border/40 bg-vault-black p-5 shadow-xl"
      >
        <h2 id="master-pw-prompt-title" className="text-sm font-semibold text-vault-light">
          Confirm master password
        </h2>
        <p className="mt-2 text-xs text-vault-muted">{message}</p>
        <input
          type="password"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="m3-field mt-4 w-full"
          placeholder="Master password"
          autoFocus
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-lg border border-vault-border/40 text-sm"
            onClick={() => resolveMasterPasswordPrompt(null)}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-[44px] flex-1 rounded-lg bg-cyber-cyan/20 text-sm font-semibold text-cyber-cyan"
          >
            Confirm
          </button>
        </div>
      </form>
    </div>
  );
}
