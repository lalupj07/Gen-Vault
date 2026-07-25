import type { SecurityQuestion } from '@/lib/api';
import { hashPassword, verifyPassword } from '../crypto';
import type { DemoHandler, DemoState } from '../types';
import { requireUnlocked } from './vault';

const SECURITY_QUESTIONS: SecurityQuestion[] = [
  { id: 'q1', question: 'What city were you born in?', category: 'personal' },
  { id: 'q2', question: 'What was the name of your first pet?', category: 'personal' },
  { id: 'q3', question: 'What is your favorite book?', category: 'personal' },
  { id: 'q4', question: 'What was your childhood nickname?', category: 'personal' },
  { id: 'q5', question: 'What street did you grow up on?', category: 'personal' },
];

function randomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

function generateCodes(count: number): string[] {
  return Array.from({ length: count }, () => randomCode());
}

async function normalizeAnswer(answer: string): Promise<string> {
  return hashPassword(answer.trim().toLowerCase());
}

export const recoveryHandlers: Record<string, DemoHandler> = {
  get_security_questions: () => SECURITY_QUESTIONS,

  get_enrolled_security_questions: (state) =>
    SECURITY_QUESTIONS.filter((q) => state.enrolledQuestionIds.includes(q.id)),

  get_random_security_questions: (_state, args) => {
    const count = Math.min(SECURITY_QUESTIONS.length, Math.max(1, Number(args?.count ?? 3)));
    return SECURITY_QUESTIONS.slice(0, count);
  },

  enroll_security_answers: async (state, args) => {
    requireUnlocked(state);
    const answers = (args?.answers as [string, string][]) ?? [];
    if (answers.length < 3) throw new Error('At least 3 security answers required');
    state.securityAnswers = {};
    state.enrolledQuestionIds = [];
    for (const [questionId, answer] of answers) {
      if (!SECURITY_QUESTIONS.some((q) => q.id === questionId)) {
        throw new Error('Invalid security question');
      }
      state.securityAnswers[questionId] = await normalizeAnswer(answer);
      state.enrolledQuestionIds.push(questionId);
    }
  },

  verify_security_answers: async (state, args) => {
    requireUnlocked(state);
    const answers = (args?.answers as [string, string][]) ?? [];
    for (const [questionId, answer] of answers) {
      const stored = state.securityAnswers[questionId];
      if (!stored || !(await verifyPassword(answer.trim().toLowerCase(), stored))) return false;
    }
    return answers.length > 0;
  },

  verify_security_answers_for_reset: async (state, args) => {
    const answers = (args?.answers as [string, string][]) ?? [];
    for (const [questionId, answer] of answers) {
      const stored = state.securityAnswers[questionId];
      if (!stored || !(await verifyPassword(answer.trim().toLowerCase(), stored))) return false;
    }
    return answers.length > 0;
  },

  reset_password_with_security_answers: async (state, args) => {
    const username = String(args?.username ?? '');
    const newPassword = String(args?.newPassword ?? '');
    const answers = (args?.answers as [string, string][]) ?? [];
    if (!state.user || state.user.username !== username) throw new Error('User not found');
    for (const [questionId, answer] of answers) {
      const stored = state.securityAnswers[questionId];
      if (!stored || !(await verifyPassword(answer.trim().toLowerCase(), stored))) {
        throw new Error('Security answers did not match');
      }
    }
    if (!newPassword) throw new Error('New password is required');
    state.passwordHash = await hashPassword(newPassword);
    state.unlocked = false;
  },

  has_security_questions: (state) => state.enrolledQuestionIds.length > 0,

  generate_account_recovery_codes: (state) => {
    requireUnlocked(state);
    const codes = generateCodes(10);
    state.recoveryCodes = codes.map((code) => ({ code, used: false }));
    return codes;
  },

  regenerate_account_recovery_codes: (state) => {
    requireUnlocked(state);
    const codes = generateCodes(10);
    state.recoveryCodes = codes.map((code) => ({ code, used: false }));
    return codes;
  },

  has_account_recovery_codes: (state) => state.recoveryCodes.some((c) => !c.used),

  unused_account_recovery_codes_count: (state) =>
    state.recoveryCodes.filter((c) => !c.used).length,

  verify_recovery_code_for_reset: (state, args) => {
    const code = String(args?.code ?? '').toUpperCase();
    const match = state.recoveryCodes.find((c) => c.code === code && !c.used);
    return !!match;
  },

  reset_password_with_recovery_code: async (state, args) => {
    const username = String(args?.username ?? '');
    const recoveryCode = String(args?.recoveryCode ?? '').toUpperCase();
    const newPassword = String(args?.newPassword ?? '');
    if (!state.user || state.user.username !== username) throw new Error('User not found');
    const idx = state.recoveryCodes.findIndex((c) => c.code === recoveryCode && !c.used);
    if (idx === -1) throw new Error('Invalid recovery code');
    if (!newPassword) throw new Error('New password is required');
    state.recoveryCodes[idx].used = true;
    state.passwordHash = await hashPassword(newPassword);
    state.unlocked = false;
  },

  generate_emergency_codes: (state, args) => {
    requireUnlocked(state);
    const count = Math.min(20, Math.max(1, Number(args?.count ?? 5)));
    const codes = generateCodes(count);
    state.emergencyCodes = codes.map((code) => ({ code, used: false }));
    return codes;
  },

  get_emergency_codes: (state) =>
    state.emergencyCodes.map((c) => [c.used, c.code.length] as [boolean, number]),

  use_emergency_code: (state, args) => {
    const code = String(args?.code ?? '').toUpperCase();
    const match = state.emergencyCodes.find((c) => c.code === code && !c.used);
    if (!match) return false;
    match.used = true;
    return true;
  },

  has_emergency_codes: (state) => state.emergencyCodes.some((c) => !c.used),
};
