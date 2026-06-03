# How To Run The App

## 1. Install Dependencies

```powershell
npm install
```

## 2. Start The Frontend

```powershell
npm run dev
```

Open the URL shown in the terminal, usually:

```txt
http://localhost:5173
```

## 3. Start The Backend

Open a second terminal in the same folder:

```powershell
npm run backend
```

Backend runs on:

```txt
http://localhost:8787
```

## 4. Environment File

Create or update `.env` in the project root:

```env
GEMINI_API_KEY=your-gemini-key-here
GEMINI_MODEL=gemini-2.5-flash
PORT=8787
```

## 5. Build For Production

```powershell
npm run build
```

Preview the production build:

```powershell
npm run serve
```

## Optional: Run Old HTML Version

```powershell
python -m http.server 5500 --bind 127.0.0.1
```

Open:

```txt
http://127.0.0.1:5500/studybuddy_v3.html
```
<!-- parse error -->
<!-- Why it happened: AI sometimes returns JSON with extra text/Markdown or { cards: [...] } instead of a plain array, so the old parser rejected it.

How fixed: I made the parser extract valid JSON from messy AI replies and made flashcards accept both array and object formats. -->