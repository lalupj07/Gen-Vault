export const VAULT_ERASE_CONFIRMATION = 'DELETE MY VAULT' as const;

export function isVaultEraseConfirmation(value: string): boolean {
  return value === VAULT_ERASE_CONFIRMATION;
}
