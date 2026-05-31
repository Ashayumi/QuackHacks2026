// ============================================================
//   game.js — Frontend logic, talks to server.js via fetch
// ============================================================

let gameState = {
  sessionId: null,
  tapes: {},
  suspects: [],
  currentSuspect: null,
  currentQuestion: 0,
  reviewed: new Set(),
  audioCache: {},   // key `${suspectId}:${qIndex}` -> object URL of voiced audio
  caseFile: null,   // { bodyLocation, evidence, questions } the player is allowed to see
  finalQuestionUsed: false,  // the one-time "ask all suspects" question
};

// ============================================================
//   MAIN MENU — START CASE
// ============================================================

// Called when the player clicks "START CASE" on the main menu.
function beginCase() {
  const btn = document.getElementById('menu-start-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ OPENING CASE...'; }

  const overlay = document.getElementById('menu-overlay');
  if (overlay) overlay.classList.add('hidden');

  startGame();
}

// ============================================================
//   BOOT — loads the case tapes
// ============================================================

async function startGame() {
  showLoading(true);

  try {
    const res = await fetch('/api/start-game', { method: 'POST' });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    gameState.sessionId = data.sessionId;
    gameState.tapes     = data.tapes;
    gameState.suspects  = data.suspects;
    gameState.caseFile  = data.caseFile || null;

    populateCaseFile();
    renderSidebar();
    selectSuspect(data.suspects[0].id);
    showLoading(false);

  } catch (err) {
    console.error('[ERROR] startGame:', err.message);
    document.getElementById('tape-answer').textContent = '[ ERROR LOADING TAPES — REFRESH TO RETRY ]';
    document.getElementById('tape-answer').className = 'tape-answer glitch';
    showLoading(false);
  }
}

// ============================================================
//   SIDEBAR
// ============================================================

function renderSidebar() {
  const sidebar = document.getElementById('suspect-sidebar');
  sidebar.innerHTML = '<div class="sidebar-label">SUSPECTS</div>';

  // Keep the "reviewed / total" denominator in sync with the real suspect count
  const totalEl = document.getElementById('reviewed-total');
  if (totalEl) totalEl.textContent = gameState.suspects.length;

  gameState.suspects.forEach(suspect => {
    const item = document.createElement('div');
    item.className = 'suspect-item';
    item.dataset.id = suspect.id;
    item.onclick = () => selectSuspect(suspect.id);

    item.innerHTML = `
      <div class="suspect-name">${suspect.name}</div>
      <div class="suspect-role">${suspect.occupation}</div>
      <div class="suspect-status unreviewed" id="status-${suspect.id}">○ UNREVIEWED</div>
    `;

    sidebar.appendChild(item);
  });
}

// ============================================================
//   SELECT SUSPECT
// ============================================================

function selectSuspect(suspectId) {
  // Deactivate all
  document.querySelectorAll('.suspect-item').forEach(el => {
    el.classList.remove('active');
    const id = el.dataset.id;
    const statusEl = document.getElementById(`status-${id}`);
    if (!gameState.reviewed.has(id) && statusEl) {
      statusEl.textContent = '○ UNREVIEWED';
      statusEl.className = 'suspect-status unreviewed';
    }
  });

  // Activate selected
  gameState.currentSuspect = suspectId;
  gameState.currentQuestion = 0;

  const activeEl = document.querySelector(`.suspect-item[data-id="${suspectId}"]`);
  if (activeEl) {
    activeEl.classList.add('active');
    const statusEl = document.getElementById(`status-${suspectId}`);
    statusEl.textContent = '▶ PLAYING';
    statusEl.className = 'suspect-status playing';
  }

  updateViewer();
}

// ============================================================
//   VIEWER
// ============================================================

