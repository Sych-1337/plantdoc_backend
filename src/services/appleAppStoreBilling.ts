import https from 'node:https';

const APPLE_VERIFY_RECEIPT_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_RECEIPT_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';
const PREMIUM_PRODUCT_ID = 'plant_doctor_premium_monthly';
const COFFEE_PRODUCT_ID = 'plant-doctor-coffee';

type VerifyResult = { ok: true; premiumExpiresAt?: string | null } | { ok: false; reason: string };

type AppleTransaction = {
  product_id?: string;
  expires_date_ms?: string;
};

type VerifyReceiptResponse = {
  status?: number;
  receipt?: {
    bundle_id?: string;
    in_app?: AppleTransaction[];
  };
  latest_receipt_info?: AppleTransaction[];
};

function postJson(url: string, body: Record<string, unknown>): Promise<VerifyReceiptResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          try {
            resolve((raw ? JSON.parse(raw) : {}) as VerifyReceiptResponse);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function verifyReceipt(receiptData: string): Promise<VerifyReceiptResponse> {
  const body: Record<string, unknown> = {
    'receipt-data': receiptData,
    'exclude-old-transactions': true,
  };
  if (process.env.APP_STORE_SHARED_SECRET) {
    body.password = process.env.APP_STORE_SHARED_SECRET;
  }

  let response = await postJson(APPLE_VERIFY_RECEIPT_URL, body);
  if (response.status === 21007) {
    response = await postJson(APPLE_VERIFY_RECEIPT_SANDBOX_URL, body);
  }
  return response;
}

function collectTransactions(response: VerifyReceiptResponse): AppleTransaction[] {
  const latest = Array.isArray(response.latest_receipt_info)
    ? response.latest_receipt_info
    : [];
  const inApp = Array.isArray(response.receipt?.in_app) ? response.receipt?.in_app : [];
  return [...latest, ...inApp].filter((item) => item && typeof item === 'object');
}

function bundleIdIsValid(response: VerifyReceiptResponse): boolean {
  const expected = process.env.APP_STORE_BUNDLE_ID;
  if (!expected) return true;
  return response.receipt?.bundle_id === expected;
}

export async function verifyApplePremiumPurchase(
  productId: string,
  receiptData: string,
): Promise<VerifyResult> {
  if (productId !== PREMIUM_PRODUCT_ID) {
    return { ok: false, reason: 'Unexpected premium productId' };
  }

  try {
    const response = await verifyReceipt(receiptData);
    if (response.status !== 0) {
      return { ok: false, reason: 'App Store premium verification failed' };
    }
    if (!bundleIdIsValid(response)) {
      return { ok: false, reason: 'Receipt bundle id mismatch' };
    }

    const matchingTransactions = collectTransactions(response).filter(
      (transaction) => transaction.product_id === productId,
    );
    if (matchingTransactions.length === 0) {
      return { ok: false, reason: 'Premium transaction not found in receipt' };
    }

    const expiryCandidates = matchingTransactions
      .map((transaction) => Number(transaction.expires_date_ms ?? ''))
      .filter((value) => Number.isFinite(value));
    const expiryTimeMillis =
      expiryCandidates.length > 0 ? Math.max(...expiryCandidates) : Number.NaN;

    if (!Number.isNaN(expiryTimeMillis)) {
      if (expiryTimeMillis <= Date.now()) {
        return { ok: false, reason: 'Subscription is expired' };
      }
      return {
        ok: true,
        premiumExpiresAt: new Date(expiryTimeMillis).toISOString(),
      };
    }

    return {
      ok: true,
      premiumExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  } catch {
    return { ok: false, reason: 'App Store premium verification failed' };
  }
}

export async function verifyAppleCoffeePurchase(
  productId: string,
  receiptData: string,
): Promise<VerifyResult> {
  if (productId !== COFFEE_PRODUCT_ID) {
    return { ok: false, reason: 'Unexpected coffee productId' };
  }

  try {
    const response = await verifyReceipt(receiptData);
    if (response.status !== 0) {
      return { ok: false, reason: 'App Store coffee verification failed' };
    }
    if (!bundleIdIsValid(response)) {
      return { ok: false, reason: 'Receipt bundle id mismatch' };
    }

    const hasMatchingTransaction = collectTransactions(response).some(
      (transaction) => transaction.product_id === productId,
    );
    if (!hasMatchingTransaction) {
      return { ok: false, reason: 'Coffee transaction not found in receipt' };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: 'App Store coffee verification failed' };
  }
}
