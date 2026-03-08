import express from 'express';
import multer from 'multer';

import { analyzeImage, analyzeSchema } from '../services/ai_client';

const upload = multer({ storage: multer.memoryStorage() });

export const analyzeRouter = express.Router();

analyzeRouter.post('/', upload.array('images', 3), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length < 1) {
    return res.status(400).json({ error: 'At least one image is required' });
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

    const imageBuffers = files.map((f) => f.buffer);
    const aiResponse = await analyzeImage(imageBuffers, context, lang);
    // Extra safety: validate the response again here.
    const validated = analyzeSchema.parse(aiResponse);
    return res.json(validated);
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
      evidence: [],
      questionsToConfirm: [],
      treatmentPlan: {
        isLocked: true,
        steps: [
          { title: 'Take a photo of the whole plant', details: 'Capture the full plant from a distance.', timeframe: 'Immediate' },
          { title: 'Take close-up of affected leaves', details: 'Both sides of the leaf, good lighting.', timeframe: 'Immediate' },
          { title: 'Photo of soil and stem base', details: 'Shows watering and root zone condition.', timeframe: 'Immediate' },
          { title: 'Monitor for changes', details: 'Track any new symptoms over the next few days.', timeframe: '1 week' },
          { title: 'Reassess with new photos', details: 'Submit additional photos if condition changes.', timeframe: 'Ongoing' },
        ],
        safetyNotes: [],
        prevention: [],
      },
    };

    return res.status(200).json(fallback);
  }
});

