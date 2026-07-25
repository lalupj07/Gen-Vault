import type {
  User, VaultEntry, AppSettings, DeviceEntry, Session, SecurityEvent,
  EntryAttachmentMeta, SecurityQuestion, EntryTemplate,
} from '@/lib/api';

export type DemoVaultEntry = VaultEntry & {
  secret: string;
  notes_plain?: string;
};

export type DemoAttachment = EntryAttachmentMeta & {
  dataBase64: string;
};

export interface DemoShare {
  id: string;
  entry_ids: string[];
  entry_names: string[];
  payload: string;
  created_at: number;
  expires_at: number | null;
  revoked: boolean;
}

export interface DemoHistoryRow {
  id: string;
  entry_id: string;
  entry_name: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  timestamp: number;
}

export interface DemoState {
  schemaVersion: 1;
  user: User | null;
  passwordHash: string | null;
  pinHash: string | null;
  unlocked: boolean;
  stealth: boolean;
  timezoneOffset: number;
  clockDrift: number;
  settings: AppSettings;
  entries: DemoVaultEntry[];
  attachments: Record<string, DemoAttachment[]>; // entryId -> list
  devices: DeviceEntry[];
  sessions: Session[];
  securityEvents: SecurityEvent[];
  recoveryCodes: { code: string; used: boolean }[];
  emergencyCodes: { code: string; used: boolean }[];
  securityAnswers: Record<string, string>; // questionId -> answer hash
  enrolledQuestionIds: string[];
  shares: DemoShare[];
  history: DemoHistoryRow[];
  loginCount: number;
  entryUseCounts: Record<string, number>;
}

export type DemoHandler = (
  state: DemoState,
  args: Record<string, unknown> | undefined,
) => Promise<unknown> | unknown;
