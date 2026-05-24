// =============================================================
// ui.js
// Manages all HTML overlay UI: login screen, popups (choice
// mode and sign-it mode), HUD updates, webcam/hand overlay
// visibility, voiceover, and the difficulty prompt.
//
// This file talks to the DOM — no Three.js imports needed.
// Callbacks are passed in from main.js so ui.js can trigger
// game events (resolve obstacle, set difficulty) without
// importing game state itself.
// =============================================================

// ── Voiceover constants ─────────────────────────────────────
const SPEECH_ENABLED = 'speechSynthesis' in window;
const SPEECH_SETTINGS = { rate: 0.9, pitch: 1.12, volume: 0.78, language: 'en-US' };
const SPOKEN_COOLDOWN_MS = 5500;

const PREFERRED_VOICES = [
  'Natural', 'Neural', 'Premium', 'Enhanced', 'Samantha',
  'Zoe', 'Aria', 'Jenny', 'Michelle', 'Serena', 'Ava',
  'Allison', 'Google US English', 'Karen', 'Moira'
];

// ── Module-level state ──────────────────────────────────────
let availableVoices    = [];
let voiceoverEnabled   = false;
let speechUnlocked     = false;
let currentAudio       = null;
let lastSpokenText     = '';
let lastSpokenAt       = 0;
let voiceButton        = null;
let difficultyLocked   = false;

// Callbacks registered by main.js
let onLoginSuccess     = null;  // () => void
let onChoiceAnswer     = null;  // (key: string) => void
let onDifficultyChoice = null;  // (choice: 'more'|'no') => void


// =============================================================
// initUI
// Sets up login, pause button, voice button, and keyboard
// listener for choice mode answers.
// Callbacks from main.js are registered here so ui.js can
// trigger game events without importing game state.
// =============================================================
export function initUI(callbacks) {
  onLoginSuccess     = callbacks.onLoginSuccess;
  onChoiceAnswer     = callbacks.onChoiceAnswer;
  onDifficultyChoice = callbacks.onDifficultyChoice;

  initSpeechVoices();
  createVoiceButton();
  setupLoginForm();
  setupPauseButton(callbacks.onPause);
  setupKeyboardInput();
}


// =============================================================
// updateHUD
// Updates the score and distance text in the top-left HUD.
// Called from main.js every frame.
// =============================================================
export function updateHUD(score, distance) {
  const scoreEl = document.getElementById('scoreDisplay');
  const distEl  = document.getElementById('distDisplay');
  if (scoreEl) scoreEl.textContent = 'Score: ' + score;
  if (distEl)  distEl.textContent  = 'Dist: '  + Math.floor(distance / 60) + 'm';
}


// =============================================================
// showChoicePopup
// Shows the three-sign choice popup for 'choice' mechanic
// obstacles (e.g. mud — pick the sign for GO).
// type: an OBSTACLE_TYPES entry with .prompt and .signs
// =============================================================
export function showChoicePopup(type) {
  const popup = document.getElementById('popup');
  popup.style.width = '340px';

  document.getElementById('choicePrompt').textContent = type.prompt;
  document.getElementById('signA').src = type.signs.s;
  document.getElementById('signB').src = type.signs.g;
  document.getElementById('signC').src = type.signs.p;
  document.getElementById('choiceFeedback').textContent = '';

  document.getElementById('choiceMode').style.display = 'block';
  document.getElementById('signItMode').style.display = 'none';
  popup.style.display = 'block';

  speakPopup(type.prompt);
}


// =============================================================
// showSignItPopup
// Shows the sign-it popup for 'signIt' mechanic obstacles.
// Displays the target sign image and activates the webcam overlay.
// type: an OBSTACLE_TYPES entry with .prompt and .signImage
// =============================================================
export function showSignItPopup(type) {
  const popup = document.getElementById('popup');
  popup.style.width = '248px';

  document.getElementById('signItPrompt').textContent = type.prompt;

  const img = document.getElementById('signItImage');
  img.src = type.signImage;
  img.style.display = 'block';

  document.getElementById('signResult').textContent = '';
  document.getElementById('signItMode').style.display = 'block';
  document.getElementById('choiceMode').style.display = 'none';
  popup.style.display = 'block';

  showHandCanvas();
  speakPopup(type.prompt);
}


// =============================================================
// showStartSignPopup
// The first popup the player sees after login.
// Player must sign PLAY to start the game.
// =============================================================
export function showStartSignPopup() {
  const popup = document.getElementById('popup');
  popup.style.width = '300px';

  const img = document.getElementById('signItImage');
  img.src = 'signs/sign_play.png';
  img.style.display = 'block';

  document.getElementById('signItPrompt').textContent = 'Sign PLAY to start driving.';
  document.getElementById('signResult').textContent   = '';
  document.getElementById('signItMode').style.display = 'block';
  document.getElementById('choiceMode').style.display = 'none';
  popup.style.display = 'block';

  showHandCanvas();
  speakPopup('Sign PLAY to start driving.');
}


