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
};

// ============================================================
//   BOOT — called on page load
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

  // Unlock accusation button once all suspects reviewed
  if (gameState.reviewed.size >= gameState.suspects.length) {
    document.getElementById('accuse-btn').disabled = false;
    document.getElementById('accuse-ready').textContent = 'YES';
    document.getElementById('accuse-ready').style.color = '#cc4444';
  }
}

// ============================================================
//   ACCUSATION
// ============================================================

function makeAccusation() {
  const suspectList = gameState.suspects
    .map(s => `${s.id}: ${s.name}`)
    .join('\n');

  const input = prompt(
    `Who do you accuse of murdering Reginald Ashworth?\n\nEnter the number:\n${
      gameState.suspects.map((s, i) => `${i + 1}. ${s.name}`).join('\n')
    }`
  );

  const index = parseInt(input) - 1;
  if (isNaN(index) || index < 0 || index >= gameState.suspects.length) {
    alert('Invalid selection.');
    return;
  }

  const accusedId = gameState.suspects[index].id;
  submitAccusation(accusedId);
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
    alert('Failed to submit accusation. Please try again.');
  }
}

function showResult(data) {
  const msg = data.correct
    ? `✓ CASE CLOSED\n\n${data.message}\n\nYou identified the killer.`
    : `✗ WRONG ACCUSATION\n\n${data.message}\n\nThe case goes cold.`;

  alert(msg);
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

function togglePlay() {
  const btn = document.getElementById('play-pause-btn');
  const isPlaying = btn.textContent.includes('PAUSE');
  btn.textContent = isPlaying ? '▶ PLAY' : '⏸ PAUSE';
}

function ejectTape() {
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

window.addEventListener('DOMContentLoaded', startGame);