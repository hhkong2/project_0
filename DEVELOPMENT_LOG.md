# Development Log

This file records decisions and progress alongside Git commits.

## Design Q&A (Self-Directed)

Q: What makes a "joy-only" app feel instantly fun without goals or rules?
A: Fast feedback (light + sound + haptics), multi-touch play, and a few surprising bonuses (gesture rewards).

Q: How do we keep sound always pleasant while still feeling responsive?
A: In `RIBBONS` mode, quantize notes to a pentatonic scale so almost any movement sounds musical.

Q: How do we keep it easy to deploy forever?
A: Keep it a static, zero-build site (plain `index.html` + `styles.css` + `app.js`) so Vercel deploys on every push.

## Timeline

### 2026-02-10

- `chore: initialize joy playground app`
  - Static site scaffold + canvas particles
  - Pointer interactions + WebAudio tones + vibration toggle
- `chore: add vercel deployment config`
  - `vercel.json` added
- `chore: record vercel deployment and repo connection`
  - GitHub remote connected and Vercel production deploy completed

### 2026-02-10 (Enhancements)

- `refactor: rebuild core with mode + intensity controls`
  - ASCII-safe UI text
  - Mode toggle + intensity slider
  - Multi-touch pointer tracking + settings persistence
- `feat: add bubbles mode with pop synth`
  - `BUBBLES` mode with swirl physics + pop noise
- `feat: add ribbons mode with gesture bonuses`
  - `RIBBONS` mode with live ribbon drawing + loop/zigzag bonuses