// =============================================================
// showLaneDodgePrompt
// Shown when a barricade (avoid mechanic) approaches.
// Player signs LEFT or RIGHT to steer around it.
// onResult: callback called with 'left' or 'right'
// =============================================================
export function showLaneDodgePrompt() {
  const popup = document.getElementById('popup');
  popup.style.width = '300px';

  const img = document.getElementById('signItImage');
  img.removeAttribute('src');
  img.style.display = 'none';

  document.getElementById('signItPrompt').textContent = 'Sign LEFT or RIGHT.';
  document.getElementById('signResult').textContent   = 'Dodge now.';
  document.getElementById('signItMode').style.display = 'block';
  document.getElementById('choiceMode').style.display = 'none';
  popup.style.display = 'block';

  showHandCanvas();
  speakPopup('Sign LEFT or RIGHT. Dodge now.');
}


// =============================================================
// showMoreObstaclesPrompt
// Shown after the player has cleared several obstacles.
// Player signs MORE to enable bonus obstacles or NO to keep
// the standard set. onDifficultyChoice callback fires with result.
// =============================================================
export function showMoreObstaclesPrompt() {
  difficultyLocked = false;
  const popup = document.getElementById('popup');
  popup.style.width = '300px';

  const img = document.getElementById('signItImage');
  img.removeAttribute('src');
  img.style.display = 'none';

  document.getElementById('signItPrompt').textContent = 'More obstacles?';
  document.getElementById('signResult').textContent   = 'Sign MORE or NO.';
  document.getElementById('signItMode').style.display = 'block';
  document.getElementById('choiceMode').style.display = 'none';
  popup.style.display = 'block';

  showHandCanvas();
  speakPopup('More obstacles? Sign MORE or NO.');
}


// =============================================================
// showFlashBanner
// Pre-flash: briefly shows all three sign images before a
// mud obstacle arrives so the player can memorise them.
// =============================================================
export function showFlashBanner(type) {
  const popup = document.getElementById('popup');
  popup.style.width = '340px';

  document.getElementById('choicePrompt').textContent = 'Remember these signs!';
  document.getElementById('signA').src = type.signs.s;
  document.getElementById('signB').src = type.signs.g;
  document.getElementById('signC').src = type.signs.p;
  document.getElementById('choiceFeedback').textContent = '';

  document.getElementById('choiceMode').style.display = 'block';
  document.getElementById('signItMode').style.display = 'none';
  popup.style.display = 'block';

  speakPopup('Remember these signs!');
}


// =============================================================
// hideAllPopups
// Hides the popup overlay and clears all text fields.
// Also stops any playing voiceover.
// =============================================================
export function hideAllPopups() {
  document.getElementById('popup').style.display = 'none';
  document.getElementById('choiceFeedback').textContent = '';
  document.getElementById('signResult').textContent = '';
  stopAudio();
  if (SPEECH_ENABLED) window.speechSynthesis.cancel();
}


// =============================================================
// setSignResult / setChoiceFeedback
// Update the feedback text inside the active popup.
// shouldSpeak: if true, also reads the message aloud.
// =============================================================
export function setSignResult(message, shouldSpeak) {
  const el = document.getElementById('signResult');
  if (el) el.textContent = message;
  if (shouldSpeak) speakStatus(message);
}

export function setChoiceFeedback(message, shouldSpeak) {
  const el = document.getElementById('choiceFeedback');
  if (el) el.textContent = message;
  if (shouldSpeak) speakStatus(message);
}


// =============================================================
// showHandCanvas / hideHandCanvas
// Shows or hides the webcam feed and hand landmark overlay.
// These appear bottom-right during sign-it mode.
// =============================================================
export function showHandCanvas() {
  document.getElementById('handCanvas').style.display = 'block';
  document.getElementById('webcam').style.display     = 'block';
}

export function hideHandCanvas() {
  document.getElementById('handCanvas').style.display = 'none';
  document.getElementById('webcam').style.display     = 'none';
}


// =============================================================
// getDifficultyLocked
// main.js checks this before acting on a difficulty gesture
// so the choice can't fire more than once per prompt.
// =============================================================
export function getDifficultyLocked() { return difficultyLocked; }
export function lockDifficulty()      { difficultyLocked = true; }


// ── Private: login form ─────────────────────────────────────

