// ─────────────────────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  CLIENT_ID:    '1c087b64008c49308fbcb7e8d17a2e25',
  REDIRECT_URI: window.location.origin + window.location.pathname,
  SCOPES:       'user-library-read user-read-private playlist-read-private playlist-read-collaborative',
  MAX_SONGS:    300,
  ROUNDS:       10,
};

const DIFFICULTIES = {
  chill:  { label:'🌿 Chill',  timer:30, mode:'choice',      streakBonus:false },
  normal: { label:'🎯 Normal', timer:20, mode:'choice',      streakBonus:true  },
  hard:   { label:'🔥 Hard',   timer:15, mode:'type_track',  streakBonus:true  },
  insane: { label:'💀 Insane', timer:7,  mode:'type_artist', streakBonus:true  },
};

const LB_KEY = 'ssg_leaderboard_v2';

// ─────────────────────────────────────────────────────────────────────────────
//  PKCE AUTH
// ─────────────────────────────────────────────────────────────────────────────
function genVerifier() {
  const a = new Uint8Array(32); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g,c=>({'+':'-','/':'_','=':''}[c]));
}
async function genChallenge(v) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/[+/=]/g,c=>({'+':'-','/':'_','=':''}[c]));
}
async function loginWithSpotify() {
  const v=genVerifier(), c=await genChallenge(v);
  localStorage.setItem('pkce_verifier',v);
  location.href='https://accounts.spotify.com/authorize?'+new URLSearchParams({
    client_id:CONFIG.CLIENT_ID,response_type:'code',redirect_uri:CONFIG.REDIRECT_URI,
    code_challenge_method:'S256',code_challenge:c,scope:CONFIG.SCOPES,
  });
}
async function exchangeCode(code) {
  const r=await fetch('https://accounts.spotify.com/api/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:CONFIG.CLIENT_ID,grant_type:'authorization_code',
      code,redirect_uri:CONFIG.REDIRECT_URI,code_verifier:localStorage.getItem('pkce_verifier')}),
  });
  const d=await r.json();
  if(!d.access_token) throw new Error(JSON.stringify(d));
  storeTokens(d); return d.access_token;
}
async function refreshAccessToken() {
  const rt=localStorage.getItem('refresh_token'); if(!rt) return null;
  const r=await fetch('https://accounts.spotify.com/api/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:CONFIG.CLIENT_ID,grant_type:'refresh_token',refresh_token:rt}),
  });
  const d=await r.json(); if(!d.access_token) return null;
  storeTokens(d); return d.access_token;
}
function storeTokens(d) {
  localStorage.setItem('access_token',d.access_token);
  localStorage.setItem('token_expiry',Date.now()+d.expires_in*1000);
  if(d.refresh_token) localStorage.setItem('refresh_token',d.refresh_token);
}
async function getToken() {
  const exp=parseInt(localStorage.getItem('token_expiry')||'0');
  if(Date.now()<exp-60000) return localStorage.getItem('access_token');
  return refreshAccessToken();
}
function logout(){ localStorage.clear(); location.href=location.pathname; }

// ─────────────────────────────────────────────────────────────────────────────
//  SPOTIFY API
// ─────────────────────────────────────────────────────────────────────────────
async function apiFetch(url) {
  const token=await getToken(); if(!token){logout();return null;}
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  if(r.status===401){logout();return null;}
  if(!r.ok) return null;
  return r.json();
}

async function fetchLikedSongs() {
  const tracks=[];
  let url='https://api.spotify.com/v1/me/tracks?limit=50';
  while(url && tracks.length<CONFIG.MAX_SONGS){
    setText('loading-msg',`Loading liked songs… (${tracks.length})`);
    const d=await apiFetch(url); if(!d) break;
    tracks.push(...d.items.map(i=>i.track).filter(t=>t&&t.name&&t.artists?.length));
    url=d.next;
  }
  return tracks;
}

async function fetchUserPlaylists() {
  const playlists=[];
  let url='https://api.spotify.com/v1/me/playlists?limit=50';
  while(url){
    const d=await apiFetch(url); if(!d) break;
    playlists.push(...d.items.filter(p=>p&&p.name));
    url=d.next;
  }
  return playlists;
}

