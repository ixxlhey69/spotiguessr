// ─────────────────────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  CLIENT_ID:    '1c087b64008c49308fbcb7e8d17a2e25',
  REDIRECT_URI: window.location.origin + window.location.pathname,
  SCOPES:       'user-library-read',
  MAX_SONGS:    300,
  ROUNDS:       10,
};

// ─────────────────────────────────────────────────────────────────────────────
//  PKCE AUTH
// ─────────────────────────────────────────────────────────────────────────────
function genVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]));
}

async function genChallenge(v) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]));
}

async function loginWithSpotify() {
  const verifier  = genVerifier();
  const challenge = await genChallenge(verifier);
  localStorage.setItem('pkce_verifier', verifier);
  const p = new URLSearchParams({
    client_id:             CONFIG.CLIENT_ID,
    response_type:         'code',
    redirect_uri:          CONFIG.REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
    scope:                 CONFIG.SCOPES,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${p}`;
}

async function exchangeCode(code) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CONFIG.CLIENT_ID,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  CONFIG.REDIRECT_URI,
      code_verifier: localStorage.getItem('pkce_verifier'),
    }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(d));
  storeTokens(d);
  return d.access_token;
}

async function refreshToken() {
  const rt = localStorage.getItem('refresh_token');
  if (!rt) return null;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CONFIG.CLIENT_ID,
      grant_type:    'refresh_token',
      refresh_token: rt,
    }),
  });
  const d = await res.json();
  if (!d.access_token) return null;
  storeTokens(d);
  return d.access_token;
}

function storeTokens(d) {
  localStorage.setItem('access_token', d.access_token);
  localStorage.setItem('token_expiry', Date.now() + d.expires_in * 1000);
  if (d.refresh_token) localStorage.setItem('refresh_token', d.refresh_token);
}

async function getToken() {
  const expiry = parseInt(localStorage.getItem('token_expiry') || '0');
  if (Date.now() < expiry - 60_000) return localStorage.getItem('access_token');
  return await refreshToken();
}

function logout() {
  localStorage.clear();
  window.location.href = window.location.pathname;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SPOTIFY API
// ─────────────────────────────────────────────────────────────────────────────
async function apiFetch(url) {
  const token = await getToken();
  if (!token) { logout(); return null; }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) return null;
  return res.json();
}

async function fetchLikedSongs() {
  const tracks = [];
  let url = `https://api.spotify.com/v1/me/tracks?limit=50`;

  while (url && tracks.length < CONFIG.MAX_SONGS) {
    setText('loading-msg', `Loading your library… (${tracks.length} songs)`);
    const data = await apiFetch(url);
    if (!data) break;
    tracks.push(...data.items.map(i => i.track).filter(t => t && t.name && t.artists?.length));
    url = data.next;
  }

  return tracks;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ITUNES PREVIEW  (replaces Spotify's deprecated preview_url)
// ─────────────────────────────────────────────────────────────────────────────
const previewCache = new Map();

async function getItunesPreview(trackName, artistName) {
  const key = `${trackName}__${artistName}`;
  if (previewCache.has(key)) return previewCache.get(key);

  try {
    const q   = encodeURIComponent(`${trackName} ${artistName}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=5`
    );
    const data  = await res.json();
    const match = data.results?.find(r => r.previewUrl);
    const url   = match?.previewUrl || null;
    previewCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────────────────────────────────────
const G = {
  songs:      [],
  used:       new Set(),
  current:    null,
  previewUrl: null,
  score:      0,
  round:      0,
  answered:   false,
  timerID:    null,
  progressID: null,
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function $(id)          { return document.getElementById(id); }
function setText(id, t) { $(id).textContent = t; }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDecoys(pool, correct, n) {
  return shuffle(pool.filter(s => s.id !== correct.id)).slice(0, n);
}

function pickNextSong() {
  if (G.used.size >= G.songs.length) G.used.clear();
  let idx;
  do { idx = Math.floor(Math.random() * G.songs.length); }
  while (G.used.has(idx));
  G.used.add(idx);
  return G.songs[idx];
}

// ─────────────────────────────────────────────────────────────────────────────
//  GAME FLOW
// ─────────────────────────────────────────────────────────────────────────────
async function startGame() {
  showScreen('loading-screen');
  setText('loading-msg', 'Loading your library…');

  const songs = await fetchLikedSongs();

  if (songs.length < 4) {
    alert(`Only ${songs.length} song(s) found in your library. You need at least 4 liked songs.`);
    logout();
    return;
  }

  G.songs = songs;
  G.used.clear();
  G.score = 0;
  G.round = 0;

  setText('total-rounds', CONFIG.ROUNDS);
  setText('max-score',    CONFIG.ROUNDS * 10);

  showScreen('game-screen');
  startRound();
}

async function startRound() {
  G.round++;
  G.answered   = false;
  G.previewUrl = null;

  clearInterval(G.timerID);
  clearInterval(G.progressID);

  const audio = $('audio-player');
  audio.pause();
  audio.removeAttribute('src');

  $('result-banner').classList.add('hidden');
  $('next-btn').classList.add('hidden');

  const artEl = $('album-art');
  artEl.style.backgroundImage = '';
  artEl.textContent = '🎵';

  $('progress').style.width        = '0%';
  $('timer-fill').style.width      = '100%';
  $('timer-fill').style.backgroundColor = '';

  updateHUD();

  const playBtn = $('play-btn');
  playBtn.disabled    = true;
  playBtn.textContent = '⏳ Fetching preview…';

  // Try up to 8 candidates until one has an iTunes preview
  let found = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = pickNextSong();
    const url       = await getItunesPreview(candidate.name, candidate.artists[0].name);
    if (url) {
      G.current    = candidate;
      G.previewUrl = url;
      found        = true;
      break;
    }
  }

  if (!found) {
    playBtn.textContent = '▶  Play Snippet';
    const banner = $('result-banner');
    banner.className = 'result-banner wrong';
    banner.textContent = '⚠ Couldn\'t find previews for these songs, skipping…';
    banner.classList.remove('hidden');
    setTimeout(startRound, 2000);
    return;
  }

  const decoys = pickDecoys(G.songs, G.current, 3);
  renderChoices(G.current, decoys);

  playBtn.textContent = '▶  Play Snippet';
  playBtn.disabled    = false;
}

function updateHUD() {
  setText('score', G.score);
  setText('round', G.round);
}

function renderChoices(correct, decoys) {
  const options   = shuffle([correct, ...decoys]);
  const container = $('choices');
  container.innerHTML = '';
  options.forEach(song => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerHTML =
      `<span class="track-name">${esc(song.name)}</span>` +
      `<span class="artist-name">${esc(song.artists[0].name)}</span>`;
    btn.addEventListener('click', () => onChoice(song, btn));
    container.appendChild(btn);
  });
}

function playSnippet() {
  const audio = $('audio-player');
  audio.src         = G.previewUrl;
  audio.currentTime = 0;
  audio.play().catch(() => {});
  $('play-btn').disabled = true;

  clearInterval(G.progressID);
  G.progressID = setInterval(() => {
    $('progress').style.width = `${Math.min((audio.currentTime / 30) * 100, 100)}%`;
  }, 100);

  audio.onended = () => {
    clearInterval(G.progressID);
    if (!G.answered) revealAnswer(null);
  };

  startTimer();
}

function startTimer() {
  let remaining = 30;
  const fill    = $('timer-fill');
  clearInterval(G.timerID);

  G.timerID = setInterval(() => {
    remaining -= 0.1;
    fill.style.width = `${Math.max((remaining / 30) * 100, 0)}%`;
    if (remaining <= 10) fill.style.backgroundColor = 'var(--red)';
    if (remaining <= 0) {
      clearInterval(G.timerID);
      if (!G.answered) revealAnswer(null);
    }
  }, 100);
}

function onChoice(selected, btn) {
  if (G.answered) return;
  clearInterval(G.timerID);
  clearInterval(G.progressID);
  $('audio-player').pause();
  revealAnswer(selected, btn);
}

function revealAnswer(selected, clickedBtn = null) {
  G.answered      = true;
  const correct   = G.current;
  const isCorrect = selected && selected.id === correct.id;

  const img = correct.album.images[0]?.url;
  if (img) {
    const artEl = $('album-art');
    artEl.style.backgroundImage = `url(${img})`;
    artEl.textContent = '';
  }

  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.disabled = true;
    const name   = btn.querySelector('.track-name').textContent;
    if (name === correct.name)  btn.classList.add('correct');
    else if (btn === clickedBtn) btn.classList.add('wrong');
  });

  if (isCorrect) G.score += 10;
  updateHUD();

  const banner = $('result-banner');
  banner.className    = `result-banner ${isCorrect ? 'correct' : 'wrong'}`;
  banner.textContent  = isCorrect
    ? '✓ Correct! +10 points'
    : `✗ It was "${correct.name}" — ${correct.artists[0].name}`;
  banner.classList.remove('hidden');

  if (G.round >= CONFIG.ROUNDS) {
    setTimeout(showResults, 2000);
  } else {
    $('next-btn').classList.remove('hidden');
  }
}

function showResults() {
  setText('final-score', G.score);
  const pct = G.score / (CONFIG.ROUNDS * 10);
  let msg;
  if      (pct === 1.0) msg = '🏆 Perfect score! You know your library by heart!';
  else if (pct >= 0.8)  msg = '🔥 Great job! Your ears don\'t miss much.';
  else if (pct >= 0.6)  msg = '🎵 Not bad! A few more listens and you\'ll ace it.';
  else if (pct >= 0.4)  msg = '🎧 Could be better — time to explore your liked songs!';
  else                  msg = '😅 Rough round. The music awaits you!';
  setText('final-message', msg);
  showScreen('results-screen');
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  setText('redirect-display', CONFIG.REDIRECT_URI);

  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');

  if (code) {
    history.replaceState({}, '', window.location.pathname);
    try { await exchangeCode(code); }
    catch (e) {
      alert('Spotify auth failed. Check your Client ID and Redirect URI.');
      logout();
      return;
    }
    await startGame();
    return;
  }

  const token = await getToken();
  if (token) { await startGame(); return; }

  showScreen('login-screen');
}

$('login-btn').addEventListener('click',      loginWithSpotify);
$('play-btn').addEventListener('click',       playSnippet);
$('next-btn').addEventListener('click',       startRound);
$('play-again-btn').addEventListener('click', startGame);

init();