function setupLoginForm() {
  const loginOverlay  = document.getElementById('loginOverlay');
  const loginName     = document.getElementById('loginName');
  const loginPassword = document.getElementById('loginPassword');
  const loginSubmit   = document.getElementById('loginSubmit');
  const loginError    = document.getElementById('loginError');

  const tryLogin = function() {
    const user = (loginName.value || '').trim();
    const pass =  loginPassword.value || '';

    if (user === 'Chloe' && pass === 'Uncharted') {
      unlockSpeech();
      loginError.textContent       = '';
      loginOverlay.style.display   = 'none';
      if (onLoginSuccess) onLoginSuccess();
    } else {
      loginError.textContent = 'Incorrect login. Try Chloe / Uncharted.';
    }
  };

  if (loginSubmit)   loginSubmit.addEventListener('click', tryLogin);
  if (loginPassword) loginPassword.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') tryLogin();
  });
  if (loginName) loginName.focus();
}


// ── Private: pause button ───────────────────────────────────

function setupPauseButton(onPause) {
  const btn = document.getElementById('pauseBtn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    if (onPause) onPause();
    // Button label is updated by main.js via isPaused state
  });
}

export function setPauseButtonLabel(isPaused) {
  const btn = document.getElementById('pauseBtn');
  if (btn) btn.textContent = isPaused ? 'Resume' : 'Pause';
}


// ── Private: keyboard input ─────────────────────────────────

function setupKeyboardInput() {
  document.addEventListener('keydown', function(e) {
    const key = e.key.toLowerCase();
    if (key === 's' || key === 'g' || key === 'p') {
      if (onChoiceAnswer) onChoiceAnswer(key);
    }
  });
}


// ── Private: voiceover ──────────────────────────────────────

function initSpeechVoices() {
  if (!SPEECH_ENABLED) return;
  const load = function() { availableVoices = window.speechSynthesis.getVoices(); };
  load();
  setTimeout(load, 250);
  setTimeout(load, 1000);
  window.speechSynthesis.onvoiceschanged = load;
}

function createVoiceButton() {
  voiceButton = document.createElement('button');
  voiceButton.textContent = 'Voice Off';
  Object.assign(voiceButton.style, {
    position: 'fixed', top: '14px', right: '14px', zIndex: '45',
    background: '#f5c842', color: '#162033',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: '8px', padding: '8px 14px',
    fontWeight: 'bold', cursor: 'pointer'
  });
  voiceButton.addEventListener('click', function() {
    if (voiceoverEnabled) {
      voiceoverEnabled = false;
      stopAudio();
      if (SPEECH_ENABLED) window.speechSynthesis.cancel();
    } else {
      unlockSpeech();
      speakPrompt('Voice on.', true);
    }
    updateVoiceButtonLabel();
  });
  document.body.appendChild(voiceButton);
}

function updateVoiceButtonLabel() {
  if (voiceButton) {
    voiceButton.textContent = voiceoverEnabled ? 'Voice On' : 'Voice Off';
    voiceButton.style.opacity = voiceoverEnabled ? '0.7' : '1';
  }
}

function unlockSpeech() {
  speechUnlocked   = true;
  voiceoverEnabled = true;
  if (SPEECH_ENABLED) window.speechSynthesis.resume();
  updateVoiceButtonLabel();
}

function pickVoice() {
  if (!availableVoices.length) return null;
  const english = availableVoices.filter(function(v) {
    return (v.lang || '').toLowerCase().startsWith('en');
  });
  const pool = english.length ? english : availableVoices;
  return pool.sort(function(a, b) {
    const scoreA = PREFERRED_VOICES.findIndex(function(h) {
      return (a.name || '').includes(h);
    });
    const scoreB = PREFERRED_VOICES.findIndex(function(h) {
      return (b.name || '').includes(h);
    });
    return (scoreA === -1 ? 999 : scoreA) - (scoreB === -1 ? 999 : scoreB);
  })[0];
}

function speakPrompt(text, force) {
  if (!text) return;
  if (!voiceoverEnabled && !force) return;
  if (!speechUnlocked && !force) return;
  if (!SPEECH_ENABLED) return;

  window.speechSynthesis.cancel();
  const utterance  = new SpeechSynthesisUtterance(text);
  utterance.lang   = SPEECH_SETTINGS.language;
  utterance.rate   = SPEECH_SETTINGS.rate;
  utterance.pitch  = SPEECH_SETTINGS.pitch;
  utterance.volume = SPEECH_SETTINGS.volume;
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

function speakPopup(text) {
  speakPrompt(text, false);
}

function speakStatus(text) {
  const now = Date.now();
  if (text === lastSpokenText && now - lastSpokenAt < SPOKEN_COOLDOWN_MS) return;
  lastSpokenText = text;
  lastSpokenAt   = now;
  speakPrompt(text, false);
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}
