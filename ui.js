// =============================================================
// ui.js
// Manages all HTML overlay UI: login screen, popups (choice
// mode and sign-it mode), HUD updates, webcam/hand overlay
// visibility, voiceover, and the difficulty prompt.
//
// Speed system additions:
//   showSpeedPrompt()    — corner banner, game never pauses
//   showSlowHint()       — persistent small hint bottom-left
//   hideSlowHint()       — hides hint when speed returns normal
//   updateSpeedIndicator — updates FAST badge in HUD
// =============================================================

// ── Voiceover constants ─────────────────────────────────────
const SPEECH_ENABLED     = 'speechSynthesis' in window;
const SPEECH_SETTINGS    = { rate: 0.9, pitch: 1.12, volume: 0.78, language: 'en-US' };
const SPOKEN_COOLDOWN_MS = 5500;

const PREFERRED_VOICES = [
  'Natural', 'Neural', 'Premium', 'Enhanced', 'Samantha',
  'Zoe', 'Aria', 'Jenny', 'Michelle', 'Serena', 'Ava',
  'Allison', 'Google US English', 'Karen', 'Moira'
];

// ── Module-level state ──────────────────────────────────────
let availableVoices  = [];
let voiceoverEnabled = false;
let speechUnlocked   = false;
let currentAudio     = null;
let lastSpokenText   = '';
let lastSpokenAt     = 0;
let voiceButton      = null;
let difficultyLocked = false;

// Cached DOM references — set once in initUI
let speedBadgeEl    = null;  // "FAST x2" badge in HUD
let slowHintEl      = null;  // persistent "Sign SLOW" hint bottom-left
let speedPromptEl   = null;  // corner banner for the initial FAST prompt

// Callbacks registered by main.js
let onLoginSuccess     = null;
let onChoiceAnswer     = null;
let onDifficultyChoice = null;


// =============================================================
// initUI
// Sets up all controls and injects speed UI elements into DOM.
// Callbacks let ui.js trigger game events without importing
// game state — main.js owns state, ui.js owns DOM.
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
  createSpeedUI();  // inject speed-related DOM elements
}


// =============================================================
// updateHUD
// Updates score, distance, and the FAST speed badge.
// speedMultiplier: 1 = normal, 2 = fast. Badge shows when > 1.
// =============================================================
export function updateHUD(score, distance, speedMultiplier) {
  const scoreEl = document.getElementById('scoreDisplay');
  const distEl  = document.getElementById('distDisplay');
  if (scoreEl) scoreEl.textContent = 'Score: ' + score;
  if (distEl)  distEl.textContent  = 'Dist: '  + Math.floor(distance / 60) + 'm';

  // Show FAST badge with score multiplier info when speed is boosted
  if (speedBadgeEl) {
    if (speedMultiplier > 1) {
      speedBadgeEl.textContent  = '⚡ FAST  +15pts';
      speedBadgeEl.style.opacity = '1';
    } else {
      speedBadgeEl.style.opacity = '0';
    }
  }
}


// =============================================================
// showSpeedPrompt
// A corner banner that appears 2.5s after driving starts.
// CRITICALLY: the game never pauses for this — road keeps
// scrolling, car keeps moving. The banner is non-blocking.
// It auto-dismisses after 5 seconds if the player ignores it,
// or immediately when they sign FAST.
// =============================================================
export function showSpeedPrompt() {
  if (!speedPromptEl) return;

  speedPromptEl.innerHTML =
    '<strong>Sign FAST</strong> to speed up!<br>' +
    '<img src="signs/sign_fast.png" style="width:64px;height:64px;' +
    'border-radius:6px;object-fit:cover;margin-top:8px;" alt="FAST sign">' +
    '<br><span style="font-size:11px;color:#aaa;">Sign SLOW any time to ease off</span>';

  // Slide in
  speedPromptEl.style.opacity   = '0';
  speedPromptEl.style.transform = 'translateX(20px)';
  speedPromptEl.style.display   = 'block';

  // Use rAF so the display:block renders before transition starts
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      speedPromptEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      speedPromptEl.style.opacity    = '1';
      speedPromptEl.style.transform  = 'translateX(0)';
    });
  });

  speakPopup('Sign FAST to double your speed!');
}

export function hideSpeedPrompt() {
  if (!speedPromptEl) return;
  speedPromptEl.style.opacity   = '0';
  speedPromptEl.style.transform = 'translateX(20px)';
  setTimeout(function() {
    speedPromptEl.style.display = 'none';
    speedPromptEl.style.transition = '';
  }, 400);
}


// =============================================================
// showSlowHint
// A small persistent label bottom-left after FAST is signed.
// Stays visible until speed returns to normal — reminds the
// player they can sign SLOW without making it feel urgent.
// =============================================================
export function showSlowHint() {
  if (!slowHintEl) return;
  slowHintEl.style.display  = 'flex';
  slowHintEl.style.opacity  = '0';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      slowHintEl.style.transition = 'opacity 0.5s ease';
      slowHintEl.style.opacity    = '1';
    });
  });
}