function updateViewer() {
  const suspectId = gameState.currentSuspect;
  const tape      = gameState.tapes[suspectId];
  const qIndex    = gameState.currentQuestion;

  if (!tape) return;

  // Stop any audio from the previous tape/question and reset the play button
  stopAudio();

  const entry = tape.answers[qIndex];
  const tapeNumber = (gameState.suspects.findIndex(s => s.id === suspectId) + 1)
    .toString().padStart(3, '0');

  document.getElementById('playing-label').textContent     = `▶ NOW PLAYING — TAPE ${tapeNumber}`;
  document.getElementById('tape-suspect-name').textContent = tape.suspectName.toUpperCase();
  document.getElementById('tape-question').textContent     = `Q${qIndex + 1} — ${entry.question.toUpperCase()}`;
  document.getElementById('tape-answer').textContent       = entry.answer;
  document.getElementById('tape-answer').className         = 'tape-answer';
  document.getElementById('vhs-channel').textContent       = `CH 0${gameState.suspects.findIndex(s => s.id === suspectId) + 1}`;
  document.getElementById('q-counter').textContent         = `Q ${qIndex + 1} / 5`;
  document.getElementById('progress-fill').style.width     = `${((qIndex + 1) / 5) * 100}%`;
  document.getElementById('vhs-time').textContent          = `00:0${gameState.suspects.findIndex(s => s.id === suspectId)}:0${qIndex}:00`;

  // Update Q pills
  document.querySelectorAll('.q-pill').forEach((pill, i) => {
    pill.classList.remove('active', 'answered');
    if (i < qIndex) pill.classList.add('answered');
    if (i === qIndex) pill.classList.add('active');
  });
}

// ============================================================
//   NAVIGATION
// ============================================================

function nextQuestion() {
  if (gameState.currentQuestion < 4) {
    gameState.currentQuestion++;
    updateViewer();
  } else {
    markReviewed(gameState.currentSuspect);
  }
}

function prevQuestion() {
  if (gameState.currentQuestion > 0) {
    gameState.currentQuestion--;
    updateViewer();
  }
}

function jumpToQuestion(index) {
  gameState.currentQuestion = index;
  updateViewer();
}

function markReviewed(suspectId) {
  gameState.reviewed.add(suspectId);

  const el = document.querySelector(`.suspect-item[data-id="${suspectId}"]`);
  if (el) el.classList.add('watched');

  const statusEl = document.getElementById(`status-${suspectId}`);
  if (statusEl) {
    statusEl.textContent = '✓ REVIEWED';
    statusEl.className = 'suspect-status reviewed';
  }

  document.getElementById('reviewed-count').textContent = gameState.reviewed.size;

  // Unlock accusation + final-question buttons once all suspects reviewed
  if (gameState.reviewed.size >= gameState.suspects.length) {
    document.getElementById('accuse-btn').disabled = false;
    document.getElementById('accuse-ready').textContent = 'YES';
    document.getElementById('accuse-ready').style.color = '#cc4444';

    const fqBtn = document.getElementById('final-q-btn');
    if (fqBtn && !gameState.finalQuestionUsed) fqBtn.disabled = false;
  }
}

// ============================================================
//   CASE FILE
// ============================================================

// Fill the case-file modal with this case's body location + evidence clue.
function populateCaseFile() {
  const cf = gameState.caseFile;
  const bodyEl = document.getElementById('casefile-body');
  const evEl   = document.getElementById('casefile-evidence');
  if (!cf) return;
  if (bodyEl) bodyEl.textContent = cf.bodyLocation || 'Unknown';
  if (evEl)   evEl.textContent   = cf.evidence || 'No evidence logged.';
}

function openCaseFile() {
  const overlay = document.getElementById('casefile-overlay');
  if (overlay) overlay.hidden = false;
}

function closeCaseFile() {
  const overlay = document.getElementById('casefile-overlay');
  if (overlay) overlay.hidden = true;
}

// ============================================================
//   FINAL QUESTION (one-time, asked to every suspect)
// ============================================================

function openFinalQuestion() {
  if (gameState.finalQuestionUsed) return;
  document.getElementById('finalq-ask').hidden = false;
  document.getElementById('finalq-results').hidden = true;
  document.getElementById('finalq-input').value = '';
  document.getElementById('finalq-overlay').hidden = false;
}

