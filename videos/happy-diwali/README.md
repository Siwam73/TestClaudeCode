# Happy Diwali — The Dev Loop

A 27.5-second vertical (9:16) Diwali reel for **The Dev Loop**, drawn, animated
and scored entirely with HTML, CSS and JavaScript. No video editor, stock
footage or audio samples are used. Every pixel and every sound is generated in
the browser.

**Rendered video:** [`output/the-dev-loop-happy-diwali.mp4`](output/the-dev-loop-happy-diwali.mp4)
(1080×1920, 30 fps, H.264 + AAC)

## The story

| Time | Beat |
| --- | --- |
| 0.0 – 3.4 s | Two kids and their peacock scurry up to a rocket in a bottle. She lights the fuse with an incense stick; he covers his ears. |
| 3.4 – 4.9 s | Lift-off! The rocket arcs away… relief… then a whistle. |
| 5.0 – 14.6 s | The rocket is back and chasing them. He trips, she drags him up, and they run off screen. |
| 14.6 – 21.6 s | The rocket sputters and explodes into **Happy Diwali**, followed by fireworks. The kids come back for a "ta-da!". |
| 21.6 – 27.5 s | The Dev Loop badge opens into the end card: **Please follow · Link in the bio to read our stories**. |

The Dev Loop logo stays at the bottom of every scene and turns into the end
card. The cyan dot in the logo traces its infinity loop.

## Preview it

Open `index.html` in Chrome, Edge or Firefox. Double-clicking the file works,
because fonts and the logo are embedded, so no server is needed.

* **Space** plays and pauses. **← / →** steps one frame.
* **Export video** records the canvas and soundtrack in real time
  (MediaRecorder). Keep the tab visible while it records. Chrome and Edge save
  an H.264 MP4. Other browsers save WebM.
* **Download soundtrack (.wav)** saves the synthesized music and sound effects.

## Render the MP4 (frame-exact)

```bash
npm install                    # installs Playwright
npx playwright install chromium
npm run render                 # writes output/the-dev-loop-happy-diwali.mp4 (+ .wav)
```

`render/render.mjs` loads the same `index.html` in headless Chromium. It draws
every frame at its exact timestamp, synthesizes the soundtrack offline, and
pipes everything to ffmpeg, which must be on your `PATH`. Options:

```bash
node render/render.mjs --crf 16                  # higher quality
node render/render.mjs --music my-track.mp3      # swap in your own licensed music
node render/render.mjs --from 14 --to 17 --out slice.mp4   # render a slice while editing
```

> Posting to Instagram? You can also mute the built-in soundtrack in the app
> and add trending audio there.

## How it's built

```
index.html          player page (canvas + controls)
css/style.css       player styling
js/core.js          timeline (DL.T), easing, keyframes, seeded RNG, IK, drawing helpers
js/background.js    paper texture, olive corner blobs, ground, brand badge
js/characters.js    the boy, the girl and the peacock (2-bone IK rigs + expressions)
js/props.js         bottle, rocket, flame, smoke, sparks, dust
js/scene.js         the story: camera, gaits, poses per beat → DL.renderFrame(ctx, t)
js/title.js         explosion, "Happy Diwali" lettering, fireworks
js/endcard.js       wipe, logo + infinity-loop comet, Follow button, link-in-bio CTA
js/audio.js         original soundtrack (Karplus–Strong plucks, bells, tabla-style drums, SFX)
js/player.js        playback, seeking, in-browser export
js/assets-data.js   generated: fonts + logo as data URIs (npm run embed)
render/render.mjs   headless frame-exact MP4 renderer
```

* **Deterministic.** `DL.renderFrame(ctx, t)` is a pure function of time.
  Particles use seeded randomness, so the same `t` always produces the same
  frame. That is what makes frame-exact export possible.
* **One timeline.** Story beats live in `DL.T` (`js/core.js`). The picture and
  the soundtrack both read from it, so moving a beat keeps them in sync.
* **Editing text or branding.** The CTA text is in `js/endcard.js`
  (`drawFollow`, `drawLink`). The logo is `assets/the-dev-loop-logo.png`. After
  replacing the logo, run `npm run embed`.

## Credits

* Characters, animation and soundtrack: original, made in code for The Dev Loop.
* Fonts (SIL Open Font License 1.1, see `assets/fonts/`): Mogra, Galada,
  Baloo 2, Poppins and JetBrains Mono.
