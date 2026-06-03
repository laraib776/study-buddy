import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

[
  path.resolve(process.cwd(), '.env'),
  path.resolve(currentDir, '../../.env'),
  path.resolve(currentDir, '../../../.env')
].forEach((envPath) => dotenv.config({ path: envPath, override: false }));

const env = process.env;

export function getConfig() {
  return {
    PORT: Number(env.PORT || 8787),
    GEMINI_API_KEY: env.GEMINI_API_KEY || '',
    GEMINI_MODEL: env.GEMINI_MODEL || 'gemini-2.5-flash',
    GEMINI_FALLBACK_MODELS: env.GEMINI_FALLBACK_MODELS?.split(',').map(v => v.trim()).filter(Boolean) || [],
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || '',
    ANTHROPIC_MODEL: env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
  };
}