async function fetchPlaylistTracks(playlistId) {
  const tracks=[];
  let url=`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(id,name,artists,album))`;
  while(url && tracks.length<CONFIG.MAX_SONGS){
    setText('loading-msg',`Loading playlist… (${tracks.length} songs)`);
    const d=await apiFetch(url); if(!d) break;
    tracks.push(...d.items.map(i=>i.track).filter(t=>t&&t.name&&t.artists?.length));
    url=d.next;
  }
  return tracks;
}

async function fetchSpotifyUsername() {
  const d=await apiFetch('https://api.spotify.com/v1/me');
  return d?.display_name||'';
}

// ─────────────────────────────────────────────────────────────────────────────
//  ITUNES PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
const previewCache=new Map();
async function getItunesPreview(name,artist) {
  const key=`${name}__${artist}`;
  if(previewCache.has(key)) return previewCache.get(key);
  try {
    const r=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(name+' '+artist)}&media=music&entity=song&limit=5`);
    const d=await r.json();
    const url=d.results?.find(x=>x.previewUrl)?.previewUrl||null;
    previewCache.set(key,url); return url;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────
function getLB(){ try{return JSON.parse(localStorage.getItem(LB_KEY)||'[]');}catch{return[];} }
function saveLB(e){ localStorage.setItem(LB_KEY,JSON.stringify(e)); }
function addToLB(name,score,diff) {
  const data=getLB();
  const entry={name:name.trim()||'Anonymous',score,diff,ts:Date.now()};
  data.push(entry);
  data.sort((a,b)=>b.score-a.score||a.ts-b.ts);
  saveLB(data.slice(0,50)); return data.slice(0,50);
}

// ─────────────────────────────────────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────────────────────────────────────
const G={
  songs:[],used:new Set(),current:null,previewUrl:null,
  score:0,round:0,streak:0,skipsLeft:3,
  diff:'normal',sourceName:'Liked Songs',
  answered:false,timerID:null,progressID:null,
  roundStartTime:0,spotifyName:'',lastEntry:null,
};

// ─────────────────────────────────────────────────────────────────────────────
//  DOM HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
const setText=(id,t)=>$(id).textContent=t;
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function pickDecoys(pool,correct,n){return shuffle(pool.filter(s=>s.id!==correct.id)).slice(0,n);}
function pickNextSong(){
  if(G.used.size>=G.songs.length) G.used.clear();
  let idx;
  do{idx=Math.floor(Math.random()*G.songs.length);}while(G.used.has(idx));
  G.used.add(idx); return G.songs[idx];
}
function popPoints(txt){
  const el=$('points-pop');
  el.textContent=txt; el.classList.remove('hidden');
  el.style.animation='none'; void el.offsetWidth; el.style.animation='';
  setTimeout(()=>el.classList.add('hidden'),950);
}
function updateSkipBtn(){
  $('skip-btn').textContent=`⏭ ${G.skipsLeft}`;
  $('skip-btn').disabled=G.skipsLeft<=0||G.answered;
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  setText('redirect-display',CONFIG.REDIRECT_URI);
  const code=new URLSearchParams(location.search).get('code');
  if(code){
    history.replaceState({},'',location.pathname);
    try{await exchangeCode(code);}
    catch{alert('Auth failed. Check Client ID and Redirect URI.');logout();return;}
  }
  const token=await getToken();
  if(!token){showScreen('login-screen');return;}
  showScreen('loading-screen');
  setText('loading-msg','Loading your playlists…');
  G.spotifyName=(await fetchSpotifyUsername())||'';
  await showSourceScreen();
}

// ─────────────────────────────────────────────────────────────────────────────
//  SOURCE SCREEN
// ─────────────────────────────────────────────────────────────────────────────
async function showSourceScreen() {
  showScreen('source-screen');
  $('playlist-list').innerHTML='';
  $('playlist-loading').classList.remove('hidden');

  const playlists=await fetchUserPlaylists();
  $('playlist-loading').classList.add('hidden');

  playlists.forEach(pl=>{
    const btn=document.createElement('button');
    btn.className='playlist-item';
    const thumb=pl.images?.[0]?.url;
    btn.innerHTML=`
      ${thumb
        ? `<img class="playlist-thumb" src="${esc(thumb)}" alt="" loading="lazy"/>`
        : `<div class="playlist-thumb-placeholder">🎵</div>`}
      <div class="playlist-info">
        <span class="playlist-name">${esc(pl.name)}</span>
        <span class="playlist-meta">${pl.tracks?.total||'?'} songs</span>
      </div>`;
    btn.addEventListener('click',()=>selectSource('playlist',pl.id,pl.name));
    $('playlist-list').appendChild(btn);
  });
}

async function selectSource(type, id='', name='Liked Songs') {
  showScreen('loading-screen');
  setText('loading-msg','Loading songs…');
  let songs;
  if(type==='liked'){
    songs=await fetchLikedSongs();
    G.sourceName='❤️ Liked Songs';
  } else {
    songs=await fetchPlaylistTracks(id);
    G.sourceName='📋 '+name;
  }
  if(songs.length<4){
    alert(`Only ${songs.length} songs found. Need at least 4.`);
    await showSourceScreen(); return;
  }
  G.songs=songs;
  $('source-label').textContent=G.sourceName;
  showScreen('difficulty-screen');
}

// ─────────────────────────────────────────────────────────────────────────────
//  BEGIN GAME
// ─────────────────────────────────────────────────────────────────────────────
function beginGame(diff) {
  G.diff=diff; G.used.clear();
  G.score=0; G.round=0; G.streak=0; G.skipsLeft=3;
  setText('total-rounds',CONFIG.ROUNDS);
  $('diff-badge').textContent=DIFFICULTIES[diff].label;
  showScreen('game-screen');
  updateSkipBtn(); updateStreakDisplay();
  startRound();
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROUND
// ─────────────────────────────────────────────────────────────────────────────
async function startRound() {
  G.round++; G.answered=false; G.previewUrl=null;
  clearInterval(G.timerID); clearInterval(G.progressID);

  const audio=$('audio-player');
  audio.pause(); audio.removeAttribute('src');

  $('result-banner').classList.add('hidden');
  $('next-btn').classList.add('hidden');
  $('choices').innerHTML='';
  $('type-area').classList.add('hidden');
  $('guess-input').value='';
  $('autocomplete-list').classList.add('hidden');

  const art=$('album-art');
  art.style.backgroundImage=''; art.textContent='🎵';
  $('progress').style.width='0%';
  $('timer-fill').style.width='100%';
  $('timer-fill').style.backgroundColor='';
  $('timer-label').textContent=DIFFICULTIES[G.diff].timer+'s';

  updateHUD(); updateSkipBtn();

  const playBtn=$('play-btn');
  playBtn.disabled=true; playBtn.textContent='⏳ Fetching preview…';

  let found=false;
  for(let i=0;i<8;i++){
    const c=pickNextSong();
    const u=await getItunesPreview(c.name,c.artists[0].name);
    if(u){G.current=c;G.previewUrl=u;found=true;break;}
  }

  if(!found){
    const b=$('result-banner');
    b.className='result-banner timeout';
    b.textContent='⚠ Couldn\'t find previews, skipping…';
    b.classList.remove('hidden');
    setTimeout(startRound,1800); return;
  }

  const mode=DIFFICULTIES[G.diff].mode;
  if(mode==='choice'){
    renderChoices(G.current,pickDecoys(G.songs,G.current,3));
    $('choices').classList.remove('hidden');
    $('type-area').classList.add('hidden');
  } else {
    buildAutocomplete(mode);
    $('choices').innerHTML='';
    $('type-area').classList.remove('hidden');
  }
  playBtn.textContent='▶  Play Snippet'; playBtn.disabled=false;
}

function updateHUD(){
  setText('score',G.score); setText('round',G.round); updateStreakDisplay();
}
function updateStreakDisplay(){
  const el=$('streak-display');
  if(G.streak>=2&&DIFFICULTIES[G.diff].streakBonus){
    setText('streak',G.streak); el.classList.remove('hidden');
  } else { el.classList.add('hidden'); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SKIP
// ─────────────────────────────────────────────────────────────────────────────
function skipSong() {
  if(G.answered||G.skipsLeft<=0) return;
  clearInterval(G.timerID); clearInterval(G.progressID);
  $('audio-player').pause();
  G.skipsLeft--; G.streak=0; G.answered=true;
  updateHUD(); updateSkipBtn();

  const b=$('result-banner');
  b.className='result-banner skipped';
  b.textContent=`⏭ Skipped — it was "${G.current.name}" — ${G.current.artists[0].name}`;
  b.classList.remove('hidden');

  const img=G.current.album?.images?.[0]?.url;
  if(img){$('album-art').style.backgroundImage=`url(${img})`;$('album-art').textContent='';}

  document.querySelectorAll('.choice-btn').forEach(b=>b.disabled=true);

  if(G.round>=CONFIG.ROUNDS) setTimeout(showResults,1800);
  else $('next-btn').classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHOICES
// ─────────────────────────────────────────────────────────────────────────────
function renderChoices(correct,decoys){
  const opts=shuffle([correct,...decoys]);
  const c=$('choices'); c.innerHTML='';
  opts.forEach(song=>{
    const btn=document.createElement('button');
    btn.className='choice-btn';
    btn.innerHTML=`<span class="track-name">${esc(song.name)}</span><span class="artist-name">${esc(song.artists[0].name)}</span>`;
    btn.addEventListener('click',()=>onChoiceClick(song,btn));
    c.appendChild(btn);
  });
}
function onChoiceClick(selected,clickedBtn){
  if(G.answered) return;
  clearInterval(G.timerID); clearInterval(G.progressID);
  $('audio-player').pause();
  revealAnswer(selected.id===G.current.id,(Date.now()-G.roundStartTime)/1000,clickedBtn);
}

// ─────────────────────────────────────────────────────────────────────────────
//  TYPE + AUTOCOMPLETE
// ─────────────────────────────────────────────────────────────────────────────
function buildAutocomplete(mode){
  const pool=G.songs.map(s=>mode==='type_track'?s.name:s.artists[0].name);
  const unique=[...new Set(pool)].sort((a,b)=>a.localeCompare(b));
  const input=$('guess-input'), list=$('autocomplete-list');
  input.placeholder=mode==='type_track'?'Type the song name…':'Type the artist name…';
  let activeIdx=-1;

  function renderAC(f){
    list.innerHTML=''; if(!f.length){list.classList.add('hidden');return;}
    f.slice(0,8).forEach((item,i)=>{
      const li=document.createElement('li');
      li.textContent=item;
      li.addEventListener('mousedown',e=>{e.preventDefault();input.value=item;list.classList.add('hidden');});
      list.appendChild(li);
    });
    list.classList.remove('hidden'); activeIdx=-1;
  }
  input.oninput=()=>{
    const q=input.value.trim().toLowerCase();
    if(!q){list.classList.add('hidden');return;}
    renderAC(unique.filter(x=>x.toLowerCase().includes(q)));
  };
  input.onkeydown=e=>{
    const items=list.querySelectorAll('li');
    if(e.key==='ArrowDown'){activeIdx=Math.min(activeIdx+1,items.length-1);}
    else if(e.key==='ArrowUp'){activeIdx=Math.max(activeIdx-1,0);}
    else if(e.key==='Enter'){
      if(activeIdx>=0&&items[activeIdx]){input.value=items[activeIdx].textContent;list.classList.add('hidden');}
      else submitTypeGuess(); return;
    }
    items.forEach((li,i)=>li.classList.toggle('active',i===activeIdx));
  };
  input.onblur=()=>setTimeout(()=>list.classList.add('hidden'),120);
}

function submitTypeGuess(){
  if(G.answered) return;
  const val=$('guess-input').value.trim().toLowerCase(); if(!val) return;
  clearInterval(G.timerID); clearInterval(G.progressID);
  $('audio-player').pause(); $('autocomplete-list').classList.add('hidden');
  const mode=DIFFICULTIES[G.diff].mode;
  const correct=(mode==='type_track'?G.current.name:G.current.artists[0].name).toLowerCase();
  revealAnswer(fuzzyMatch(val,correct),(Date.now()-G.roundStartTime)/1000,null);
}

function fuzzyMatch(input,target){
  if(input===target) return true;
  const clean=s=>s.replace(/\s*[\(\[].*/,'').replace(/[^a-z0-9\s]/g,'').trim();
  return clean(input)===clean(target)||target.startsWith(clean(input))||clean(input).startsWith(clean(target));
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCORING + REVEAL
// ─────────────────────────────────────────────────────────────────────────────
function calcPoints(elapsed){
  const t=DIFFICULTIES[G.diff].timer;
  const base=10, timeBonus=Math.round(Math.max(0,(t-elapsed)/t)*10);
  let pts=base+timeBonus;
  if(DIFFICULTIES[G.diff].streakBonus&&G.streak>=2)
    pts=Math.round(pts*Math.min(1+(G.streak-1)*0.1,1.5));
  return pts;
}

function revealAnswer(isCorrect,elapsed,clickedBtn){
  G.answered=true;
  const img=G.current.album?.images?.[0]?.url;
  if(img){$('album-art').style.backgroundImage=`url(${img})`;$('album-art').textContent='';}

  if(clickedBtn){
    document.querySelectorAll('.choice-btn').forEach(b=>{
      b.disabled=true;
      if(b.querySelector('.track-name')?.textContent===G.current.name) b.classList.add('correct');
      else if(b===clickedBtn) b.classList.add('wrong');
    });
  }

  if(isCorrect){
    G.streak++;
    const pts=calcPoints(elapsed);
    G.score+=pts; popPoints(`+${pts}`);
  } else { G.streak=0; }

  updateHUD();

  const banner=$('result-banner');
  banner.className=`result-banner ${isCorrect?'correct':'wrong'}`;
  banner.textContent=isCorrect
    ?'✓ Correct!'
    :`✗ It was "${G.current.name}" — ${G.current.artists[0].name}`;
  banner.classList.remove('hidden');
  updateSkipBtn();

  if(G.round>=CONFIG.ROUNDS) setTimeout(showResults,1800);
  else $('next-btn').classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
//  AUDIO + TIMER
// ─────────────────────────────────────────────────────────────────────────────
function playSnippet(){
  const audio=$('audio-player');
  audio.src=G.previewUrl; audio.currentTime=0;
  audio.play().catch(()=>{});
  $('play-btn').disabled=true;
  G.roundStartTime=Date.now();
  clearInterval(G.progressID);
  G.progressID=setInterval(()=>{
    $('progress').style.width=`${Math.min((audio.currentTime/30)*100,100)}%`;
  },100);
  audio.onended=()=>{
    clearInterval(G.progressID);
    if(!G.answered) timeoutRound();
  };
  startTimer();
  if(!$('type-area').classList.contains('hidden')) $('guess-input').focus();
}

function startTimer(){
  let rem=DIFFICULTIES[G.diff].timer;
  clearInterval(G.timerID);
  G.timerID=setInterval(()=>{
    rem-=0.1;
    $('timer-fill').style.width=`${Math.max((rem/DIFFICULTIES[G.diff].timer)*100,0)}%`;
    $('timer-label').textContent=Math.max(0,Math.ceil(rem))+'s';
    if(rem<=DIFFICULTIES[G.diff].timer*0.33) $('timer-fill').style.backgroundColor='var(--red)';
    if(rem<=0){clearInterval(G.timerID);if(!G.answered) timeoutRound();}
  },100);
}

function timeoutRound(){
  G.answered=true; G.streak=0; updateHUD(); updateSkipBtn();
  const img=G.current.album?.images?.[0]?.url;
  if(img){$('album-art').style.backgroundImage=`url(${img})`;$('album-art').textContent='';}
  document.querySelectorAll('.choice-btn').forEach(b=>b.disabled=true);
  const b=$('result-banner');
  b.className='result-banner timeout';
  b.textContent=`⏱ Time\'s up! It was "${G.current.name}" — ${G.current.artists[0].name}`;
  b.classList.remove('hidden');
  if(G.round>=CONFIG.ROUNDS) setTimeout(showResults,1800);
  else $('next-btn').classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESULTS
// ─────────────────────────────────────────────────────────────────────────────
function showResults(){
  setText('final-score',G.score);
  setText('max-score',CONFIG.ROUNDS*20);
  const pct=G.score/(CONFIG.ROUNDS*20);
  setText('final-message',
    pct===1.0?'🏆 Perfect score! Legendary.':
    pct>=0.8 ?'🔥 You really know your music!':
    pct>=0.6 ?'🎵 Solid! Getting better.':
    pct>=0.4 ?'🎧 Not bad — keep listening!':'😅 Time to revisit those songs!');
  $('player-name').value=G.spotifyName;
  $('save-score-btn').disabled=false;
  $('save-score-btn').textContent='Save Score 🏆';
  $('mini-leaderboard').innerHTML='';
  $('save-score-btn').onclick=saveAndShowMiniLB;
  showScreen('results-screen');
}

function saveAndShowMiniLB(){
  const name=$('player-name').value.trim()||G.spotifyName||'Anonymous';
  const entry={name,score:G.score,diff:G.diff,ts:Date.now()};
  const all=getLB(); all.push(entry);
  all.sort((a,b)=>b.score-a.score||a.ts-b.ts);
  saveLB(all.slice(0,50)); G.lastEntry=entry;
  const rank=all.findIndex(e=>e.ts===entry.ts)+1;
  const wrap=$('mini-leaderboard');
  wrap.innerHTML=`<h3>Your Rank: #${rank} of ${all.length}</h3><ol></ol>`;
  const ol=wrap.querySelector('ol');
  all.slice(0,5).forEach((e,i)=>{
    const li=document.createElement('li');
    if(e.ts===entry.ts) li.classList.add('highlight');
    li.innerHTML=`<span class="lb-rank">#${i+1}</span><span>${esc(e.name)} <span style="font-size:.75rem;color:var(--muted)">${DIFFICULTIES[e.diff]?.label||e.diff}</span></span><span class="lb-pts">${e.score}</span>`;
    ol.appendChild(li);
  });
  $('save-score-btn').disabled=true;
  $('save-score-btn').textContent='✓ Saved';
}

// ─────────────────────────────────────────────────────────────────────────────
//  LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────
let lbFilter='all';
function showLeaderboard(){ renderLeaderboard(); showScreen('leaderboard-screen'); }
function renderLeaderboard(){
  const all=getLB();
  const diffs=['all','chill','normal','hard','insane'];
  const tabs=$('lb-tabs'); tabs.innerHTML='';
  diffs.forEach(d=>{
    const btn=document.createElement('button');
    btn.className='lb-tab'+(d===lbFilter?' active':'');
    btn.textContent=d==='all'?'🌐 All':DIFFICULTIES[d]?.label||d;
    btn.onclick=()=>{lbFilter=d;renderLeaderboard();};
    tabs.appendChild(btn);
  });
  const filtered=lbFilter==='all'?all:all.filter(e=>e.diff===lbFilter);
  const tbody=$('lb-body'); tbody.innerHTML='';
  if(!filtered.length){
    tbody.innerHTML='<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:20px">No scores yet!</td></tr>';
    return;
  }
  filtered.forEach((e,i)=>{
    const tr=document.createElement('tr');
    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1);
    tr.innerHTML=`<td>${medal}</td><td>${esc(e.name)}</td><td style="color:var(--green);font-weight:700">${e.score}</td><td>${DIFFICULTIES[e.diff]?.label||e.diff}</td><td style="color:var(--muted)">${new Date(e.ts).toLocaleDateString()}</td>`;
    tbody.appendChild(tr);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXIT MODAL
// ─────────────────────────────────────────────────────────────────────────────
function showExitModal(){
  clearInterval(G.timerID); clearInterval(G.progressID);
  $('audio-player').pause();
  $('exit-modal').classList.remove('hidden');
}
function hideExitModal(){
  $('exit-modal').classList.add('hidden');
  if(!G.answered) startTimer();
}
function confirmExit(){
  $('exit-modal').classList.add('hidden');
  showScreen('difficulty-screen');
}

// ─────────────────────────────────────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
$('login-btn').addEventListener('click',loginWithSpotify);
$('src-liked-btn').addEventListener('click',()=>selectSource('liked'));
$('back-to-source-btn').addEventListener('click',showSourceScreen);
$('leaderboard-btn').addEventListener('click',showLeaderboard);
$('play-btn').addEventListener('click',playSnippet);
$('skip-btn').addEventListener('click',skipSong);
$('exit-btn').addEventListener('click',showExitModal);
$('exit-cancel-btn').addEventListener('click',hideExitModal);
$('exit-confirm-btn').addEventListener('click',confirmExit);
$('next-btn').addEventListener('click',startRound);
$('submit-guess-btn').addEventListener('click',submitTypeGuess);
$('play-again-btn').addEventListener('click',()=>beginGame(G.diff));
$('change-diff-btn').addEventListener('click',()=>showScreen('difficulty-screen'));
$('change-source-btn').addEventListener('click',showSourceScreen);
$('lb-back-btn').addEventListener('click',()=>showScreen('difficulty-screen'));
$('lb-clear-btn').addEventListener('click',()=>{
  if(confirm('Clear ALL leaderboard scores?')){localStorage.removeItem(LB_KEY);renderLeaderboard();}
});
document.querySelectorAll('.diff-btn').forEach(btn=>{
  btn.addEventListener('click',()=>beginGame(btn.dataset.diff));
});
$('exit-modal').addEventListener('click',e=>{if(e.target===$('exit-modal')) hideExitModal();});

init();