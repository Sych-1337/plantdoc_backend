import { google } from 'googleapis';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

const PREMIUM_PRODUCT_ID = 'plant_doctor_premium_monthly';
const COFFEE_PRODUCT_ID = 'plant_doctor_coffee';

type VerifyResult = { ok: true; premiumExpiresAt?: string | null } | { ok: false; reason: string };

function getPackageName(): string {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!packageName) {
    throw new Error('GOOGLE_PLAY_PACKAGE_NAME is not set');
  }
  return packageName;
}

function getCredentialsFromEnv():
  | { client_email: string; private_key: string }
  | undefined {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as {
    client_email?: string;
    private_key?: string;
  };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing client_email/private_key');
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

async function getPublisherClient() {
  const credentials = getCredentialsFromEnv();
  const auth = new google.auth.GoogleAuth({
    scopes: [ANDROID_PUBLISHER_SCOPE],
    credentials,
  });
  return google.androidpublisher({
    version: 'v3',
    auth,
  });
}

export async function verifyAndroidPremiumPurchase(
  productId: string,
  purchaseToken: string,
): Promise<VerifyResult> {
  if (productId !== PREMIUM_PRODUCT_ID) {
    return { ok: false, reason: 'Unexpected premium productId' };
  }
  try {
    const packageName = getPackageName();
    const publisher = await getPublisherClient();
    const response = await publisher.purchases.subscriptions.get({
      packageName,
      subscriptionId: productId,
      token: purchaseToken,
    });
    const body = response.data;
    const expiryTimeMillis = body.expiryTimeMillis ? Number(body.expiryTimeMillis) : NaN;
    if (!Number.isFinite(expiryTimeMillis)) {
      return { ok: false, reason: 'Missing subscription expiry' };
    }
    if (expiryTimeMillis <= Date.now()) {
      return { ok: false, reason: 'Subscription is expired' };
    }
    const premiumExpiresAt = new Date(expiryTimeMillis).toISOString();
    return { ok: true, premiumExpiresAt };
  } catch (error) {
    return { ok: false, reason: 'Google Play premium verification failed' };
  }
}

export async function verifyAndroidCoffeePurchase(
  productId: string,
  purchaseToken: string,
): Promise<VerifyResult> {
  if (productId !== COFFEE_PRODUCT_ID) {
    return { ok: false, reason: 'Unexpected coffee productId' };
  }
  try {
    const packageName = getPackageName();
    const publisher = await getPublisherClient();
    const response = await publisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    });
    const body = response.data;
    if (body.purchaseState !== 0) {
      return { ok: false, reason: 'Coffee purchase is not completed' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'Google Play coffee verification failed' };
  }
}
