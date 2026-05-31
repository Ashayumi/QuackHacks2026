import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // serves index.html and all static files

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';

// ============================================================
//   GAME CONFIG
// ============================================================

const QUESTIONS = [
  "Where were you between 8pm and 10pm on the night of the incident?",
  "Can you describe your relationship with the victim?",
  "Did you see anyone acting suspiciously that evening?",
  "Is there anyone at the event who you believe had a reason to harm the victim?",
  "Did you hear or see anything unusual in the hour before the body was discovered?"
];

const SUSPECTS = {
  suspect_1: {
    name: "Victor Hale",
    occupation: "Retired Judge",
    personality: "Cold, calculating, speaks in precise measured sentences. Rarely shows emotion. Chooses words with surgical precision. Pauses before answering as if weighing the legal implications of every statement.",
    backstory: "A once-respected judge with a reputation for harsh sentencing. Rumored to have accepted bribes years ago. Has a deeply buried secret involving the victim that he has kept hidden for decades.",
    alibi: "Claims to have been in the library reading alone all evening. No witnesses.",
    relationship_to_victim: "Former professional associate. The victim had recently discovered evidence of Victor's past corruption and was threatening to expose him."
  },
  suspect_2: {
    name: "Elena Marsh",
    occupation: "Event Photographer",
    personality: "Nervous energy, speaks quickly, deflects with humor when uncomfortable. Fidgets. Often trails off mid-sentence. Genuinely warm but visibly anxious throughout questioning.",
    backstory: "A freelance photographer hired to document the evening. Had a bitter dispute with the victim over unpaid work — the victim owed her three months of fees and had publicly humiliated her at a previous event.",
    alibi: "Says she was setting up equipment in the east hallway until 9pm, then circulating the party. Several guests may have seen her.",
    relationship_to_victim: "Professional — she was hired by the victim. Their relationship had soured badly over money."
  },
  suspect_3: {
    name: "Marcus Webb",
    occupation: "Pharmaceutical Sales Rep",
    personality: "Charming, disarmingly confident, almost too relaxed. Answers questions with questions. Smiles at inappropriate moments. Very practiced at controlling conversations.",
    backstory: "A smooth-talking salesman who knew the victim through a mutual business deal that collapsed — Marcus lost significant money and blamed the victim entirely. Has a history of bending rules.",
    alibi: "Claims he was on a phone call in the garden for most of the evening. Cannot produce phone records to verify.",
    relationship_to_victim: "Former business partner. The deal that collapsed left Marcus in serious financial trouble."
  },
  suspect_4: {
    name: "Dorothea Crane",
    occupation: "Retired Actress",
    personality: "Theatrical, dramatic, prone to monologuing. Treats every question like a performance. Fiercely protective of her legacy and public image. Occasionally lets the mask slip and reveals genuine bitterness.",
    backstory: "A faded star of the stage attending as guest of honor. The victim had written a devastating tell-all memoir chapter about Dorothea that was set to publish next month, threatening to destroy what remained of her reputation.",
    alibi: "Says she was in the drawing room entertaining guests all evening. Many witnesses — but she slipped away twice that no one can fully account for.",
    relationship_to_victim: "Long-standing feud going back fifteen years. Recently escalated due to the memoir."
  },
  suspect_5: {
    name: "Nolan Price",
    occupation: "Private Chef",
    personality: "Quiet, methodical, economical with words. Speaks only when necessary. Observant — notices details others miss. Calm in a way that feels practiced rather than natural.",
    backstory: "Hired to cater the evening. Has a sealed juvenile record he is fiercely protective of. The victim had somehow obtained information about his past and had been quietly blackmailing him for six months.",
    alibi: "Claims he never left the kitchen except to deliver dishes to the dining room. Kitchen staff can partially verify this but there is a 40-minute gap unaccounted for.",
    relationship_to_victim: "Victim was blackmailing Nolan. Nolan had recently refused to keep paying."
  }
};

// ============================================================
//   BUILD SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(suspectId, isKiller) {
  const s = SUSPECTS[suspectId];

  const roleInstruction = isKiller
    ? `YOU ARE THE KILLER. You murdered Reginald Ashworth.
       You must lie convincingly but subtly. Do NOT confess under any circumstances.
       Weave in small, detectable inconsistencies — things that a sharp detective
       cross-referencing your answers with other suspects might catch.
       For example: claim you were somewhere that another innocent suspect will
       contradict. Be slightly evasive on the time gap. Show just a flicker of
       emotion you quickly suppress. Never over-explain. Liars over-explain.`
    : `YOU ARE INNOCENT. You did not kill Reginald Ashworth.
       Answer honestly according to your alibi and your genuine feelings.
       You may be nervous, defensive, or emotional — that fits your personality —
       but your answers should be internally consistent and not contradict
       what other innocent people at the event would truthfully say.`;

  return `You are ${s.name}, ${s.occupation}.

PERSONALITY: ${s.personality}

BACKSTORY: ${s.backstory}

YOUR ALIBI FOR THE NIGHT: ${s.alibi}

YOUR RELATIONSHIP WITH THE VICTIM: ${s.relationship_to_victim}

THE SITUATION: You are being questioned as a suspect in the murder of Reginald Ashworth,
a wealthy financier found dead in his private study during his own dinner party on October 14th
at Ashworth Manor. You are speaking into a recorded tape as part of the official investigation.

${roleInstruction}

RESPONSE FORMAT RULES:
- Answer each question in your own voice and personality
- Keep each answer to 2-4 sentences — no more
- Label each answer exactly as: "Answer 1:", "Answer 2:", "Answer 3:", "Answer 4:", "Answer 5:"
- Do not number or restate the questions
- Do not break character under any circumstances
- Do not add any preamble or sign-off`;
}

