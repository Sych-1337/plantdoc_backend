import express from 'express';
import { getUsage, consume, addRewardedBonus } from '../store/usage';
import type { ConsumeType } from '../store/usage';

const ANONYMOUS_ID_HEADER = 'x-anonymous-id';

export const usageRouter = express.Router();

function getAnonymousId(req: express.Request): string | null {
  const id = req.headers[ANONYMOUS_ID_HEADER] as string | undefined;
  if (!id || id.length < 10) return null;
  return id;
}

/** GET /usage — returns server-date-based usage (for display and limits). */
usageRouter.get('/', async (req, res) => {
  const anonymousId = getAnonymousId(req);
  if (!anonymousId) {
    return res.status(400).json({ error: 'Missing or invalid X-Anonymous-Id header' });
  }
  try {
    const { serverDate, serverMonth, freeUsagePeriodId, freeUsagePeriodEndsAt, usage } =
      await getUsage(anonymousId);
    return res.json({
      serverDate,
      serverMonth,
      freeUsagePeriodId,
      freeUsagePeriodEndsAt,
      usage,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get usage' });
  }
});

/** POST /usage/consume — consume one scan/quiz/chat. Body: { type: 'scan' | 'quiz' | 'chat' }. Returns 429 if over limit. */
usageRouter.post('/consume', async (req, res) => {
  const anonymousId = getAnonymousId(req);
  if (!anonymousId) {
    return res.status(400).json({ error: 'Missing or invalid X-Anonymous-Id header' });
  }
  const type = req.body?.type as ConsumeType | undefined;
  if (type !== 'scan' && type !== 'quiz' && type !== 'chat') {
    return res.status(400).json({ error: 'body.type must be scan, quiz, or chat' });
  }
  try {
    const result = await consume(anonymousId, type);
    if (!result.allowed) {
      return res.status(429).json({
        error: 'limit reached',
        serverDate: result.serverDate,
        serverMonth: result.serverMonth,
        usage: result.usage,
      });
    }
    return res.json({
      serverDate: result.serverDate,
      serverMonth: result.serverMonth,
      usage: result.usage,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to consume' });
  }
});

/** POST /usage/rewarded — add bonus from watching a reward ad (2 scans, 1 quiz, 5 chat). */
usageRouter.post('/rewarded', async (req, res) => {
  const anonymousId = getAnonymousId(req);
  if (!anonymousId) {
    return res.status(400).json({ error: 'Missing or invalid X-Anonymous-Id header' });
  }
  try {
    const usage = await addRewardedBonus(anonymousId);
    return res.json({ usage });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add rewarded bonus' });
  }
});
