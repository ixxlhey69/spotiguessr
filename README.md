# 🎵 Spotify Song Guesser

A **single-player** music quiz game built with the Spotify Web API.
It plays 30-second previews from **your own liked songs** and asks you to pick the right one from four choices — no backend required, runs 100% in the browser.

---

## Features
- Uses your Spotify **Liked Songs** library — fully personalised
- 4-choice multiple choice with a 30-second timer per round
- Album art revealed on answer
- Score tracked over 10 rounds
- PKCE OAuth — no backend, no server secrets needed
- Works on **GitHub Pages** or any static host

---

## Setup

### 1. Create a Spotify Developer App
1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create app**.
3. Give it any **Name** and **Description**.
4. Under **Redirect URIs**, add:
   - Your GitHub Pages URL, e.g. `https://YOUR_USERNAME.github.io/spotify-song-guesser/`
   - For local testing: `http://localhost:5500/` (adjust port as needed)
5. Under **APIs used**, tick **Web API**.
6. Save and copy your **Client ID**.

### 2. Add Your Client ID
Open `app.js` and replace the placeholder at the top:

```js
const CONFIG = {
  CLIENT_ID: 'YOUR_SPOTIFY_CLIENT_ID',   // ← paste here
  ...
};
```

> **Tip:** The exact Redirect URI your app will use is shown on the login screen
> (bottom of the card), so you can copy-paste it directly into your Spotify app settings.

### 3. Deploy to GitHub Pages
1. Push the repo to GitHub.
2. Go to **Settings → Pages → Source → Deploy from branch → main / root**.
3. Your game is live at `https://YOUR_USERNAME.github.io/spotify-song-guesser/`.

---

## Local Testing

Any static file server works:

```bash
# Python (built-in)
python -m http.server 5500

# Node (npx)
npx serve .
```

Then open `http://localhost:5500/` in your browser.

---

## Configuration

All tuneable options are at the top of `app.js`:

| Option | Default | Description |
|---|---|---|
| `CLIENT_ID` | `'YOUR_SPOTIFY_CLIENT_ID'` | Your Spotify app's Client ID |
| `MAX_SONGS` | `300` | Max liked songs to fetch from your library |
| `ROUNDS` | `10` | Number of rounds per game |

---

## Notes
- Only tracks that have a **30-second preview URL** from Spotify will appear.
  Most tracks have one, but some (especially newer releases in certain markets) do not.
- The game requires at least **4 songs with previews** in your liked library.
- Tokens are stored in `localStorage` and auto-refreshed — you only need to log in once.