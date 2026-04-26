# Ball

You are the ball. They are coming.

A 3D arcade game where you control a ball trying to survive AI players who chase and try to kick/whack you in five different sports environments.

🌐 **Live at [ball.arpitsharma.io](https://ball.arpitsharma.io)**

## Games

- ⚽ **Football** — dodge a field full of kickers
- 🏀 **Basketball** — auto-dribbling ball, indoor court
- 🏏 **Cricket** — realistic 10-player setup with batsmen, fielders, and umpire
- 🎾 **Tennis** — players with rackets on a hard court
- ⛳ **Golf** — sand bunkers, water hazards, moving golf carts with drivers

## Features

- **Realistic ball physics** — radius, mass, and bounce match real-world spec per sport
- **Camera scales to the ball** — players tower over a tiny golf ball
- **Jump-dodge** — leap over a kick to dodge it
- **Power-ups** — fire (eliminate kickers), long jump, speed, shield, shockwave, extra hearts
- **Smart AI** — pursuer / flanker / interceptor / ambusher roles, separation forces, ball-velocity prediction
- **Interactive props** — knockable bottles, cones, corner flags
- **Procedural audio** — synthesised music + SFX (no asset files)
- **Retro arcade HUD** — neon pills, leading-zero scores, per-game high scores tied to player name
- **Persistent high scores** in localStorage with player name

## Controls

| Key | Action |
|---|---|
| WASD / Arrows | Roll the ball |
| Space | Jump |
| Shift | Sprint (drains stamina) |
| C | Toggle 1st / 3rd person |
| Mouse | Look around (click to capture) |
| M | Mute |

## Tech

- Three.js (rendering)
- Rapier3D (physics, deterministic WASM)
- Vite (build)
- Web Audio API (procedural sound)

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
```

## Architecture

```
src/
├── main.js                 # entry, menu, name input
├── engine/                 # reusable across games
│   ├── BallEngine.js       # facade: scene + physics + ball + camera + input + loop + audio
│   ├── BaseGame.js         # shared game shell (score, lives, hud, hit, pickups, spawn)
│   ├── Ball.js             # physics-driven ball with player controls
│   ├── CameraRig.js        # 3rd / 1st person + mouse-look
│   ├── Input.js            # keyboard + pointer-lock mouse
│   ├── GameLoop.js         # fixed-step physics loop
│   └── Audio.js            # procedural Web Audio engine
├── hud/
│   └── HudOverlay.js       # canvas overlay: minimap + threat markers
└── games/
    ├── common/             # shared across sports
    │   ├── Kicker.js       # AI enemy with role + weapon
    │   ├── Effects.js      # active-effect stat overrides + auras
    │   ├── PowerUp.js      # power-up types + manager
    │   └── Props.js        # knockable bottles, cones, flags, benches
    ├── football/
    ├── basketball/
    ├── cricket/
    ├── tennis/
    └── golf/
```

## License

MIT
