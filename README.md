# Starman's Escape

A **Tesla Roadster × Subway Surfers** style 3D endless runner — built as a fan tribute.
You're the next-gen Roadster on a dusk desert highway with a police cruiser hunting you.
Dodge traffic, duck under low-clearance gantries, hit ramps, collect coins — and **fly**
when the cops get too close. The catch: your cold-gas thrusters only hold **10 seconds**,
and refill while you drive, just like the real thing.

Everything is generated in code: **zero image or audio assets**. The car, the cop, the
desert, the sky and every sound (engine, siren, thrusters, synthwave soundtrack) are
procedural.

## The chase

- A police cruiser shadows your rear quarter. Each crash cuts your speed and lets the
  cops close in — the siren gets louder, the screen vignette turns red, the heat meter climbs.
- Fly to break line of sight: the cops fall back while you're airborne.
- Survive and recover: at full speed the cruiser drifts back to a baseline distance and you
  get a **"LOST 'EM! +50"** bonus.
- If the cops reach you: **BUSTED**.

## Flight (the real one's party trick)

- Press **SPACE** (or the ⚡FLY button / double-tap) at any time to take off.
- Max **10s of continuous thrust** — the tank drains 1s per second.
- When thrusters are off, the tanks **automatically refill while you drive** (0.85s of fuel
  per second; ~12s for a full tank).
- Cyan energy cells top up **+3s** instantly and count for points.
- Run the tank dry mid-air? The thrusters cut out and you glide (fall) back to the road.
- Crashing while airborne kills the thrust. Crash while grounded and you're locked out of
  flight for a moment — landing is part of the rhythm.

## Controls

| Keyboard | Action |
| --- | --- |
| `←` `→` or `A` `D` | Change lanes |
| `↑` or `W` | Thruster hop |
| `↓` or `S` | **Track Mode** duck (fits under low-clearance gates) |
| `SPACE` | Toggle flight |
| `P` / `Esc` | Pause |
| `M` | Mute |
| `R` | Restart (from busted / pause) |

**Touch:** swipe left/right to change lanes, swipe up to hop, swipe down to duck,
double-tap or hit ⚡FLY to fly. On-screen buttons appear on touch devices.

## The road

- **Traffic** (parked, hazards blinking) — hop over, dodge, or fly.
- **Concrete barriers** — hop or dodge.
- **Trucks** — too tall to hop; change lanes or fly.
- **Low-clearance gates** — the only way through grounded is the Track-Mode duck.
- **Ramps** — hit them at speed for "SICK AIR!" bonus coins and a free launch.
- **Cargo drones** — they hover at flight altitude; weaving continues in the air.
- **Gauntlets** (late game) — trucks left and right, a ramp in the middle.

Every row is generated from hand-designed patterns that guarantee an escape route; a
headless test suite enforces that invariant (see *Verification*).

## Run it

```sh
npm install
npm run dev        # play at http://localhost:5173
```

Other scripts:

```sh
npm run build      # typecheck + production build (dist/)
npm run preview    # serve the production build
npm run smoke      # headless gameplay simulation + fairness checks (no browser needed)
```

## Tech

- **three.js** — rendering, with a camera-following shadow rig and a vertex-colored dusk
  sky dome (no post-processing; glows are additive quads/sprites so it stays fast).
- **Vite + TypeScript** — strict mode.
- **Web Audio API** — every sound is synthesized: engine (detuned saws + filtered noise
  wind), cold-gas "psst" bursts, distance-mapped siren stereo, coin/cell/crash one-shots,
  countdown beeps and a small 112 BPM synthwave sequencer (kick/snare/hats/bass/arp/pad).
- One particle pool per blend mode (CPU-updated `THREE.Points`, single draw call each).
- Procedural car models built from extruded profiles and primitives.

### Project layout

```
src/
  main.ts            bootstrap + WebGL failure fallback
  game.ts            state machine, camera, collisions, chase logic, scoring
  config.ts          all tuning numbers in one place
  input.ts           keyboard + swipe/tap + virtual touch buttons
  audio.ts           full synthesized audio engine + music sequencer
  hud.ts             DOM HUD: score, thrust gauge, heat bar, menus, countdown
  textures.ts        canvas-generated textures (road, gates, billboards, "POLICE")
  utils.ts           math, damping, AABB, typed emitter
  world/
    scene.ts         renderer, dusk sky, sun, stars, mesas, lighting
    road.ts          scrolling highway surface
    props.ts         poles, rocks, cacti, billboards, overpasses (ring-recycled)
    carModel.ts      procedural Roadster
    policeModel.ts   procedural police cruiser
    player.ts        lane/physics/flight/fuel state
    police.ts        pursuit heat + cruiser behavior
    obstacles.ts     obstacle pools + solvable row-pattern spawner
    pickups.ts       coins + energy cells
    particles.ts     particle pools (smoke, sparks, dust, wind streaks)
scripts/
  headless-check.ts  DOM-free gameplay verification
```

## Verification

- `npm run typecheck` — strict TypeScript, clean.
- `npm run smoke` — simulates 3 minutes of gameplay with a random agent (no browser) and asserts:
  - no NaN state, fuel bounded, player never below ground;
  - obstacle pool bounded, rows spawn ≥ 24 m apart;
  - **every spawned row has an escape route**;
  - gates respect difficulty gating and cooldowns; ramps launch; police distance stays in range.
- `npm run build` — production bundle builds clean.

The build and simulation pass locally; visual/feel tuning is subjective — play it and tweak
`src/config.ts` (speeds, fuel rates, chase pressures, camera, spawn distances).

## Roadmap ideas

- Day/night cycle and a space "Starman" segment between highway biomes.
- Helicopter pursuit at high heat; spike strips and police roadblocks.
- Garage: unlock skins (Ano White, Founders Red, chrome) with coins.
- Near-miss bonuses, combo multiplier, daily challenge seed.
- Mobile haptics on crash/busted; gamepad support.

---

*Fan-made project for fun. Not affiliated with, endorsed by, or sponsored by Tesla, SpaceX,
or Subway Surfers (SYBO). "Roadster" styling is a tribute, rendered from scratch.*
