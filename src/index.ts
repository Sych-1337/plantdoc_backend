import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { initFirebase } from './services/firebase';
import { analyzeRouter } from './routes/analyze';
import { chatRouter } from './routes/chat';
import { entitlementsRouter } from './routes/entitlements';

initFirebase();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/analyze', analyzeRouter);
app.use('/chat', chatRouter);
app.use('/entitlements', entitlementsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Plant Doctor backend listening on port ${port}`);
});

