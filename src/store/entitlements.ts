/**
 * In-memory store: anonymous_id -> entitlements.
 * No PII. Only purchase-related fields.
 */

export interface Entitlements {
  /** Premium active (or subscription not expired). */
  hasPremium: boolean;
  /** ISO date when premium subscription ends, or null if lifetime. */
  premiumExpiresAt: string | null;
  /** User has coffee tier (10/2/20 limits). */
  hasCoffee: boolean;
  /** ISO date until which "no ads" applies after coffee purchase (e.g. purchaseDate + 7 days). */
  coffeeAdsFreeUntil: string | null;
}

const store = new Map<string, Entitlements>();

function defaultEntitlements(): Entitlements {
  return {
    hasPremium: false,
    premiumExpiresAt: null,
    hasCoffee: false,
    coffeeAdsFreeUntil: null,
  };
}

export function getEntitlements(anonymousId: string): Entitlements {
  const e = store.get(anonymousId);
  if (!e) return defaultEntitlements();
  const now = new Date().toISOString();
  return {
    hasPremium: e.hasPremium && (e.premiumExpiresAt == null || e.premiumExpiresAt > now),
    premiumExpiresAt: e.premiumExpiresAt,
    hasCoffee: e.hasCoffee,
    coffeeAdsFreeUntil: e.coffeeAdsFreeUntil,
  };
}

export function setCoffeePurchased(anonymousId: string): void {
  const now = new Date();
  const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const e = store.get(anonymousId) ?? defaultEntitlements();
  store.set(anonymousId, {
    ...e,
    hasCoffee: true,
    coffeeAdsFreeUntil: until.toISOString(),
  });
}

export function setPremiumPurchased(
  anonymousId: string,
  expiresAt: string | null = null,
): void {
  const e = store.get(anonymousId) ?? defaultEntitlements();
  store.set(anonymousId, {
    ...e,
    hasPremium: true,
    premiumExpiresAt: expiresAt,
  });
}
