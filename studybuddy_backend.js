const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const MAX_BODY = 64 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > MAX_BODY) {
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function callAnthropic(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 500, data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callGemini({ prompt, system, model = GEMINI_MODEL }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 3000, temperature: 0.25 }
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-goog-api-key': GEMINI_API_KEY
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if ((res.statusCode || 500) >= 400) {
          return resolve({ status: res.statusCode || 500, data });
        }
        try {
          const parsed = JSON.parse(data || '{}');
          const text = (parsed.candidates || [])
            .flatMap(c => c.content?.parts || [])
            .map(p => p.text || '')
            .filter(Boolean)
            .join('');
          resolve({ status: 200, data: JSON.stringify({ content: [{ text }] }) });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callGeminiWithFallback({ prompt, system }) {
  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS])];
  let lastResponse = null;
  for (const model of models) {
    const response = await callGemini({ prompt, system, model });
    lastResponse = response;
    const body = String(response.data || '');
    const overloaded =
      response.status === 429 ||
      response.status === 503 ||
      /high demand|overloaded|temporarily unavailable|try again later/i.test(body);
    if (!overloaded) return response;
    console.warn(`Gemini model ${model} is busy; trying fallback model.`);
  }
  return lastResponse;
}

async function handleClaude(req, res) {
  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
    return send(res, 500, JSON.stringify({ error: 'Server missing GEMINI_API_KEY or ANTHROPIC_API_KEY' }));
  }

  try {
    const raw = await readBody(req);
    const input = JSON.parse(raw || '{}');
    const prompt = String(input.prompt || '').slice(0, 16000);
    const system = String(input.system || 'You are StudyBuddy AI, a helpful study assistant.').slice(0, 2000);
    const tools = Array.isArray(input.tools) ? input.tools : undefined;

    if (!prompt.trim()) {
      return send(res, 400, JSON.stringify({ error: 'Missing prompt' }));
    }

    let upstream;
    if (GEMINI_API_KEY) {
      upstream = await callGeminiWithFallback({ prompt, system });
    } else {
      const payload = {
        model: ANTHROPIC_MODEL,
        max_tokens: 1400,
        system,
        messages: [{ role: 'user', content: prompt }]
      };
      if (tools) payload.tools = tools;
      upstream = await callAnthropic(payload);
    }
    send(res, upstream.status, upstream.data);
  } catch (err) {
    send(res, 500, JSON.stringify({ error: err.message || 'Backend error' }));
  }
}

function serveFile(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = path.normalize(urlPath === '/' ? '/studybuddy_v3.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method === 'POST' && req.url === '/api/claude') return handleClaude(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveFile(req, res);
  send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
});

server.listen(PORT, () => {
  console.log(`StudyBuddy backend running at http://localhost:${PORT}`);
  console.log(GEMINI_API_KEY ? `Using Gemini model ${GEMINI_MODEL}` : `Using Anthropic model ${ANTHROPIC_MODEL}`);
});
