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
//   ELEVENLABS TEXT-TO-SPEECH CONFIG
// ============================================================
// Reads ELEVENLABS_API_KEY from .env. Each suspect maps to an ElevenLabs
// voice_id (find these in your ElevenLabs dashboard → Voices → "..." → Copy ID).
// Until you fill them in, the DEFAULT_VOICE is used so the feature still works.

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const TTS_MODEL = 'eleven_multilingual_v2';
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // "Rachel" — a public ElevenLabs voice used as a fallback

const VOICES = {
  suspect_1: 'VOICE_ID_BILL',       // Bill Keady
  suspect_2: 'VOICE_ID_STEPHANIE',  // Stephanie Beinart
  suspect_3: 'VOICE_ID_CHRIS',      // Chris Yoder
  suspect_4: 'VOICE_ID_IAN',        // Ian Beard
  suspect_5: 'VOICE_ID_BEATRIZ',    // Beatriz Arevalo
  suspect_6: 'VOICE_ID_JACOB'       // Jacob Hurst
};

function resolveVoice(suspectId) {
  const v = VOICES[suspectId];
  // Use the mapped voice only if it has actually been set (not a placeholder)
  return v && !v.startsWith('VOICE_ID_') ? v : DEFAULT_VOICE;
}

// ============================================================
//   GAME CONFIG
// ============================================================

const QUESTIONS = [
  "Where were you between 8pm and 10pm on the night of the incident?",
  "Can you describe your relationship with the victim?",
  "Did you see anyone acting suspiciously that evening?",
  "Is there anyone at the event who you believe had a reason to harm the victim?",
  "Describe your normal day at work."
];

const SUSPECTS = {
  suspect_1: {
    name: "Bill Keady",
    occupation: "General Manager",
    personality: "Around 30 years old, short tempered adult male, rough personality, normally on edge",
    backstory: "Head manager, hates people who call out, also wont take disciplinary action towards the victim for some reason? Maybe he had plans of his own...",
    alibi: "Claims to be in a conference call when the murder occured",
    relationship_to_victim: "Boss"
  },
  suspect_2: {
    name: "Stephanie Beinart",
    occupation: "Assistant Manager",
    personality: "Late 40s woman, loves to talk alot, will add unnecessary words, especially and im like every few sentences, loud",
    backstory: "Always stays after work hours, workaholic, Larry never stays a minute after his shift. Maybe theres something there...",
    alibi: "She was blowing up balloons while talking to a customer",
    relationship_to_victim: "Superior"
  },
  suspect_3: {
    name: "Chris Yoder",
    occupation: "Floor Associate",
    personality: "Older woman, sweeter personality. Can snap at someone if she is strongly provoked. Normally forgets about a lot of things",
    backstory: "Has retired like 6 times, keeps coming bacl. Why would someone do that? Seems suspicious.",
    alibi: "Stocking the floor, updating price tags",
    relationship_to_victim: "Coworker"
  },
  suspect_4: {
    name: "Ian Beard",
    occupation: "Tech Supervisor",
    personality: "Very flat personality. Believes that he knows everything and has a superiority complex. Will go out of his way to correct you",
    backstory: "Usually the only manager when Larry comes in, he's used to his callouts at this point. However its very possible he could have snapped after last week",
    alibi: "He was fixing a computer at the front register",
    relationship_to_victim: "Coworker"
  },
  suspect_5: {
    name: "Beatriz Arevalo",
    occupation: "Floor Associate",
    personality: "Early 20s woman, Very bubbly personality. Laughs at a lot of stuff. Does not get mad at a lot of things. Struggles explaining things. Super squishy. Incredibly artistic. And loves to mimic animals. REALLY into yaoi for some reason, and is definitely the weird one of the group. But also has some surprisingly good advice/ insight into lots of things",
    backstory: "Straight uop thinks Larry is useless, I heard her say it. Do i need to say much more?",
    alibi: "Was on break, eating inside of the break room.",
    relationship_to_victim: "Coworker"
  },
  suspect_6: {
    name: "Jacob Hurst",
    occupation: "Print Associate",
    personality: "Can be really nice, but can also be very rude. Often its a coin flip when it comes to how he handles a situation. Always sarcastic saying like Alright Buddy",
    backstory: "Used to think Larry was the GOAT, then he understood the truth. Sometimes betrayal is too much to handle.",
    alibi: "Was helping someone at the print counter.",
    relationship_to_victim: "Coworker"
  }
};

// ============================================================
//   BUILD SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(suspectId, isKiller) {
  const s = SUSPECTS[suspectId];

  const roleInstruction = isKiller
    ? `YOU ARE THE KILLER. You murdered Larry Misaras.
       You must lie convincingly but subtly. Do NOT confess under any circumstances.
       Weave in small, detectable inconsistencies — things that a sharp detective
       cross-referencing your answers with other suspects might catch.
       For example: claim you were somewhere that another innocent suspect will
       contradict. Be slightly evasive on the time gap. Show just a flicker of
       emotion you quickly suppress. Never over-explain. Liars over-explain.`
    : `YOU ARE INNOCENT. You did not kill Larry Misaras.
       Answer honestly according to your alibi and your genuine feelings.
       You may be nervous, defensive, or emotional — that fits your personality —
       but your answers should be internally consistent and not contradict
       what other innocent people at the event would truthfully say.`;

  return `You are ${s.name}, ${s.occupation}.

PERSONALITY: ${s.personality}

BACKSTORY: ${s.backstory}

YOUR ALIBI FOR THE NIGHT: ${s.alibi}

YOUR RELATIONSHIP WITH THE VICTIM: ${s.relationship_to_victim}

THE SITUATION: Staples is a normal place, or is what it looks like. Office supplies, print services, party supplies for some wild reason. But 
one of their employees has been murdered! Larry was a cashier, been around for years. Unfortunately, he was a loose cannon, always calling out on shifts, the biggest yapper in the store
and regardless of his tenure, always seemed to need help. Everyone had a reason to take care of him for good, but so many disgruntled employees
its hard to know who exactly did it. See if you can get some information out of everyone to solve this mystery for good, otherwise you're fired.

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

// Voice a tape answer with ElevenLabs TTS — returns audio/mpeg bytes
app.post('/api/tts', async (req, res) => {
  try {
    const { suspectId, text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Missing text to voice.' });
    }
    if (!ELEVEN_KEY || ELEVEN_KEY === 'your_elevenlabs_api_key_here') {
      return res.status(500).json({ error: 'ELEVENLABS_API_KEY is not set in .env.' });
    }

    const voiceId = resolveVoice(suspectId);

    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVEN_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL,
          voice_settings: { stability: 0.4, similarity_boost: 0.8 }
        })
      }
    );

    if (!elevenRes.ok) {
      const detail = await elevenRes.text();
      console.error('[ERROR] /api/tts:', elevenRes.status, detail);
      return res.status(502).json({ error: 'ElevenLabs TTS request failed.' });
    }

    const audio = Buffer.from(await elevenRes.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);

  } catch (err) {
    console.error('[ERROR] /api/tts:', err.message);
    res.status(500).json({ error: 'Failed to generate audio.' });
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