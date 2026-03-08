/**
 * Entitlements store: Firebase Realtime Database when configured, else in-memory.
 * No PII. Only purchase-related fields keyed by anonymous_id.
 */

import { entitlementsRef } from '../services/firebase';

export interface Entitlements {
  hasPremium: boolean;
  premiumExpiresAt: string | null;
  hasCoffee: boolean;
  coffeeAdsFreeUntil: string | null;
}

function defaultEntitlements(): Entitlements {
  return {
    hasPremium: false,
    premiumExpiresAt: null,
    hasCoffee: false,
    coffeeAdsFreeUntil: null,
  };
}

/** In-memory fallback when Firebase is not configured */
const memoryStore = new Map<string, Entitlements>();

function normalize(e: Entitlements): Entitlements {
  const now = new Date().toISOString();
  return {
    hasPremium: e.hasPremium && (e.premiumExpiresAt == null || e.premiumExpiresAt > now),
    premiumExpiresAt: e.premiumExpiresAt,
    hasCoffee: e.hasCoffee,
    coffeeAdsFreeUntil: e.coffeeAdsFreeUntil,
  };
}

export async function getEntitlements(anonymousId: string): Promise<Entitlements> {
  const ref = entitlementsRef(anonymousId);
  if (ref) {
    try {
      const snapshot = await ref.once('value');
      const val = snapshot.val();
      if (val && typeof val === 'object') {
        return normalize({
          hasPremium: !!val.hasPremium,
          premiumExpiresAt: val.premiumExpiresAt ?? null,
          hasCoffee: !!val.hasCoffee,
          coffeeAdsFreeUntil: val.coffeeAdsFreeUntil ?? null,
        });
      }
    } catch (_) {
      // fallback to memory
    }
  }
  const e = memoryStore.get(anonymousId);
  if (!e) return defaultEntitlements();
  return normalize(e);
}

export async function setCoffeePurchased(anonymousId: string): Promise<void> {
  const now = new Date();
  const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const ref = entitlementsRef(anonymousId);
  if (ref) {
    try {
      const snapshot = await ref.once('value');
      const current = snapshot.val() || {};
      await ref.set({
        ...current,
        hasCoffee: true,
        coffeeAdsFreeUntil: until,
      });
      return;
    } catch (_) {}
  }
  const e = memoryStore.get(anonymousId) ?? defaultEntitlements();
  memoryStore.set(anonymousId, {
    ...e,
    hasCoffee: true,
    coffeeAdsFreeUntil: until,
  });
}

export async function setPremiumPurchased(
  anonymousId: string,
  expiresAt: string | null = null,
): Promise<void> {
  const ref = entitlementsRef(anonymousId);
  if (ref) {
    try {
      const snapshot = await ref.once('value');
      const current = snapshot.val() || {};
      await ref.set({
        ...current,
        hasPremium: true,
        premiumExpiresAt: expiresAt,
      });
      return;
    } catch (_) {}
  }
  const e = memoryStore.get(anonymousId) ?? defaultEntitlements();
  memoryStore.set(anonymousId, {
    ...e,
    hasPremium: true,
    premiumExpiresAt: expiresAt,
  });
}
