# GAME NAME — A Murder Mystery Detective Game

> **A Hackathon Project for [Quack Hacks 2026](https://quackhacks.org)**

---

## Overview

**GAME NAME** is a browser-based murder mystery game inspired by the classic board game *Clue*. Players step into the role of a detective tasked with solving a murder by reviewing pre-recorded interrogation tapes of 5 suspects. Using an in-game notepad, players cross-reference answers, identify contradictions, and make their accusation — before the killer gets away.

Each playthrough is powered by **AI agents** — every suspect has their own unique personality and is dynamically generated fresh each game, meaning no two playthroughs are ever the same.

---

## How It Works

1. **A murder has been committed.** You receive the case file with the victim's profile and the crime scenario.
2. **Five suspects have been recorded.** Pull up each suspect's interrogation tape and listen to their answers to the same 5 questions.
3. **Take notes.** Use the built-in detective notepad to jot down inconsistencies and cross-reference what suspects say about each other.
4. **Make your accusation.** When you're confident you've found the killer — point the finger. But choose wisely.

---

## Features

- **5 unique AI-powered suspects** — each with their own personality, backstory, and alibi
- **Randomized killer every playthrough** — the guilty party changes each game
- **Pre-recorded tape UI** — a cinematic VHS-style interface for reviewing interrogations
- **Interactive detective notepad** — take notes and build your case in real time
- **Fresh AI generation** — all suspect responses are generated on game start via the Anthropic API


---

## Project Phases

| Phase | Description |
|---|---|
| **Phase 1** | Game design, suspect writing, question design, alibi web |
| **Phase 2** | AI agent prompt engineering (innocent vs. guilty system prompts) |
| **Phase 3** | UI/UX design — tape player, notepad, suspect cards, screens |
| **Phase 4** | Frontend development |
| **Phase 5** | Anthropic API integration & killer randomization logic |
| **Phase 6** | Playtesting & balance tuning |
| **Phase 7** | Polish, sound design, deployment |

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/Ashayumi/QuackHacks2026

# Navigate into the project
cd QuackHacks2026

# Install dependencies
npm install

# Add your Anthropic API key
cp .env.example .env
# → Add your ANTHROPIC_API_KEY to .env

# Start the development server
npm run dev
```

---

## Environment Variables

```env
ANTHROPIC_API_KEY=your_api_key_here
```

> ⚠️ Never commit your `.env` file. It is included in `.gitignore`.

---

## Team

| Name | Role |
|---|---|
| Jacob | Game Design & Writing |
| Beatriz | AI Prompt Engineering |
| Yael | Frontend Development |
| TBD | UI/UX Design |

---

## Hackathon

This project was built as part of **Quack Hacks 2026** — a hackathon celebrating creativity, collaboration, and code.

---

## License

This project is licensed under the MIT License. See `LICENSE` for details.
