// ============================================================
//   music.js — ambient background music via the YouTube IFrame API
// ============================================================
//
//  HOW TO USE:
//  1. Paste your YouTube link (or just the 11-char video id) into
//     YOUTUBE_MUSIC below.  A long ambient track / lo-fi loop works best.
//  2. That's it. Music starts on the player's first click and loops.
//     Use the 🔊 MUSIC button (in the controls bar) to mute/unmute.
//
//  Note: browsers block autoplay WITH SOUND until the user interacts,
//  so the track begins on the first click anywhere in the page.
// ============================================================

const YOUTUBE_MUSIC = 'https://youtu.be/6HMF2rYw4K0?si=6bdNV8MbUd76KCk5'; // <-- paste your link here
const MUSIC_VOLUME  = 18;  // 0-100, kept low so it sits under the interrogation voices
const DUCK_VOLUME   = 6;   // volume while a tape voice is playing

let ytPlayer   = null;
let musicReady = false;
let musicMuted = false;

// Accepts a full YouTube URL (watch, youtu.be, embed, shorts) or a raw video id
function extractVideoId(input) {
  if (!input) return '';
  if (/^[\w-]{11}$/.test(input)) return input;
  const m = input.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);
  return m ? m[1] : '';
}

// The YouTube IFrame API calls this global function automatically once it loads
function onYouTubeIframeAPIReady() {
  const videoId = extractVideoId(YOUTUBE_MUSIC);
  if (!videoId) {
    console.warn('[music] No valid YouTube link/id set in js/music.js (YOUTUBE_MUSIC).');
    return;
  }

  ytPlayer = new YT.Player('yt-music', {
    videoId,
    playerVars: {
      autoplay: 0,
      controls: 0,
      loop: 1,
      playlist: videoId,   // required for a single video to loop
      modestbranding: 1,
      playsinline: 1
    },
    events: {
      onReady: () => {
        musicReady = true;
        ytPlayer.setVolume(MUSIC_VOLUME);
      }
    }
  });
}

// Browsers block autoplay-with-sound — start on the first user gesture
function startMusicOnFirstGesture() {
  if (!musicReady || !ytPlayer) return; // not ready yet — keep listening
  if (!musicMuted) ytPlayer.playVideo();
  document.removeEventListener('click', startMusicOnFirstGesture);
  document.removeEventListener('keydown', startMusicOnFirstGesture);
}
document.addEventListener('click', startMusicOnFirstGesture);
document.addEventListener('keydown', startMusicOnFirstGesture);

// 🔊 / 🔇 toggle button
function toggleMusic() {
  if (!ytPlayer || !musicReady) return;
  musicMuted = !musicMuted;
  const btn = document.getElementById('music-toggle');
  if (musicMuted) {
    ytPlayer.pauseVideo();
    if (btn) btn.textContent = 'NO MUSIC';
  } else {
    ytPlayer.playVideo();
    if (btn) btn.textContent = 'MUSIC';
  }
}

// Lower the music while a suspect's voice plays, restore when it stops
window.addEventListener('DOMContentLoaded', () => {
  const audio = document.getElementById('tape-audio');
  if (!audio) return;
  const restore = () => { if (ytPlayer && musicReady && !musicMuted) ytPlayer.setVolume(MUSIC_VOLUME); };
  audio.addEventListener('play',  () => { if (ytPlayer && musicReady) ytPlayer.setVolume(DUCK_VOLUME); });
  audio.addEventListener('pause', restore);
  audio.addEventListener('ended', restore);
});
