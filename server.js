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
const TTS_MODEL = 'eleven_v3'; // most expressive model — supports [audio tags] like [giggles], [sighs]
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // "Rachel" — a public ElevenLabs voice used as a fallback

const VOICES = {
  suspect_1: 'Ybqj6CIlqb6M85s9Bl4n',       // Bill Keady
  suspect_2: '03vEurziQfq3V8WZhQvn',  // Stephanie Beinart
  suspect_3: 'YHcCpa6SBWnKDaCPZJQR',      // Chris Yoder
  suspect_4: 'sjFiQiLHGgEyVwArBT5s',        // Ian Beard
  suspect_5: 'eppqEXVumQ3CfdndcIBd',    // Beatriz Arevalo
  suspect_6: 'eadgjmk4R4uojdsheG9t'       // Jacob Hurst
};

function resolveVoice(suspectId) {
  const v = VOICES[suspectId];
  // Use the mapped voice only if it has actually been set (not a placeholder)
  return v && !v.startsWith('VOICE_ID_') ? v : DEFAULT_VOICE;
}

// Convert *action* stage directions (what the AI writes) into ElevenLabs v3
// audio tags [action] so the voice performs them instead of reading them aloud.
// e.g. "Oh! *giggles* I was on break." -> "Oh! [giggles] I was on break."
function toAudioTags(text) {
  return text.replace(/\*([^*\n]+)\*/g, (_, inner) => `[${inner.trim()}]`);
}

// ============================================================
//   GAME CONFIG
// ============================================================

// The rooms in the store where the body could be found and where suspects could be.
const ROOMS = [
  "Break Room",
  "Print Counter",
  "Entrance Door",
  "Cash Office",
  "Bill's Office",
  "Aisle 5",
  "Men's Restroom"
];

