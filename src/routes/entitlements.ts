import express from 'express';
import {
  getEntitlements,
  setCoffeePurchased,
  setPremiumPurchased,
} from '../store/entitlements';

const ANONYMOUS_ID_HEADER = 'x-anonymous-id';

export const entitlementsRouter = express.Router();

/** GET /entitlements — returns entitlements for the anonymous id in header. No PII. */
entitlementsRouter.get('/', async (req, res) => {
  const anonymousId = req.headers[ANONYMOUS_ID_HEADER] as string | undefined;
  if (!anonymousId || anonymousId.length < 10) {
    return res.status(400).json({ error: 'Missing or invalid X-Anonymous-Id header' });
  }
  try {
    const e = await getEntitlements(anonymousId);
    return res.json({
      hasPremium: e.hasPremium,
      premiumExpiresAt: e.premiumExpiresAt,
      hasCoffee: e.hasCoffee,
      coffeeAdsFreeUntil: e.coffeeAdsFreeUntil,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get entitlements' });
  }
});

/** POST /entitlements/coffee — record coffee purchase (7 days no ads). */
entitlementsRouter.post('/coffee', async (req, res) => {
  const anonymousId = req.headers[ANONYMOUS_ID_HEADER] as string | undefined;
  if (!anonymousId || anonymousId.length < 10) {
    return res.status(400).json({ error: 'Missing or invalid X-Anonymous-Id header' });
  }
  try {
    await setCoffeePurchased(anonymousId);
    const e = await getEntitlements(anonymousId);
    return res.json({
      hasPremium: e.hasPremium,
      premiumExpiresAt: e.premiumExpiresAt,
      hasCoffee: e.hasCoffee,
      coffeeAdsFreeUntil: e.coffeeAdsFreeUntil,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to record coffee purchase' });
  }
});

/** POST /entitlements/premium — record premium purchase (adds 1 month from now or from existing expiry). */
entitlementsRouter.post('/premium', async (req, res) => {
  const anonymousId = req.headers[ANONYMOUS_ID_HEADER] as string | undefined;
  if (!anonymousId || anonymousId.length < 10) {
    return res.status(400).json({ error: 'Missing or invalid X-Anonymous-Id header' });
  }
  try {
    await setPremiumPurchased(anonymousId);
    const e = await getEntitlements(anonymousId);
    return res.json({
      hasPremium: e.hasPremium,
      premiumExpiresAt: e.premiumExpiresAt,
      hasCoffee: e.hasCoffee,
      coffeeAdsFreeUntil: e.coffeeAdsFreeUntil,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to record premium purchase' });
  }
});
