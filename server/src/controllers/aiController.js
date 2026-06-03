import { proxyClaude } from '../services/aiService.js';

export async function handleClaude(req, res, next) {
  try {
    const { prompt, system, tools } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing prompt.' });
    }
    const response = await proxyClaude({ prompt: prompt.slice(0, 16000), system, tools });
    return res.status(response.status).json(response.payload);
  } catch (error) {
    next(error);
  }
}
