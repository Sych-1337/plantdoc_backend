import express from 'express';
import {
  getEntitlements,
  setCoffeePurchased,
  setPremiumPurchased,
} from '../store/entitlements';
import {
  verifyAndroidCoffeePurchase,
  verifyAndroidPremiumPurchase,
} from '../services/googlePlayBilling';

const ANONYMOUS_ID_HEADER = 'x-anonymous-id';
const REQUIRE_ANDROID_PURCHASE_VERIFICATION =
  process.env.REQUIRE_ANDROID_PURCHASE_VERIFICATION === 'true';

export const entitlementsRouter = express.Router();
type PurchasePayload = {
  platform?: string;
  productId?: string;
  purchaseToken?: string;
};

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
  const body = (req.body ?? {}) as PurchasePayload;
  const isAndroid = body.platform === 'android';
  if (isAndroid || REQUIRE_ANDROID_PURCHASE_VERIFICATION) {
    if (!body.purchaseToken || !body.productId) {
      return res.status(400).json({ error: 'Missing Android purchaseToken/productId' });
    }
    const verification = await verifyAndroidCoffeePurchase(body.productId, body.purchaseToken);
    if (!verification.ok) {
      return res.status(403).json({ error: verification.reason });
    }
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
  const body = (req.body ?? {}) as PurchasePayload;
  const isAndroid = body.platform === 'android';
  let verifiedExpiresAt: string | null = null;
  if (isAndroid || REQUIRE_ANDROID_PURCHASE_VERIFICATION) {
    if (!body.purchaseToken || !body.productId) {
      return res.status(400).json({ error: 'Missing Android purchaseToken/productId' });
    }
    const verification = await verifyAndroidPremiumPurchase(body.productId, body.purchaseToken);
    if (!verification.ok) {
      return res.status(403).json({ error: verification.reason });
    }
    verifiedExpiresAt = verification.premiumExpiresAt ?? null;
  }
  try {
    await setPremiumPurchased(anonymousId, verifiedExpiresAt);
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
