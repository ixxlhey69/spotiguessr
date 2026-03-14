# 🎵 Spotify Song Guesser v2

A competitive single-player music quiz using your Spotify **Liked Songs**.
No backend. No cost. Runs 100% in the browser and hosts free on GitHub Pages.

---

## Features
- **4 difficulty modes**: Chill, Normal, Hard (type song name), Insane (type artist name)
- **Time-based scoring**: faster answers = more points (up to 20 pts/round)
- **Streak multiplier**: consecutive correct answers multiply your score
- **Autocomplete input**: fuzzy-matching as you type in Hard/Insane modes
- **Local leaderboard**: saves top 50 scores in your browser, filterable by difficulty
- **PKCE OAuth**: no backend needed, Client ID is safe to expose
- **iTunes previews**: uses Apple's free iTunes API since Spotify deprecated preview_url in Nov 2024

---

## Setup

### 1. Create a Spotify Developer App
1. Go to https://developer.spotify.com/dashboard and log in.
2. Click **Create app**.
3. Under **Redirect URIs**, add your GitHub Pages URL:
   `https://YOUR_USERNAME.github.io/spotify-song-guesser/`
4. Tick **Web API** under APIs used. Save.
5. Copy your **Client ID**.

> The exact redirect URI is shown on the login screen of the game — copy it from there.

### 2. Your Client ID is already set
The `app.js` in this repo already has your Client ID filled in.

### 3. Deploy to GitHub Pages
1. Push all files to a GitHub repo (`main` branch, root directory).
2. **Settings → Pages → Source → Deploy from branch → main / root**.
3. Live in ~30 seconds at `https://YOUR_USERNAME.github.io/spotify-song-guesser/`.

---

## Scoring

| Event | Points |
|---|---|
| Correct answer | 10 base pts |
| Time bonus | up to +10 pts (proportional to time remaining) |
| Streak x2 | ×1.1 multiplier |
| Streak x3+ | up to ×1.5 multiplier |
| Wrong / timeout | 0 pts, streak resets |

Max score: **200 points** per game (10 rounds × 20 pts).

---

## Difficulty Modes

| Mode | Timer | Answer type | Streak bonus |
|---|---|---|---|
| 🌿 Chill | 30s | 4 choices | No |
| 🎯 Normal | 20s | 4 choices | Yes |
| 🔥 Hard | 15s | Type song name | Yes |
| 💀 Insane | 7s | Type artist name | Yes |

---

## Local Testing

```bash
python -m http.server 5500
# then open http://localhost:5500/
```