function closeFinalQuestion() {
  document.getElementById('finalq-overlay').hidden = true;
}

async function sendFinalQuestion() {
  const input = document.getElementById('finalq-input');
  const question = input.value.trim();
  if (!question) { input.focus(); return; }

  const sendBtn = document.getElementById('finalq-send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = '⏳ ASKING...';

  try {
    const res = await fetch('/api/final-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: gameState.sessionId, question })
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);

    // Consume the one-time question
    gameState.finalQuestionUsed = true;
    const fqBtn = document.getElementById('final-q-btn');
    if (fqBtn) { fqBtn.disabled = true; fqBtn.textContent = '❓ FINAL Q USED'; }

    renderFinalAnswers(data);

  } catch (err) {
    console.error('[ERROR] sendFinalQuestion:', err.message);
    alert(err.message || 'Failed to ask the question.');
    sendBtn.disabled = false;
    sendBtn.textContent = 'ASK ALL ▶';
  }
}

function renderFinalAnswers(data) {
  document.getElementById('finalq-asked').textContent = `“${data.question}”`;

  const wrap = document.getElementById('finalq-answers');
  wrap.innerHTML = '';

  gameState.suspects.forEach(s => {
    const entry = data.answers[s.id];
    if (!entry) return;
    const card = document.createElement('div');
    card.className = 'finalq-answer';
    card.innerHTML = `
      <div class="finalq-answer-name">${entry.suspectName} <span class="finalq-answer-role">${entry.suspectRole}</span></div>
      <div class="finalq-answer-text">${entry.answer}</div>
    `;
    wrap.appendChild(card);
  });

  document.getElementById('finalq-ask').hidden = true;
  document.getElementById('finalq-results').hidden = false;
}

// ============================================================
//   ACCUSATION
// ============================================================

let selectedAccusedId = null;

// Open the in-page accusation modal and render the suspect choices
function makeAccusation() {
  selectedAccusedId = null;

  const list = document.getElementById('accuse-suspect-list');
  list.innerHTML = '';

  gameState.suspects.forEach(s => {
    const card = document.createElement('div');
    card.className = 'accuse-choice';
    card.dataset.id = s.id;
    card.onclick = () => selectAccused(s.id);
    card.innerHTML = `
      <div class="accuse-choice-name">${s.name}</div>
      <div class="accuse-choice-role">${s.occupation}</div>
    `;
    list.appendChild(card);
  });

  document.getElementById('confirm-accuse-btn').disabled = true;
  document.getElementById('accuse-overlay').hidden = false;
}

function selectAccused(id) {
  selectedAccusedId = id;
  document.querySelectorAll('.accuse-choice').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
  document.getElementById('confirm-accuse-btn').disabled = false;
}

function closeAccuseModal() {
  document.getElementById('accuse-overlay').hidden = true;
}

function confirmAccusation() {
  if (!selectedAccusedId) return;
  closeAccuseModal();
  submitAccusation(selectedAccusedId);
}

async function submitAccusation(accusedId) {
  try {
    const res = await fetch('/api/accuse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: gameState.sessionId,
        accusedId
      })
    });

    const data = await res.json();
    showResult(data);

  } catch (err) {
    console.error('[ERROR] submitAccusation:', err.message);
    showResult({ correct: false, message: 'Failed to submit accusation. Please try again.' });
  }
}

function showResult(data) {
  const overlay = document.getElementById('result-overlay');
  const modal   = document.getElementById('result-modal');
  const title   = document.getElementById('result-title');
  const message = document.getElementById('result-message');

  modal.classList.toggle('correct', !!data.correct);
  modal.classList.toggle('wrong', !data.correct);
  title.textContent   = data.correct ? '✓ CASE CLOSED' : '✗ THE CASE GOES COLD';
  message.textContent = data.message || '';

  overlay.hidden = false;
}

function restartGame() {
  sessionStorage.removeItem('doa_notes');
  location.reload();
}

