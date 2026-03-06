import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { analyzeRouter } from './routes/analyze';
import { chatRouter } from './routes/chat';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/analyze', analyzeRouter);
app.use('/chat', chatRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Plant Doctor backend listening on port ${port}`);
});

