import express from 'express';

import { ChatMessage, chatWithContext } from '../services/ai_client';

export const chatRouter = express.Router();

chatRouter.post('/', async (req, res) => {
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
    return res.json({ message: reply });
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

