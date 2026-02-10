# Joy Playground

Single-page web app focused only on joyful interaction.

## Local Run

1. Start a static server:
   - `python -m http.server 5500`
2. Open in browser:
   - `http://localhost:5500`

Directly opening `index.html` also works, but a local server is more stable for browser audio/input behavior.

## Interaction

- Multi-touch: use 2+ fingers for extra chaos.
- `MODE`:
  - `FIREWORKS`: click/drag for bursts and trails
  - `BUBBLES`: drag to swirl, release to pop nearby bubbles
  - `RIBBONS`: draw ribbons; loops and zigzags trigger bonus effects
- `INTENSITY`: scales visuals/sound response
- Toggles:
  - `SOUND ON/OFF`
  - `VIBE ON/OFF`

Keyboard:

- `M`: cycle mode
- `S`: toggle sound
- `V`: toggle vibration
- `Space`: random party burst
- `Up/Down`: intensity +/- 0.1

## Vercel Deploy

This repo is connected to Vercel via GitHub integration, so pushing to `main` will deploy automatically.

Optional (manual CLI deploy):

1. Install CLI: `npm.cmd install -g vercel`
2. Deploy preview: `vercel.cmd`
3. Deploy production: `vercel.cmd --prod`

## Git Workflow

This repository tracks all development steps with commit history.

- Feature: `git checkout -b feat/<name>`
- Commit: `git commit -m "feat: <summary>"`
- Fix: `git commit -m "fix: <summary>"`
- Docs/chore/style/refactor prefixes are also used.
