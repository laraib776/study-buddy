import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes/apiRoutes.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: '128kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan('tiny'));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a moment.' }
});

app.use('/api', limiter, apiRoutes);
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

export default app;
