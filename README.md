# Joy Playground

Single-page web app focused only on joyful interaction.

## Local Run

1. Start a static server:
   - `python -m http.server 5500`
2. Open in browser:
   - `http://localhost:5500`

Directly opening `index.html` also works, but a local server is more stable for browser audio/input behavior.

## Interaction

- Click: mini burst + sound + short vibration
- Drag: sparkling trail + rhythm tone + repeated vibration
- Toggles:
  - `SOUND ON/OFF`
  - `VIBE ON/OFF`

## Vercel Deploy

1. Install CLI:
   - `npm.cmd install -g vercel`
2. Deploy (first time):
   - `vercel.cmd`
3. Production deploy:
   - `vercel.cmd --prod`

## Git Workflow

This repository tracks all development steps with commit history.

- Feature: `git checkout -b feat/<name>`
- Commit: `git commit -m "feat: <summary>"`
- Fix: `git commit -m "fix: <summary>"`
- Docs/chore/style/refactor prefixes are also used.
