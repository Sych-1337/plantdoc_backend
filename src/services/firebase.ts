/**
 * Firebase Admin SDK for Realtime Database.
 * Used to persist entitlements (no PII). Optional: if env not set, entitlements use in-memory fallback.
 */

import * as admin from 'firebase-admin';
import type { Database } from 'firebase-admin/database';

let db: Database | null = null;

export function initFirebase(): void {
  if (admin.apps.length > 0) return;

  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  const credJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!databaseURL || !credJson) {
    console.warn('Firebase not configured (FIREBASE_DATABASE_URL / FIREBASE_SERVICE_ACCOUNT_JSON). Entitlements will use in-memory store.');
    return;
  }

  try {
    const credential = admin.credential.cert(JSON.parse(credJson) as admin.ServiceAccount);
    admin.initializeApp({
      credential,
      databaseURL,
    });
    db = admin.database();
    console.log('Firebase Realtime Database connected for entitlements.');
  } catch (e) {
    console.warn('Firebase init failed:', e);
  }
}

export function getDatabase(): Database | null {
  return db;
}

/** Ref for one user's entitlements. Key by anonymousId (e.g. UUID — no . $ # [ ] /). */
export function entitlementsRef(anonymousId: string): ReturnType<Database['ref']> | null {
  if (!db) return null;
  return db.ref(`entitlements/${anonymousId}`);
}