// ============================================================
//   ROUTES
// ============================================================

// Generate all 5 tapes at game start
app.post('/api/start-game', async (req, res) => {
  try {
    // Randomly assign the killer server-side (never exposed to client until game end)
    const suspectIds = Object.keys(SUSPECTS);
    const killerId = suspectIds[Math.floor(Math.random() * suspectIds.length)];

    // Store killer in a simple server-side session (use a real session store in production)
    // For hackathon purposes we send back a signed token approach —
    // here we just keep it simple and store in memory keyed by a session ID
    const sessionId = Math.random().toString(36).slice(2);
    activeSessions[sessionId] = { killerId, startedAt: Date.now() };

    console.log(`[GAME] New game started. Session: ${sessionId}. Killer: ${killerId}`);

    // Generate all 5 tapes simultaneously
    const questionsText = QUESTIONS.map((q, i) => `Question ${i + 1}: ${q}`).join('\n');

    const tapePromises = suspectIds.map(async (suspectId) => {
      const isKiller = suspectId === killerId;
      const systemPrompt = buildSystemPrompt(suspectId, isKiller);

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: questionsText,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      const rawResponse = response.text;
      const answers = parseAnswers(rawResponse);

      return { suspectId, answers };
    });

    const results = await Promise.all(tapePromises);

    // Build tapes object
    const tapes = {};
    results.forEach(({ suspectId, answers }) => {
      tapes[suspectId] = {
        suspectName: SUSPECTS[suspectId].name,
        suspectRole: SUSPECTS[suspectId].occupation,
        answers: QUESTIONS.map((question, i) => ({
          question,
          answer: answers[i] || 'No response recorded.'
        }))
      };
    });

    res.json({ sessionId, tapes, suspects: getSuspectProfiles() });

  } catch (err) {
    console.error('[ERROR] /api/start-game:', err.message);
    res.status(500).json({ error: 'Failed to generate tapes. Please try again.' });
  }
});

// Submit accusation and reveal result
app.post('/api/accuse', (req, res) => {
  const { sessionId, accusedId } = req.body;

  const session = activeSessions[sessionId];
  if (!session) {
    return res.status(400).json({ error: 'Invalid or expired session.' });
  }

  const correct = accusedId === session.killerId;
  const killerName = SUSPECTS[session.killerId].name;
  const accusedName = SUSPECTS[accusedId]?.name || 'Unknown';

  // Clean up session
  delete activeSessions[sessionId];

  console.log(`[GAME] Accusation — Session: ${sessionId}. Accused: ${accusedName}. Correct: ${correct}`);

  res.json({
    correct,
    accusedName,
    killerName,
    killerRole: SUSPECTS[session.killerId].occupation,
    message: correct
      ? `Correct. ${killerName} was the killer.`
      : `Wrong. You accused ${accusedName}, but the killer was ${killerName}.`
  });
});

// ============================================================
//   HELPERS
// ============================================================

// In-memory session store (fine for hackathon, use Redis/DB for production)
const activeSessions = {};

function parseAnswers(response) {
  const answers = [];
  for (let i = 1; i <= 5; i++) {
    const label = `Answer ${i}:`;
    const nextLabel = `Answer ${i + 1}:`;
    const start = response.indexOf(label);
    const end = response.indexOf(nextLabel);
    if (start !== -1) {
      const text = response
        .slice(start + label.length, end !== -1 ? end : undefined)
        .trim();
      answers.push(text);
    } else {
      answers.push('No response recorded.');
    }
  }
  return answers;
}

function getSuspectProfiles() {
  return Object.entries(SUSPECTS).map(([id, s]) => ({
    id,
    name: s.name,
    occupation: s.occupation
  }));
}

// Clean up old sessions every hour
setInterval(() => {
  const oneHour = 60 * 60 * 1000;
  const now = Date.now();
  Object.keys(activeSessions).forEach(id => {
    if (now - activeSessions[id].startedAt > oneHour) {
      delete activeSessions[id];
    }
  });
}, 60 * 60 * 1000);

// ============================================================
//   START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ========================================
  🔍 Dead on Arrival — Server Running
  ========================================
  Local:   http://localhost:${PORT}
  ========================================
  `);
});