// ============================================================
//   UI HELPERS
// ============================================================

function showLoading(isLoading) {
  const answer = document.getElementById('tape-answer');
  if (isLoading) {
    answer.textContent = '[ RETRIEVING EVIDENCE TAPES... ]';
    answer.className = 'tape-answer loading';
    document.getElementById('tape-suspect-name').textContent = '— — —';
    document.getElementById('tape-question').textContent = '';
    document.getElementById('playing-label').textContent = '⏳ DECRYPTING FILES';
  }
}

function setPlayButton(state) {
  // state: 'play' | 'pause' | 'loading'
  const btn = document.getElementById('play-pause-btn');
  if (!btn) return;
  if (state === 'loading') { btn.textContent = '⏳ LOADING'; btn.disabled = true; }
  else if (state === 'pause') { btn.textContent = '⏸ PAUSE'; btn.disabled = false; }
  else { btn.textContent = '▶ PLAY'; btn.disabled = false; }
}

// Play / pause the ElevenLabs-voiced audio for the current tape answer
async function togglePlay() {
  const audio = document.getElementById('tape-audio');
  if (!audio) return;

  // If audio is currently playing, pause it
  if (!audio.paused && audio.src) {
    audio.pause();
    setPlayButton('play');
    return;
  }

  // If audio is already loaded for this answer (paused mid-way), resume
  if (audio.src && audio.dataset.key === currentAudioKey()) {
    await audio.play();
    setPlayButton('pause');
    return;
  }

  // Otherwise fetch/voice the current answer, then play
  await playCurrentAnswer();
}

function currentAudioKey() {
  return `${gameState.currentSuspect}:${gameState.currentQuestion}`;
}

async function playCurrentAnswer() {
  const suspectId = gameState.currentSuspect;
  const qIndex    = gameState.currentQuestion;
  const tape      = gameState.tapes[suspectId];
  if (!tape) return;

  const text = tape.answers[qIndex].answer;
  if (!text || text === 'No response recorded.') return;

  const audio = document.getElementById('tape-audio');
  const key = `${suspectId}:${qIndex}`;

  try {
    let url = gameState.audioCache[key];

    // Not cached yet — request it from the server (ElevenLabs TTS)
    if (!url) {
      setPlayButton('loading');
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspectId, text })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `TTS failed (${res.status})`);
      }

      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      gameState.audioCache[key] = url;
    }

    audio.src = url;
    audio.dataset.key = key;
    await audio.play();
    setPlayButton('pause');

  } catch (err) {
    console.error('[ERROR] playCurrentAnswer:', err.message);
    setPlayButton('play');
    const label = document.getElementById('playing-label');
    if (label) label.textContent = '⚠ AUDIO UNAVAILABLE';
  }
}

function stopAudio() {
  const audio = document.getElementById('tape-audio');
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.dataset.key = '';
  }
  setPlayButton('play');
}

function ejectTape() {
  stopAudio();
  document.getElementById('tape-answer').textContent = '[ NO TAPE LOADED ]';
  document.getElementById('tape-answer').className = 'tape-answer glitch';
  document.getElementById('tape-suspect-name').textContent = '— — —';
  document.getElementById('tape-question').textContent = '';
  document.getElementById('playing-label').textContent = '⏏ EJECTED';
}

// ============================================================
//   NOTEPAD
// ============================================================

const notepad = document.getElementById('notepad');
if (notepad) {
  notepad.addEventListener('input', () => {
    sessionStorage.setItem('doa_notes', notepad.value);
  });
  const saved = sessionStorage.getItem('doa_notes');
  if (saved) notepad.value = saved;
}

// ============================================================
//   INIT
// ============================================================

// When an answer finishes playing, reset the button to PLAY
window.addEventListener('DOMContentLoaded', () => {
  const audio = document.getElementById('tape-audio');
  if (audio) audio.addEventListener('ended', () => setPlayButton('play'));
});

// Game no longer auto-starts — it waits for the player to click "START CASE"
// on the main menu (see beginCase). The menu is visible on load by default.