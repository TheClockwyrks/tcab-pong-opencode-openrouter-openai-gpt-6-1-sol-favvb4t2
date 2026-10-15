# Carom

A browser-native paddle duel about angles, spin, and bank shots. Move into a hit
to bend the ball's flight, and use two swaying, rotating obstacles to find a route
past your opponent. Play against the machine in **Solo**, or share a keyboard in
**Versus**. First to 11 wins, with a two-point lead.

Everything is drawn on canvas, and the four sound cues are synthesized. The game
runs entirely on the client, with no external assets or runtime requests.

## Run locally

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. To build the static production site:

```sh
npm run build
npm run preview
```

The complete site is in `dist/`, with `index.html` at its root. Serve that
directory from any static web server.

## Controls

| Input | Action |
| --- | --- |
| **W / S** | Move player one's left paddle |
| **↑ / ↓** | Move player two's right paddle; in Solo, also moves player one |
| **W / S** or **↑ / ↓** | Select a menu item |
| **Enter / Space** | Confirm |
| **P / Escape** | Pause or resume a match |
| **Escape** | Return from the guide or match results |
| **M** | Toggle sound on any screen |
| **Backtick** | Toggle the engine's diagnostics overlay |

Menus also accept mouse clicks and touch. Touching the screen reveals the
engine's two paddle sliders and menu controls. Spin comes from your paddle's
vertical motion at contact: a moving hit curves the flight, and spin gradually
fades. Amber obstacles reflect the ball off their current angle.

## Development and checks

Built with TypeScript, Vite, and the supplied Simple 2D engine. The engine owns
the frame loop, input, audio, canvas fit, diagnostics, and draw-command recording.
The simulation is render-free and all persistent game data lives in `CaromState`.

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests use native canvases and counted engine frames to exercise input,
simulation, scoring, debug poses, and recording. Coverage reports are written to
`coverage/`. The typed automation surface is returned from `game.initialize`
and accessed through `engine.debug`; poses are applied with `engine.apply`.
The full contracts are in `specs/` and engine documentation is in `engine/`.

The player-facing description, screenshots, and a recording of live play are
in [`showcase/`](showcase/showcase.md).
