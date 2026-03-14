# 🎵 Spotify Song Guesser v3

Competitive single-player music quiz using your Spotify **Liked Songs** or any **playlist**.
No backend. No cost. Fully runs in the browser.

---

## New in v3
- **Playlist support** — pick any of your Spotify playlists as the song pool
- **Skip button** — 3 skips per game (costs your streak, no points)
- **Exit button** — pause + confirm modal to exit without losing your browser session
- **Source picker screen** — choose Liked Songs or any playlist before each game

---

## Scoring (max 200 pts / game)

| Event | Points |
|---|---|
| Correct answer | 10 base |
| Time bonus | up to +10 (proportional to time left) |
| Streak ×2 | ×1.1 multiplier |
| Streak ×3+ | up to ×1.5 |
| Wrong / timeout / skip | 0 pts, streak resets |

---

## Difficulty Modes

| Mode | Timer | Answer type |
|---|---|---|
| 🌿 Chill | 30s | 4 choices |
| 🎯 Normal | 20s | 4 choices + streak |
| 🔥 Hard | 15s | Type song name |
| 💀 Insane | 7s | Type artist name |

---

## Setup

1. Go to https://developer.spotify.com/dashboard → Create app
2. Add Redirect URI: `https://YOUR_USERNAME.github.io/spotify-song-guesser/`
3. Enable scopes: Web API
4. Your Client ID is already filled in `app.js`
5. Push to GitHub → Settings → Pages → main / root

## Local Testing
```bash
python -m http.server 5500
```