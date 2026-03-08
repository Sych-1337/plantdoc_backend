/**
 * Usage store: daily/monthly counts keyed by anonymous_id (in-memory).
 * All dates are SERVER time so changing device time cannot reset limits.
 */

import { getEntitlements } from './entitlements';

const SCANS_FREE = 5;
const SCANS_COFFEE = 10;
const SCANS_PREMIUM_MONTH = 100;
const QUIZ_FREE = 1;
const QUIZ_COFFEE = 2;
const QUIZ_PREMIUM = 10;
const CHAT_FREE = 10;
const CHAT_COFFEE = 20;
const CHAT_PREMIUM = 100;

function serverDateKey(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
}

function serverMonthKey(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface UsageState {
  dailyScansDate: string;
  dailyScansUsed: number;
  dailyQuizDate: string;
  dailyQuizUsed: number;
  dailyChatDate: string;
  dailyChatUsed: number;
  premiumScansMonth: string;
  premiumScansUsed: number;
  coffeeBonusScans: number;
  coffeeBonusQuiz: number;
  coffeeBonusChat: number;
  rewardedBonusScans: number;
  rewardedBonusQuiz: number;
  rewardedBonusChat: number;
}

function defaultUsage(serverDate: string, serverMonth: string): UsageState {
  return {
    dailyScansDate: serverDate,
    dailyScansUsed: 0,
    dailyQuizDate: serverDate,
    dailyQuizUsed: 0,
    dailyChatDate: serverDate,
    dailyChatUsed: 0,
    premiumScansMonth: serverMonth,
    premiumScansUsed: 0,
    coffeeBonusScans: 0,
    coffeeBonusQuiz: 0,
    coffeeBonusChat: 0,
    rewardedBonusScans: 0,
    rewardedBonusQuiz: 0,
    rewardedBonusChat: 0,
  };
}

function normalizeUsage(
  raw: Partial<UsageState> | null,
  serverDate: string,
  serverMonth: string,
): UsageState {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    dailyScansDate: serverDate,
    dailyScansUsed: d.dailyScansDate === serverDate ? Math.max(0, Number(d.dailyScansUsed) || 0) : 0,
    dailyQuizDate: serverDate,
    dailyQuizUsed: d.dailyQuizDate === serverDate ? Math.max(0, Number(d.dailyQuizUsed) || 0) : 0,
    dailyChatDate: serverDate,
    dailyChatUsed: d.dailyChatDate === serverDate ? Math.max(0, Number(d.dailyChatUsed) || 0) : 0,
    premiumScansMonth: serverMonth,
    premiumScansUsed: d.premiumScansMonth === serverMonth ? Math.max(0, Number(d.premiumScansUsed) || 0) : 0,
    coffeeBonusScans: Math.max(0, Number(d.coffeeBonusScans) || 0),
    coffeeBonusQuiz: Math.max(0, Number(d.coffeeBonusQuiz) || 0),
    coffeeBonusChat: Math.max(0, Number(d.coffeeBonusChat) || 0),
    rewardedBonusScans: Math.max(0, Number(d.rewardedBonusScans) || 0),
    rewardedBonusQuiz: Math.max(0, Number(d.rewardedBonusQuiz) || 0),
    rewardedBonusChat: Math.max(0, Number(d.rewardedBonusChat) || 0),
  };
}

const memoryUsage = new Map<string, UsageState>();

export async function getUsage(anonymousId: string): Promise<{ serverDate: string; serverMonth: string; usage: UsageState }> {
  const serverDate = serverDateKey();
  const serverMonth = serverMonthKey();
  const u = memoryUsage.get(anonymousId) ?? defaultUsage(serverDate, serverMonth);
  const usage = normalizeUsage(u, serverDate, serverMonth);
  return { serverDate, serverMonth, usage };
}

export type ConsumeType = 'scan' | 'quiz' | 'chat';

/** Returns { allowed, usage } — allowed false means over limit (429). */
export async function consume(
  anonymousId: string,
  type: ConsumeType,
): Promise<{ allowed: boolean; usage: UsageState; serverDate: string; serverMonth: string }> {
  const { serverDate, serverMonth, usage: current } = await getUsage(anonymousId);
  const entitlements = getEntitlements(anonymousId);
  const hasPremium = entitlements.hasPremium;
  const hasCoffee = entitlements.hasCoffee;

  const usage = { ...current };

  if (type === 'scan') {
    if (hasPremium) {
      if (usage.premiumScansMonth !== serverMonth) {
        usage.premiumScansMonth = serverMonth;
        usage.premiumScansUsed = 0;
      }
      const limit = SCANS_PREMIUM_MONTH;
      if (usage.premiumScansUsed >= limit) {
        return { allowed: false, usage: current, serverDate, serverMonth };
      }
      usage.premiumScansUsed += 1;
    } else {
      const limit = hasCoffee ? SCANS_COFFEE : SCANS_FREE;
      if (usage.dailyScansDate !== serverDate) {
        usage.dailyScansDate = serverDate;
        usage.dailyScansUsed = 0;
      }
      if (usage.dailyScansUsed < limit) {
        usage.dailyScansUsed += 1;
      } else if (usage.coffeeBonusScans > 0) {
        usage.coffeeBonusScans -= 1;
      } else if (usage.rewardedBonusScans > 0) {
        usage.rewardedBonusScans -= 1;
      } else {
        return { allowed: false, usage: current, serverDate, serverMonth };
      }
    }
  } else if (type === 'quiz') {
    const limit = hasPremium ? QUIZ_PREMIUM : hasCoffee ? QUIZ_COFFEE : QUIZ_FREE;
    if (usage.dailyQuizDate !== serverDate) {
      usage.dailyQuizDate = serverDate;
      usage.dailyQuizUsed = 0;
    }
    if (usage.dailyQuizUsed < limit) {
      usage.dailyQuizUsed += 1;
    } else if (usage.coffeeBonusQuiz > 0) {
      usage.coffeeBonusQuiz -= 1;
    } else if (usage.rewardedBonusQuiz > 0) {
      usage.rewardedBonusQuiz -= 1;
    } else {
      return { allowed: false, usage: current, serverDate, serverMonth };
    }
  } else {
    const limit = hasPremium ? CHAT_PREMIUM : hasCoffee ? CHAT_COFFEE : CHAT_FREE;
    if (usage.dailyChatDate !== serverDate) {
      usage.dailyChatDate = serverDate;
      usage.dailyChatUsed = 0;
    }
    if (usage.dailyChatUsed < limit) {
      usage.dailyChatUsed += 1;
    } else if (usage.coffeeBonusChat > 0) {
      usage.coffeeBonusChat -= 1;
    } else if (usage.rewardedBonusChat > 0) {
      usage.rewardedBonusChat -= 1;
    } else {
      return { allowed: false, usage: current, serverDate, serverMonth };
    }
  }

  memoryUsage.set(anonymousId, usage);
  return { allowed: true, usage, serverDate, serverMonth };
}

/** Add bonus from reward ad. */
export async function addRewardedBonus(anonymousId: string): Promise<UsageState> {
  const { usage } = await getUsage(anonymousId);
  const next = { ...usage };
  next.rewardedBonusScans = (next.rewardedBonusScans ?? 0) + 2;
  next.rewardedBonusQuiz = (next.rewardedBonusQuiz ?? 0) + 1;
  next.rewardedBonusChat = (next.rewardedBonusChat ?? 0) + 5;
  memoryUsage.set(anonymousId, next);
  return next;
}
