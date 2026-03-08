import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { analyzeRouter } from './routes/analyze';
import { chatRouter } from './routes/chat';
import { entitlementsRouter } from './routes/entitlements';
import { usageRouter } from './routes/usage';

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.use('/analyze', analyzeRouter);
app.use('/chat', chatRouter);
app.use('/entitlements', entitlementsRouter);
app.use('/usage', usageRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Plant Doctor backend listening on http://${host}:${port}`);
});

