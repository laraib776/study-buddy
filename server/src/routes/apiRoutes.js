import express from 'express';
import { handleClaude } from '../controllers/aiController.js';

const router = express.Router();

router.post('/claude', handleClaude);

export default router;