export function hideSlowHint() {
  if (!slowHintEl) return;
  slowHintEl.style.opacity = '0';
  setTimeout(function() {
    slowHintEl.style.display = 'none';
    slowHintEl.style.transition = '';
  }, 500);
}


// =============================================================
// showChoicePopup / showSignItPopup / showStartSignPopup
// These are unchanged from before — full popup mechanics.
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

export function hideAllPopups() {
  document.getElementById('popup').style.display = 'none';
  document.getElementById('choiceFeedback').textContent = '';
  document.getElementById('signResult').textContent = '';
  stopAudio();
  if (SPEECH_ENABLED) window.speechSynthesis.cancel();
}

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

export function showHandCanvas() {
  document.getElementById('handCanvas').style.display = 'block';
  document.getElementById('webcam').style.display     = 'block';
}

export function hideHandCanvas() {
  document.getElementById('handCanvas').style.display = 'none';
  document.getElementById('webcam').style.display     = 'none';
}

export function getDifficultyLocked() { return difficultyLocked; }
export function lockDifficulty()      { difficultyLocked = true; }

export function setPauseButtonLabel(isPaused) {
  const btn = document.getElementById('pauseBtn');
  if (btn) btn.textContent = isPaused ? 'Resume' : 'Pause';
}


// =============================================================
// createSpeedUI
// Injects three speed-related DOM elements at runtime so the
// HTML file stays clean. Each element is positioned via style.
//
// speedPromptEl: corner banner (top-right, below voice button)
//   — non-blocking, slides in and out
// slowHintEl: bottom-left persistent hint when fast mode active
// speedBadgeEl: inline in HUD alongside score/distance
// =============================================================
function createSpeedUI() {
  // ── Speed prompt banner — top-right corner, non-blocking ──
  speedPromptEl = document.createElement('div');
  Object.assign(speedPromptEl.style, {
    position:     'fixed',
    top:          '60px',
    right:        '14px',
    zIndex:       '38',
    display:      'none',
    background:   'rgba(8,12,24,0.92)',
    border:       '1px solid rgba(245,200,66,0.5)',
    borderRadius: '12px',
    padding:      '14px 16px',
    color:        'white',
    fontSize:     '14px',
    fontFamily:   'Trebuchet MS, sans-serif',
    textAlign:    'center',
    maxWidth:     '160px',
    lineHeight:   '1.5',
    boxShadow:    '0 4px 20px rgba(0,0,0,0.6)'
  });
  document.body.appendChild(speedPromptEl);

  // ── Slow hint — bottom-left, visible while fast ──
  slowHintEl = document.createElement('div');
  Object.assign(slowHintEl.style, {
    position:     'fixed',
    bottom:       '16px',
    left:         '14px',
    zIndex:       '38',
    display:      'none',
    alignItems:   'center',
    gap:          '10px',
    background:   'rgba(8,12,24,0.82)',
    border:       '1px solid rgba(144,224,239,0.25)',
    borderRadius: '10px',
    padding:      '10px 14px',
    color:        '#90e0ef',
    fontSize:     '13px',
    fontFamily:   'Trebuchet MS, sans-serif'
  });
  slowHintEl.innerHTML =
    '<img src="signs/sign_slow.png" style="width:40px;height:40px;' +
    'border-radius:5px;object-fit:cover;" alt="SLOW sign">' +
    '<span>Sign <strong>SLOW</strong> to ease off</span>';
  document.body.appendChild(slowHintEl);

  // ── Speed badge — lives in the HUD div ──
  speedBadgeEl = document.createElement('span');
  speedBadgeEl.id = 'speedBadge';
  Object.assign(speedBadgeEl.style, {
    marginLeft:      '16px',
    color:           '#f5c842',
    fontSize:        '15px',
    fontWeight:      'bold',
    textShadow:      '0 0 8px rgba(245,200,66,0.6)',
    opacity:         '0',
    transition:      'opacity 0.4s ease'
  });
  const hud = document.getElementById('hud');
  if (hud) hud.appendChild(speedBadgeEl);
}


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
      loginError.textContent     = '';
      loginOverlay.style.display = 'none';
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
  });
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
  if (!voiceButton) return;
  voiceButton.textContent   = voiceoverEnabled ? 'Voice On' : 'Voice Off';
  voiceButton.style.opacity = voiceoverEnabled ? '0.7' : '1';
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
    const scoreA = PREFERRED_VOICES.findIndex(function(h) { return (a.name || '').includes(h); });
    const scoreB = PREFERRED_VOICES.findIndex(function(h) { return (b.name || '').includes(h); });
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

function speakPopup(text)  { speakPrompt(text, false); }

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
