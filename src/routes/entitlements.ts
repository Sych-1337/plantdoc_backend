import express from 'express';
import {
  getEntitlements,
  setCoffeePurchased,
  setPremiumPurchased,
} from '../store/entitlements';

const ANONYMOUS_ID_HEADER = 'x-anonymous-id';

export const entitlementsRouter = express.Router();

/** GET /entitlements — returns entitlements for the anonymous id in header. No PII. */
entitlementsRouter.get('/', (req, res) => {
  const anonymousId = req.headers[ANONYMOUS_ID_HEADER] as string | undefined;
  if (!anonymousId || anonymousId.length < 10) {
    return res.status(400).json({ error: 'Missing or invalid X-Anonymous-Id header' });
  }
  const e = getEntitlements(anonymousId);
  return res.json({
    hasPremium: e.hasPremium,
    premiumExpiresAt: e.premiumExpiresAt,
    hasCoffee: e.hasCoffee,
    coffeeAdsFreeUntil: e.coffeeAdsFreeUntil,
  });
});

/** POST /entitlements/coffee — record coffee purchase (7 days no ads). */
entitlementsRouter.post('/coffee', (req, res) => {
  const anonymousId = req.headers[ANONYMOUS_ID_HEADER] as string | undefined;
  if (!anonymousId || anonymousId.length < 10) {
    return res.status(400).json({ error: 'Missing or invalid X-Anonymous-Id header' });
  }
  setCoffeePurchased(anonymousId);
  const e = getEntitlements(anonymousId);
  return res.json({
    hasPremium: e.hasPremium,
    premiumExpiresAt: e.premiumExpiresAt,
    hasCoffee: e.hasCoffee,
    coffeeAdsFreeUntil: e.coffeeAdsFreeUntil,
  });
});

/** POST /entitlements/premium — record premium purchase. Body: { expiresAt?: string } (ISO). */
entitlementsRouter.post('/premium', (req, res) => {
  const anonymousId = req.headers[ANONYMOUS_ID_HEADER] as string | undefined;
  if (!anonymousId || anonymousId.length < 10) {
    return res.status(400).json({ error: 'Missing or invalid X-Anonymous-Id header' });
  }
  const expiresAt =
    typeof req.body?.expiresAt === 'string' && req.body.expiresAt
      ? req.body.expiresAt
      : null;
  setPremiumPurchased(anonymousId, expiresAt);
  const e = getEntitlements(anonymousId);
  return res.json({
    hasPremium: e.hasPremium,
    premiumExpiresAt: e.premiumExpiresAt,
    hasCoffee: e.hasCoffee,
    coffeeAdsFreeUntil: e.coffeeAdsFreeUntil,
  });
});
