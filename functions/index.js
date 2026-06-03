"use strict";

const { genkit, z } = require("genkit");
const { googleAI } = require("@genkit-ai/google-genai");
const { defineSecret } = require("firebase-functions/params");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const ai = genkit({
  plugins: [googleAI()],
});

const studyBuddyInputSchema = z.object({
  prompt: z.string().min(1).max(24000),
  system: z.string().max(3000).optional(),
  tools: z.any().optional().nullable(),
});

const studyBuddyFlow = ai.defineFlow(
  {
    name: "studyBuddyAiFlow",
    inputSchema: studyBuddyInputSchema,
    outputSchema: z.object({ text: z.string() }),
  },
  async ({ prompt, system }) => {
    const finalSystem =
      system ||
      "You are StudyBuddy AI, a helpful study assistant. Be accurate, concise, and return exactly the requested format.";

    const response = await ai.generate({
      model: googleAI.model(process.env.GEMINI_MODEL || "gemini-2.5-flash"),
      system: finalSystem,
      prompt,
      config: {
        temperature: 0.35,
        maxOutputTokens: 1800,
      },
    });

    return { text: response.text || "" };
  }
);

exports.studyBuddyAi = onCall(
  {
    region: "us-central1",
    secrets: [geminiApiKey],
    cors: true,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Please log in before using AI features.");
    }

    const parsed = studyBuddyInputSchema.safeParse(request.data || {});
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Invalid AI request.");
    }

    try {
      return await studyBuddyFlow(parsed.data);
    } catch (err) {
      console.error("studyBuddyAi failed", err);
      throw new HttpsError("internal", "AI generation failed. Try again in a moment.");
    }
  }
);
