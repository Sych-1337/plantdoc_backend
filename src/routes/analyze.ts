import express from 'express';
import multer from 'multer';

import { consume } from '../store/usage';
import { analyzeImages, analyzeSchema } from '../services/ai_client';

const upload = multer({ storage: multer.memoryStorage() });
const ANONYMOUS_ID_HEADER = 'x-anonymous-id';
const MAX_IMAGES = 5;

export const analyzeRouter = express.Router();

analyzeRouter.post('/', upload.array('images', MAX_IMAGES), async (req, res) => {
  const anonymousId = req.headers[ANONYMOUS_ID_HEADER] as string | undefined;
  if (!anonymousId || anonymousId.length < 10) {
    return res.status(400).json({ error: 'X-Anonymous-Id header is required for usage limits' });
  }

  const scanResult = await consume(anonymousId, 'scan');
  if (!scanResult.allowed) {
    return res.status(429).json({
      error: 'Daily scan limit reached',
      serverDate: scanResult.serverDate,
      serverMonth: scanResult.serverMonth,
      usage: scanResult.usage,
    });
  }

  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) {
    return res.status(400).json({ error: 'at least one image is required' });
  }

  try {
    const context =
      typeof req.body?.context === 'string'
        ? JSON.parse(req.body.context)
        : undefined;
    const lang =
      typeof req.body?.lang === 'string'
        ? req.body.lang
        : typeof req.query?.lang === 'string'
          ? (req.query.lang as string)
          : undefined;

    const buffers = files.map((f) => f.buffer);
    const aiResponse = await analyzeImages(buffers, context, lang);
    const validated = analyzeSchema.parse(aiResponse);
    return res.json({ ...validated, usage: scanResult.usage });
  } catch (error) {
    console.error('Error in /analyze', error);

    const fallback = {
      diagnoses: [
        {
          name: 'Unknown / Needs more photos',
          confidence: 0,
          shortReason:
            'The system could not confidently determine the issue from this single photo.',
        },
        {
          name: 'Unknown / Needs more photos',
          confidence: 0,
          shortReason:
            'Additional angles and lighting are required for a reliable diagnosis.',
        },
        {
          name: 'Unknown / Needs more photos',
          confidence: 0,
          shortReason:
            'Taking a photo of the soil, stem and leaf underside will help.',
        },
      ],
      urgency: 'medium',
      summary:
        'The issue is not clear enough from this photo alone. More information is needed.',
      immediateActions: [
        'Take a photo of the whole plant from a distance.',
        'Take a close-up of the affected leaves on both sides.',
        'Take a photo of the soil surface and the base of the stem.',
      ],
      treatmentPlan: {
        isLocked: true,
        steps: [],
        safetyNotes: [],
        prevention: [],
      },
    };

    return res.status(200).json(fallback);
  }
});

