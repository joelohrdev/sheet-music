# Sheet Keys

A web app for playing along with sheet music on an iPad (or any browser). Add a MusicXML file
(`.musicxml` or `.mxl`) and the notes fall onto an on-screen keyboard, landing on the key when it should
be played. The engraved score follows along above. Pieces, tempo, transposition, loop and your last position
are saved in the browser (IndexedDB), so you can pick up where you left off.

## Run it

```bash
npm install
npm run dev        # development, on http://localhost:5173 and your local network
npm run build      # production build into dist/
npm run preview    # serve dist/ on http://localhost:4173 and your local network
npm test           # unit tests for the timing logic
```

## Use it on an iPad

1. Put the contents of `dist/` on any static host that serves HTTPS (Netlify, Cloudflare Pages, GitHub Pages, Vercel…).
2. Open the address in Safari on the iPad, then Share → Add to Home Screen.

Installed that way it opens full screen, works offline, and Safari keeps the saved pieces (a page that is only
opened in a Safari tab can have its stored data cleared after a week without a visit).

To try it without hosting, run `npm run preview` on the Mac and open `http://<the Mac's address>:4173` on an iPad on
the same Wi-Fi. Plain http has no offline mode.

## Notes

- Sound is synthesized with the Web Audio API (no sound files), so it is a piano-like tone rather than a recorded piano.
- iPad Safari cannot read a MIDI keyboard, so the app shows what to play but does not check what you play.
- The ring/silent switch can mute web audio; the app asks iOS for "playback" audio to avoid that.
- Repeat signs and numbered endings are followed; D.C./D.S./coda jumps are not.
- The engraver is OpenSheetMusicDisplay (BSD-3-Clause). The sample Moonlight Sonata score was converted from the
  public-domain Mutopia Project MIDI.

## Library: sending pieces from the Mac to the iPad

The site has a small private library (`api/library.ts`, a Vercel Function that keeps files in Vercel Blob).
Teacher's "Send to iPad" button uploads a piece to it; the app's "Your library" section lists what is there and
downloads it to the device (it is then stored in the browser, so it works offline).

One-time setup in the Vercel dashboard, for this project:

1. Storage → Create → Blob → connect it to the project (this adds `BLOB_READ_WRITE_TOKEN`).
2. Settings → Environment Variables → add `LIBRARY_PASSCODE` (a long phrase) for Production.
3. Push the code so the project redeploys.

Then in Teacher: Pieces → iPad Site… → the site's address and the passcode. On the iPad: Your library → enter the
passcode once. Every request needs the passcode; the list of pieces is not public. (A file's own storage address
contains a random token, so it cannot be guessed, but anyone who has it can open that file.)
