# StudyBuddy Free AI Setup

You said no billing, so do **not** use Firebase Functions for AI right now.

Firebase Cloud Functions + Secret Manager requires the Blaze plan. The free setup is:

```text
studybuddy_v3.html
  -> local Node backend on your computer
  -> Gemini API free tier key in .env
  -> flashcards / quiz
  -> subjective questions made locally from your notes
```

Your Gemini key stays in `.env`. It is not stored in `studybuddy_v3.html`.

## Start The Free Local Backend

Open PowerShell:

```powershell
cd C:\Users\AB\Downloads\mindlock
node studybuddy_backend.js
```

Then open this in your browser:

```text
http://localhost:8787/studybuddy_v3.html
```

Keep the PowerShell window open while using AI features.

## Your Current Local Files

- `.env` stores the Gemini key locally.
- `studybuddy_backend.js` sends requests to Gemini.
- `studybuddy_v3.html` sends AI requests to the local backend on `localhost:8787`.

## If Localhost Refuses To Connect

It means the backend is not running.

Run:

```powershell
cd C:\Users\AB\Downloads\mindlock
node studybuddy_backend.js
```

If port `8787` is already busy, change `PORT=8788` in `.env`, restart the backend, then open:

```text
http://localhost:8788/studybuddy_v3.html
```

## Important

- This is free/simple for your own computer.
- Do not share `.env`.
- Do not upload `.env` to GitHub.
- The app still uses Firebase Auth/Firestore for login/data.
- AI generation uses local backend, not Firebase Functions.

## Future Deployment

For real public deployment without exposing your Gemini key, you will need some backend with environment secrets.

Firebase Functions is the clean Firebase way, but it needs Blaze billing. Until then, local backend is the safest no-money option.


Upload RACE Dataset
Please upload the downloaded and extracted RACE dataset files (specifically the train and dev folders containing the data) into a directory named race_local in your Colab environment. You can do this by clicking the folder icon on the left sidebar, navigating to your desired location (e.g., the root /content/), and then using the upload button.

Once uploaded, your file structure  of teh dataset should look something like:

/content/
├── race_local/
│   ├── train/
│   │   ├── high/
│   │   │   ├── <doc_id>.txt
│   │   │   └── <doc_id>.txt.json
│   │   └── middle/
│   │       ├── <doc_id>.txt
│   │       └── <doc_id>.txt.json
│   └── dev/
│       ├── high/
│       │   ├── <doc_id>.txt
│       │   └── <doc_id>.txt.json
│       └── middle/
│           ├── <doc_id>.txt
│           └── <doc_id>.txt.json
After uploading, the convert_race function will be modified to load from this local path.
