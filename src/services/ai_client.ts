import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const diagnosisSchema = z.object({
  name: z.string(),
  confidence: z.number().min(0).max(1),
  shortReason: z.string(),
});

const evidenceItemSchema = z.object({
  symptom: z.string(),
  imageIndex: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
});

export const analyzeSchema = z.object({
  diagnoses: z.array(diagnosisSchema).length(3),
  urgency: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
  immediateActions: z.array(z.string()).min(3).max(6),
  evidence: z.array(evidenceItemSchema).optional().default([]),
  questionsToConfirm: z.array(z.string()).optional().default([]),
  treatmentPlan: z.object({
    isLocked: z.boolean(),
    steps: z
      .array(
        z.object({
          title: z.string(),
          details: z.string(),
          timeframe: z.string(),
        }),
      )
      .optional()
      .default([])
      .transform((arr) => {
        if (arr.length < 5) {
          const pad: Array<{ title: string; details: string; timeframe: string }> = [];
          for (let i = arr.length; i < 5; i++) {
            pad.push({
              title: 'Monitor progress',
              details: 'Reassess plant condition after implementing previous steps.',
              timeframe: 'Ongoing',
            });
          }
          return [...arr, ...pad];
        }
        if (arr.length > 8) return arr.slice(0, 8);
        return arr;
      }),
    safetyNotes: z.array(z.string()).optional().default([]),
    prevention: z.array(z.string()).optional().default([]),
  }),
});

export type AnalyzeResponse = z.infer<typeof analyzeSchema>;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

export async function analyzeImage(
  imageBuffers: Buffer[],
  context?: Record<string, unknown>,
  lang?: string,
): Promise<AnalyzeResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const numImages = imageBuffers.length;
  const languageName = lang
    ? LANGUAGE_NAMES[lang.toLowerCase()] ?? lang
    : 'English';

  const systemPrompt =
    'You are a plant health assistant. Analyze the plant image and return ONLY valid JSON matching the provided schema. ' +
    'Diagnose common issues (overwatering, underwatering, nutrient deficiencies, pests, fungi, light issues). ' +
    'If you are not confident, set all three diagnoses to an "Unknown / Needs more photos" variant and suggest what extra photos to take. ' +
    'Never mention chemicals that are unsafe for home use. Prefer safe, conservative advice. ' +
    `For "evidence": list 2-5 observations (symptom, imageIndex 0-based for which image shows it, confidence 0-1). You have ${numImages} image(s); use imageIndex 0, 1, 2 to refer to each. ` +
    'For "questionsToConfirm": list 2-4 short questions the user could answer or photos they could take to confirm (e.g. "Are new leaves curling?", "Was humidity high recently?"). ' +
    'For "treatmentPlan.steps": provide exactly 5 to 8 steps (minimum 5, maximum 8). Each step must have title, details, and timeframe. ' +
    `Write ALL text fields in the response (diagnoses name and shortReason, summary, immediateActions, evidence symptom, questionsToConfirm, treatmentPlan steps title/details/timeframe, safetyNotes, prevention) ONLY in ${languageName}. Do not use any other language.`;

  const userPrompt = [
    `Analyze this plant ${numImages > 1 ? 'photo set' : 'photo'} (${numImages} image(s)). Image 1 = first, Image 2 = second, etc. Use any additional context if provided.`,
    context ? `Context: ${JSON.stringify(context)}` : '',
    '',
    'Return ONLY JSON, no markdown, no comments. The JSON MUST match this TypeScript-like schema:',
    '',
    'type Diagnosis = { name: string; confidence: number; shortReason: string };',
    'type TreatmentStep = { title: string; details: string; timeframe: string };',
    'type EvidenceItem = { symptom: string; imageIndex: number; confidence: number };',
    'type AnalyzeResponse = {',
    '  diagnoses: [Diagnosis, Diagnosis, Diagnosis];',
    '  urgency: \"low\" | \"medium\" | \"high\";',
    '  summary: string;',
    '  immediateActions: string[]; // 3-6 bullet points',
    `  evidence: EvidenceItem[]; // 2-5 items, imageIndex 0..${numImages - 1} for each image`,
    '  questionsToConfirm: string[]; // 2-4 questions to confirm diagnosis',
    '  treatmentPlan: {',
    '    isLocked: boolean;',
    '    steps: TreatmentStep[]; // exactly 5 to 8 steps',
    '    safetyNotes: string[];',
    '    prevention: string[];',
    '  };',
    '};',
  ].join('\n');

  const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: userPrompt },
  ];
  for (const buf of imageBuffers) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` },
    });
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: contentParts,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  const parsedRaw = JSON.parse(content);
  const parsed = analyzeSchema.parse(parsedRaw);
  return parsed;
}

export async function chatWithContext(
  messages: ChatMessage[],
  context?: Record<string, unknown>,
): Promise<ChatMessage> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const systemPrompt =
    'You are a careful plant coach. Answer ONLY questions about plants, flowers, gardening, soil, watering and plant care. ' +
    'If the user asks about anything unrelated to plants (for example programming, math, politics, news, personal topics, etc.), ' +
    'politely refuse to answer and clearly say that you can only help with plants and gardening, without giving an answer to the off-topic question. ' +
    'Base your answers only on plant-related knowledge and the provided context. ' +
    'Never recommend mixing household chemicals or anything that could be dangerous to pets or humans. ' +
    'If you are not sure, say that you are not sure and suggest consulting a local specialist. ' +
    'Respond concisely using short paragraphs and bullet lists where appropriate.';

  const contextMessage: ChatMessage | undefined = context
    ? {
        role: 'system',
        content: `Additional structured context for this conversation (do NOT expose raw JSON to the user, just use it internally): ${JSON.stringify(
          context,
        )}`,
      }
    : undefined;

  const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ifDefined(contextMessage),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ].filter(Boolean) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: apiMessages,
  });

  const answer = completion.choices[0]?.message?.content ?? '';
  return { role: 'assistant', content: answer };
}

function ifDefined<T>(value: T | undefined): T | undefined {
  return value;
}

