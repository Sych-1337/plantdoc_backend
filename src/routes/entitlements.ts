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
import {
  verifyAppleCoffeePurchase,
  verifyApplePremiumPurchase,
} from '../services/appleAppStoreBilling';

const ANONYMOUS_ID_HEADER = 'x-anonymous-id';
const REQUIRE_ANDROID_PURCHASE_VERIFICATION =
  process.env.REQUIRE_ANDROID_PURCHASE_VERIFICATION === 'true';
/** When true, POST /entitlements/* always requires a verified Android or iOS purchase (recommended for production). */
const REQUIRE_PURCHASE_VERIFICATION =
  process.env.REQUIRE_PURCHASE_VERIFICATION === 'true';

export const entitlementsRouter = express.Router();
type PurchasePayload = {
  platform?: string;
  productId?: string;
  purchaseToken?: string;
  receiptData?: string;
  expiresAt?: string;
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
  const isIos = body.platform === 'ios';

  if (REQUIRE_PURCHASE_VERIFICATION) {
    if (!isAndroid && !isIos) {
      return res.status(400).json({ error: 'Missing platform (android or ios)' });
    }
    if (isAndroid) {
      if (!body.purchaseToken || !body.productId) {
        return res.status(400).json({ error: 'Missing Android purchaseToken/productId' });
      }
      const verification = await verifyAndroidCoffeePurchase(body.productId, body.purchaseToken);
      if (!verification.ok) {
        return res.status(403).json({ error: verification.reason });
      }
    } else {
      if (!body.receiptData || !body.productId) {
        return res.status(400).json({ error: 'Missing iOS receiptData/productId' });
      }
      const verification = await verifyAppleCoffeePurchase(body.productId, body.receiptData);
      if (!verification.ok) {
        return res.status(403).json({ error: verification.reason });
      }
    }
  } else if (isAndroid || REQUIRE_ANDROID_PURCHASE_VERIFICATION) {
    if (!body.purchaseToken || !body.productId) {
      return res.status(400).json({ error: 'Missing Android purchaseToken/productId' });
    }
    const verification = await verifyAndroidCoffeePurchase(body.productId, body.purchaseToken);
    if (!verification.ok) {
      return res.status(403).json({ error: verification.reason });
    }
  } else if (isIos) {
    if (!body.receiptData || !body.productId) {
      return res.status(400).json({ error: 'Missing iOS receiptData/productId' });
    }
    const verification = await verifyAppleCoffeePurchase(body.productId, body.receiptData);
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
  const isIos = body.platform === 'ios';
  let verifiedExpiresAt: string | null = null;

  if (REQUIRE_PURCHASE_VERIFICATION) {
    if (!isAndroid && !isIos) {
      return res.status(400).json({ error: 'Missing platform (android or ios)' });
    }
    if (isAndroid) {
      if (!body.purchaseToken || !body.productId) {
        return res.status(400).json({ error: 'Missing Android purchaseToken/productId' });
      }
      const verification = await verifyAndroidPremiumPurchase(body.productId, body.purchaseToken);
      if (!verification.ok) {
        return res.status(403).json({ error: verification.reason });
      }
      verifiedExpiresAt = verification.premiumExpiresAt ?? null;
    } else {
      if (!body.receiptData || !body.productId) {
        return res.status(400).json({ error: 'Missing iOS receiptData/productId' });
      }
      const verification = await verifyApplePremiumPurchase(body.productId, body.receiptData);
      if (!verification.ok) {
        return res.status(403).json({ error: verification.reason });
      }
      verifiedExpiresAt = verification.premiumExpiresAt ?? null;
    }
  } else if (isAndroid || REQUIRE_ANDROID_PURCHASE_VERIFICATION) {
    if (!body.purchaseToken || !body.productId) {
      return res.status(400).json({ error: 'Missing Android purchaseToken/productId' });
    }
    const verification = await verifyAndroidPremiumPurchase(body.productId, body.purchaseToken);
    if (!verification.ok) {
      return res.status(403).json({ error: verification.reason });
    }
    verifiedExpiresAt = verification.premiumExpiresAt ?? null;
  } else if (isIos) {
    if (!body.receiptData || !body.productId) {
      return res.status(400).json({ error: 'Missing iOS receiptData/productId' });
    }
    const verification = await verifyApplePremiumPurchase(body.productId, body.receiptData);
    if (!verification.ok) {
      return res.status(403).json({ error: verification.reason });
    }
    verifiedExpiresAt = verification.premiumExpiresAt ?? null;
  } else {
    verifiedExpiresAt =
      typeof body.expiresAt === 'string' && body.expiresAt ? body.expiresAt : null;
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