// Fallback questions used only if the AI case-truth generation fails.
const FALLBACK_QUESTIONS = [
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
//   GENERATE THE HIDDEN CASE TRUTH
// ============================================================
// One Gemini call invents the ground truth for this specific case:
//  - which room the body was found in
//  - what actually happened the night of the murder
//  - one subtle piece of physical evidence that points to the real killer
//  - where each suspect ACTUALLY was (their true location)
//  - 5 fresh interrogation questions
// The player never sees the killer's identity or the suspects' true locations;
// they only see the body location + the evidence clue in the CASE FILE.
// Suspect tapes are then generated FROM this truth so innocents corroborate
// and the killer's lie clashes with the evidence + the others.

async function generateCaseTruth(killerId) {
  const killer = SUSPECTS[killerId];
  const suspectRoster = Object.entries(SUSPECTS)
    .map(([id, s]) => `- ${id} = ${s.name} (${s.occupation}); default alibi: ${s.alibi}`)
    .join('\n');

  const prompt = `You are the game master for a Clue-style murder mystery set at a Staples store.
The victim is Larry Misaras, a long-time cashier — a loud, frequently-absent loose cannon
that many coworkers resented.

THE ROOMS in the store are exactly: ${ROOMS.join(', ')}.

THE SUSPECTS:
${suspectRoster}

THE REAL KILLER for THIS case is: ${killerId} (${killer.name}, ${killer.occupation}).

Invent a fresh, self-consistent ground truth for this specific case. Return ONLY valid JSON
(no markdown, no code fences) with EXACTLY this shape:

{
  "bodyLocation": "<one of the rooms above — where Larry's body was found>",
  "summary": "<2-3 sentence description of what really happened the night of the murder, consistent with the killer being ${killer.name}>",
  "evidence": "<ONE subtle piece of physical evidence found at/near the body that quietly points to the killer WITHOUT naming them — e.g. a smudge of toner, a specific item, a sound someone heard. It should be a clue a sharp detective could connect to the killer's role/location, never an outright giveaway>",
  "questions": ["<question 1>", "<question 2>", "<question 3>", "<question 4>", "<question 5>"],
  "locations": {
    "suspect_1": "<room this suspect was truly in>",
    "suspect_2": "<room>",
    "suspect_3": "<room>",
    "suspect_4": "<room>",
    "suspect_5": "<room>",
    "suspect_6": "<room>"
  }
}

RULES:
- The killer (${killerId}) must truly have been in or near the "bodyLocation" room, OR their true location must conflict with the evidence so a detective can catch them.
- Innocent suspects' true locations should be consistent with each other so their stories corroborate.
- At least one innocent suspect's true location should let them corroborate or clear another innocent, and at least one should be able to cast subtle suspicion toward the killer's area.
- The 5 questions should be natural interrogation questions (about whereabouts that night, the victim, suspicious activity, motive, and daily routine) but freshly worded for this case.
- Keep the evidence subtle — it hints, it does not announce.
- Output JSON only.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json'
    }
  });

  const truth = JSON.parse(response.text);

  // Basic validation / normalization with fallbacks
  if (!Array.isArray(truth.questions) || truth.questions.length < 5) {
    truth.questions = FALLBACK_QUESTIONS;
  }
  truth.questions = truth.questions.slice(0, 5);
  if (!ROOMS.includes(truth.bodyLocation)) {
    truth.bodyLocation = ROOMS[Math.floor(Math.random() * ROOMS.length)];
  }
  if (!truth.locations || typeof truth.locations !== 'object') truth.locations = {};

  return truth;
}

// ============================================================
//   BUILD SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(suspectId, isKiller, caseTruth) {
  const s = SUSPECTS[suspectId];
  const trueLocation = caseTruth.locations[suspectId] || s.alibi;

  const roleInstruction = isKiller
    ? `YOU ARE THE KILLER. You murdered Larry Misaras.
       You must lie convincingly but subtly. Do NOT confess under any circumstances.
       Your TRUE location that night was: "${trueLocation}". You will NOT admit this — you
       will give a false alibi instead, because your true location ties you to the crime.
       Weave in small, detectable inconsistencies — things that a sharp detective
       cross-referencing your answers with other suspects (and the evidence) might catch.
       Claim you were somewhere that an innocent suspect can contradict. Be slightly evasive
       on the time gap. Show just a flicker of emotion you quickly suppress. Never over-explain.
       Liars over-explain. Do NOT mention or react to the specific physical evidence directly.`
    : `YOU ARE INNOCENT. You did not kill Larry Misaras.
       Your TRUE location that night was: "${trueLocation}". Answer honestly about where you
       were and what you genuinely saw and felt. You may be nervous, defensive, or emotional —
       that fits your personality — but your account must be truthful and internally consistent,
       and it must NOT contradict what other honest people would say. If, from your true location,
       you could have plausibly seen or heard something relevant, share it — it may clear an
       innocent person or cast suspicion on someone near the scene.`;

  return `You are ${s.name}, ${s.occupation}.

PERSONALITY: ${s.personality}

BACKSTORY: ${s.backstory}

YOUR RELATIONSHIP WITH THE VICTIM: ${s.relationship_to_victim}

THE CASE (hidden ground truth for THIS interrogation — stay consistent with it):
- Larry Misaras's body was found in: ${caseTruth.bodyLocation}
- What really happened: ${caseTruth.summary}
- A piece of evidence at the scene: ${caseTruth.evidence}
- Your TRUE location that night: ${trueLocation}

THE SITUATION: Staples is a normal place, or is what it looks like. Office supplies, print services, party supplies for some wild reason. But
one of their employees has been murdered! Larry was a cashier, been around for years. Unfortunately, he was a loose cannon, always calling out on shifts, the biggest yapper in the store
and regardless of his tenure, always seemed to need help. Everyone had a reason to take care of him for good, but so many disgruntled employees
its hard to know who exactly did it. See if you can get some information out of everyone to solve this mystery for good, otherwise you're fired.

${roleInstruction}

RESPONSE FORMAT RULES:
- Answer each question in your own voice and personality
- Where it fits your personality, you may include short AUDIBLE reactions wrapped
  in asterisks — e.g. *giggles*, *sighs*, *nervous laugh*, *clears throat*, *scoffs*.
  These get performed as real sound, so only use ones that make a noise (not silent
  physical actions like *adjusts glasses*). Use them sparingly — at most one or two per answer.
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

    // Step 1: generate the hidden ground truth for THIS case (fresh every game).
    // Falls back to default questions/locations if the model output is unusable.
    let caseTruth;
    try {
      caseTruth = await generateCaseTruth(killerId);
    } catch (truthErr) {
      console.error('[WARN] case-truth generation failed, using fallback:', truthErr.message);
      caseTruth = {
        bodyLocation: ROOMS[Math.floor(Math.random() * ROOMS.length)],
        summary: 'Larry was found dead after closing. Someone he trusted got him alone.',
        evidence: 'A faint streak of printer toner was found on the victim\'s sleeve.',
        questions: FALLBACK_QUESTIONS,
        locations: {}
      };
    }

    const QUESTIONS = caseTruth.questions;

    // Store killer + full case truth in a server-side session (in-memory for hackathon).
    const sessionId = Math.random().toString(36).slice(2);
    activeSessions[sessionId] = { killerId, caseTruth, startedAt: Date.now() };

    console.log(`[GAME] New game started. Session: ${sessionId}. Killer: ${killerId}. Body in: ${caseTruth.bodyLocation}`);

    // Step 2: generate all suspect tapes simultaneously, grounded in the case truth.
    const questionsText = QUESTIONS.map((q, i) => `Question ${i + 1}: ${q}`).join('\n');

    const tapePromises = suspectIds.map(async (suspectId) => {
      const isKiller = suspectId === killerId;
      const systemPrompt = buildSystemPrompt(suspectId, isKiller, caseTruth);

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

    // The CASE FILE the player is allowed to see — body location + evidence + questions.
    // Never includes the killer's identity or the suspects' true locations.
    const caseFile = {
      bodyLocation: caseTruth.bodyLocation,
      evidence: caseTruth.evidence,
      questions: QUESTIONS
    };

    res.json({ sessionId, tapes, suspects: getSuspectProfiles(), caseFile });

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
          text: toAudioTags(text),
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