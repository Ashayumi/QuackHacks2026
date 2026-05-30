const suspects = [
  { name: "Victor Hale",     role: "Retired Judge",    tape: "001", ch: "CH 01" },
  { name: "Elena Marsh",     role: "Photographer",     tape: "002", ch: "CH 02" },
  { name: "Marcus Webb",     role: "Sales Rep",        tape: "003", ch: "CH 03" },
  { name: "Dorothea Crane",  role: "Retired Actress",  tape: "004", ch: "CH 04" },
  { name: "Nolan Price",     role: "Private Chef",     tape: "005", ch: "CH 05" },
];

const questions = [
  "WHERE WERE YOU BETWEEN 8PM AND 10PM?",
  "DESCRIBE YOUR RELATIONSHIP WITH THE VICTIM.",
  "DID YOU SEE ANYONE ACTING SUSPICIOUSLY?",
  "WHO HAD A REASON TO HARM THE VICTIM?",
  "WHAT DID YOU HEAR BEFORE THE BODY WAS FOUND?",
];

let currentSuspect = 0;
let currentQuestion = 0;
let reviewed = new Set();
let playing = true;

function selectSuspect(id) {
  document.querySelectorAll('.suspect-item').forEach(el => {
    el.classList.remove('active');
    const s = el.querySelector('.suspect-status');
    if (!reviewed.has(parseInt(el.dataset.id))) {
      s.textContent = '○ UNREVIEWED';
      s.className = 'suspect-status unreviewed';
    }
  });

  currentSuspect = id;
  currentQuestion = 0;
  const el = document.querySelector(`.suspect-item[data-id="${id}"]`);
  el.classList.add('active');
  const s = el.querySelector('.suspect-status');
  s.textContent = '▶ PLAYING';
  s.className = 'suspect-status playing';

  updateViewer();
}

function updateViewer() {
  const sus = suspects[currentSuspect];
  document.getElementById('playing-label').textContent = `▶ NOW PLAYING — TAPE ${sus.tape}`;
  document.getElementById('tape-suspect-name').textContent = sus.name.toUpperCase();
  document.getElementById('tape-question').textContent = `Q${currentQuestion+1} — ${questions[currentQuestion]}`;
  document.getElementById('tape-answer').textContent = '[ AI RESPONSE WILL RENDER HERE ]';
  document.getElementById('tape-answer').className = 'tape-answer loading';
  document.getElementById('vhs-channel').textContent = sus.ch;
  document.getElementById('q-counter').textContent = `Q ${currentQuestion+1} / 5`;
  document.getElementById('progress-fill').style.width = `${((currentQuestion+1)/5)*100}%`;
  document.getElementById('vhs-time').textContent = `00:0${currentSuspect}:0${currentQuestion}:00`;

  document.querySelectorAll('.q-pill').forEach((p, i) => {
    p.classList.remove('active', 'answered');
    if (i < currentQuestion) p.classList.add('answered');
    if (i === currentQuestion) p.classList.add('active');
  });
}

function nextQuestion() {
  if (currentQuestion < 4) {
    currentQuestion++;
    updateViewer();
  } else {
    reviewed.add(currentSuspect);
    const el = document.querySelector(`.suspect-item[data-id="${currentSuspect}"]`);
    el.classList.add('watched');
    const s = el.querySelector('.suspect-status');
    s.textContent = '✓ REVIEWED';
    s.className = 'suspect-status reviewed';
    document.getElementById('reviewed-count').textContent = reviewed.size;
    if (reviewed.size >= 5) {
      document.getElementById('accuse-btn').disabled = false;
      document.getElementById('accuse-ready').textContent = 'YES';
      document.getElementById('accuse-ready').style.color = '#cc4444';
    }
  }
}

function prevQuestion() {
  if (currentQuestion > 0) {
    currentQuestion--;
    updateViewer();
  }
}

function jumpToQuestion(q) {
  currentQuestion = q;
  updateViewer();
}

function togglePlay() {
  playing = !playing;
  document.getElementById('play-pause-btn').textContent = playing ? '⏸ PAUSE' : '▶ PLAY';
}

function ejectTape() {
  document.getElementById('tape-answer').textContent = '[ NO TAPE LOADED ]';
  document.getElementById('tape-answer').className = 'tape-answer glitch';
  document.getElementById('tape-suspect-name').textContent = '— — —';
  document.getElementById('tape-question').textContent = '';
  document.getElementById('playing-label').textContent = '⏏ EJECTED';
}

function makeAccusation() {
  alert('ACCUSATION SCREEN — wire up your accusation logic here.');
}

const notepad = document.getElementById('notepad');
notepad.addEventListener('input', () => {
  sessionStorage.setItem('doa_notes', notepad.value);
});
const saved = sessionStorage.getItem('doa_notes');
if (saved) notepad.value = saved;
