import express from 'express';

import { consume } from '../store/usage';
import { ChatMessage, chatWithContext } from '../services/ai_client';

const ANONYMOUS_ID_HEADER = 'x-anonymous-id';

export const chatRouter = express.Router();

chatRouter.post('/', async (req, res) => {
  const anonymousId = req.headers[ANONYMOUS_ID_HEADER] as string | undefined;
  if (!anonymousId || anonymousId.length < 10) {
    return res.status(400).json({ error: 'X-Anonymous-Id header is required for usage limits' });
  }

  const chatResult = await consume(anonymousId, 'chat');
  if (!chatResult.allowed) {
    return res.status(429).json({
      error: 'Daily chat limit reached',
      serverDate: chatResult.serverDate,
      serverMonth: chatResult.serverMonth,
      usage: chatResult.usage,
    });
  }

  const { messages, scanResult, wateringProfile } = req.body as {
    messages: ChatMessage[];
    scanResult?: unknown;
    wateringProfile?: unknown;
  };

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const context: Record<string, unknown> = {};
    if (scanResult) context.scanResult = scanResult;
    if (wateringProfile) context.wateringProfile = wateringProfile;

    const reply = await chatWithContext(messages, context);
    return res.json({ message: reply, usage: chatResult.usage });
  } catch (error) {
    console.error('Error in /chat', error);
    const fallback: ChatMessage = {
      role: 'assistant',
      content:
        'I could not process your request due to a technical issue. Please try again in a moment or rephrase your question about the plant.',
    };
    return res.status(200).json({ message: fallback });
  }
});

