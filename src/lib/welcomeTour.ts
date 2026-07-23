export const WELCOME_TOUR_STORAGE_KEY = 'gv_welcome_tour_done';

export type WelcomeTourStep = {
  id: string;
  title: string;
  description: string;
  target?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
};

export const WELCOME_TOUR_STEPS: WelcomeTourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to GenVault',
    description:
      'Your vault is ready. This quick tour shows where to find 2FA codes, passwords, stealth mode, and shortcuts.',
    placement: 'center',
  },
  {
    id: 'navigation',
    title: 'Sidebar Navigation',
    description:
      'Use the sidebar to switch between Dashboard, Authenticator, Vault, security tools, and Settings.',
    target: 'sidebar-nav',
    placement: 'right',
  },
  {
    id: 'authenticator',
    title: '2FA / TOTP Codes',
    description:
      'Add authenticator accounts here. Scan a QR code or enter a secret manually to generate time-based codes.',
    target: 'nav-authenticator',
    placement: 'right',
  },
  {
    id: 'vault',
    title: 'Password Vault',
    description:
      'Store encrypted usernames, passwords, URLs, and notes. Search, categorize, and copy credentials securely.',
    target: 'nav-vault',
    placement: 'right',
  },
  {
    id: 'stealth',
    title: 'Stealth Mode',
    description:
      'Hide sensitive content instantly when someone is nearby. Toggle off from the sidebar or the overlay.',
    target: 'stealth-toggle',
    placement: 'right',
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    description:
      'Press Ctrl+K for the command palette. Ctrl+N adds an entry, Ctrl+L locks the vault, and Ctrl+, opens Settings.',
    target: 'session-header',
    placement: 'bottom',
  },
  {
    id: 'settings',
    title: 'Settings & Security',
    description:
      'Configure auto-lock, biometric unlock, backup, import/export, and replay this tour anytime.',
    target: 'nav-settings',
    placement: 'right',
  },
  {
    id: 'complete',
    title: 'You\'re All Set',
    description:
      'Start by adding your first 2FA account or password. GenVault stays offline — your data never leaves this device.',
    placement: 'center',
  },
];

export function isWelcomeTourDone(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(WELCOME_TOUR_STORAGE_KEY) === 'true';
}

export function markWelcomeTourDone(): void {
  localStorage.setItem(WELCOME_TOUR_STORAGE_KEY, 'true');
}

export function resetWelcomeTour(): void {
  localStorage.removeItem(WELCOME_TOUR_STORAGE_KEY);
}
