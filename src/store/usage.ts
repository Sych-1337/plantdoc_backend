/**
 * Usage store: free/coffee tiers use a WEEKLY window (default: Monday 08:00 Europe/Kiev).
 * Premium scans use a calendar month. All boundaries are SERVER-derived (see freeUsagePeriod).
 */

import { currentFreeUsagePeriodEndIso, currentFreeUsagePeriodStartIso } from '../lib/freeUsagePeriod';
import { getEntitlements } from './entitlements';
import { usageRef } from '../services/firebase';

/** Free plan: per week (not per day). */
const SCANS_FREE = 20;
/** Coffee tier: weekly scans before bonus pools (aligned with app UI). */
const SCANS_COFFEE = 50;
const SCANS_PREMIUM_MONTH = 900;
const QUIZ_FREE = 1;
const QUIZ_COFFEE = 2;
const QUIZ_PREMIUM = 300;
const CHAT_FREE = 20;
const CHAT_COFFEE = 20;
const CHAT_PREMIUM = 1500;

function serverDateKey(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
}

function serverMonthKey(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface UsageState {
  /** UTC ISO start of the week this usage row applies to; when it differs from current, free counters reset. */
  freeUsagePeriodId: string;
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

function defaultUsage(
  serverDate: string,
  serverMonth: string,
  freeUsagePeriodId: string,
): UsageState {
  return {
    freeUsagePeriodId,
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
  freeUsagePeriodId: string,
  serverDate: string,
  serverMonth: string,
): UsageState {
  const d = raw && typeof raw === 'object' ? raw : {};
  const samePeriod = d.freeUsagePeriodId === freeUsagePeriodId;
  return {
    freeUsagePeriodId,
    dailyScansDate: serverDate,
    dailyScansUsed: samePeriod ? Math.max(0, Number(d.dailyScansUsed) || 0) : 0,
    dailyQuizDate: serverDate,
    dailyQuizUsed: samePeriod ? Math.max(0, Number(d.dailyQuizUsed) || 0) : 0,
    dailyChatDate: serverDate,
    dailyChatUsed: samePeriod ? Math.max(0, Number(d.dailyChatUsed) || 0) : 0,
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

export type UsageSnapshot = {
  serverDate: string;
  serverMonth: string;
  freeUsagePeriodId: string;
  freeUsagePeriodEndsAt: string;
  usage: UsageState;
};

export async function getUsage(anonymousId: string): Promise<UsageSnapshot> {
  const serverDate = serverDateKey();
  const serverMonth = serverMonthKey();
  const freeUsagePeriodId = currentFreeUsagePeriodStartIso();
  const freeUsagePeriodEndsAt = currentFreeUsagePeriodEndIso();
  const ref = usageRef(anonymousId);
  if (ref) {
    try {
      const snapshot = await ref.once('value');
      const val = snapshot.val();
      const usage = normalizeUsage(val, freeUsagePeriodId, serverDate, serverMonth);
      return {
        serverDate,
        serverMonth,
        freeUsagePeriodId,
        freeUsagePeriodEndsAt,
        usage,
      };
    } catch (_) {
      // fallback to memory
    }
  }
  const u = memoryUsage.get(anonymousId) ?? defaultUsage(serverDate, serverMonth, freeUsagePeriodId);
  const usage = normalizeUsage(u, freeUsagePeriodId, serverDate, serverMonth);
  return {
    serverDate,
    serverMonth,
    freeUsagePeriodId,
    freeUsagePeriodEndsAt,
    usage,
  };
}

async function setUsage(anonymousId: string, usage: UsageState): Promise<void> {
  const ref = usageRef(anonymousId);
  if (ref) {
    try {
      await ref.set(usage);
      return;
    } catch (_) {}
  }
  memoryUsage.set(anonymousId, usage);
}

export type ConsumeType = 'scan' | 'quiz' | 'chat';

/** Returns { allowed, usage } — allowed false means over limit (429). */
export async function consume(
  anonymousId: string,
  type: ConsumeType,
): Promise<{ allowed: boolean; usage: UsageState; serverDate: string; serverMonth: string }> {
  const { serverDate, serverMonth, freeUsagePeriodId, usage: current } = await getUsage(anonymousId);
  const entitlements = await getEntitlements(anonymousId);
  const hasPremium = entitlements.hasPremium;
  const hasCoffee = entitlements.hasCoffee;

  const usage = { ...current };
  // Ensure stored period matches computed week (normalizeUsage already zeroed if needed)
  usage.freeUsagePeriodId = freeUsagePeriodId;

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

  await setUsage(anonymousId, usage);
  return { allowed: true, usage, serverDate, serverMonth };
}

/** Add bonus from reward ad. Called when client reports "reward ad watched". */
export async function addRewardedBonus(anonymousId: string): Promise<UsageState> {
  const { usage } = await getUsage(anonymousId);
  const next = { ...usage };
  next.rewardedBonusScans = (next.rewardedBonusScans ?? 0) + 2;
  next.rewardedBonusQuiz = (next.rewardedBonusQuiz ?? 0) + 1;
  next.rewardedBonusChat = (next.rewardedBonusChat ?? 0) + 3;
  await setUsage(anonymousId, next);
  return next;
}
