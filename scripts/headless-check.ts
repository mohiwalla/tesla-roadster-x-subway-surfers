/**
 * Headless verification: runs core gameplay logic (no DOM, no WebGL) and
 * asserts the invariants the game relies on. Run with `npm run smoke`.
 */
import { CFG } from "../src/config";
import type { GameTextures } from "../src/textures";
import { ObstacleManager, chooseRowPlan, type RowInfo } from "../src/world/obstacles";
import { Player } from "../src/world/player";
import { Police } from "../src/world/police";

const texturesStub: GameTextures = { ads: [] };

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------------
console.log("row planner sweep");
{
  const plans = new Set<string>();
  let earlyGate = 0;
  let gateTooSoon = 0;
  for (let d = 0; d <= 1.0001; d += 0.05) {
    for (let i = 0; i < 500; i++) {
      const plan = chooseRowPlan(d, Math.random, i % 8);
      plans.add(plan);
      if (plan === "gate" && d <= 0.12) earlyGate++;
      if (plan === "gate" && i % 8 < 4) gateTooSoon++;
      if ((plan === "gauntlet" || plan === "drones") && d <= 0.3) {
        failures++;
        console.error(`  FAIL  ${plan} spawned at low difficulty ${d.toFixed(2)}`);
      }
    }
  }
  check("all plan kinds reachable", plans.size === 7, `saw ${[...plans].join(",")}`);
  check("no gates before diff 0.12", earlyGate === 0);
  check("gate respects rows-since-gate cooldown", gateTooSoon === 0);
}

// ---------------------------------------------------------------------------
console.log("180s simulated run with a random agent");
{
  const player = new Player();
  const obstacles = new ObstacleManager(texturesStub);
  const police = new Police();
  const rows: RowInfo[] = [];
  obstacles.onRow = (info) => rows.push(info);

  const dt = 1 / 60;
  let time = 0;
  let speed = CFG.speedStart;
  let crashFactor = 1;
  let crashes = 0;
  let ramps = 0;
  let outOfBounds = 0;
  let nanSeen = false;
  let maxActive = 0;

  for (let step = 0; step < 180 * 60; step++) {
    time += dt;
    const diff = Math.min(1, time / CFG.speedRampTime);
    let target = CFG.speedStart + (CFG.speedMax - CFG.speedStart) * (1 - Math.exp(-time / 70));
    if (player.flying) target *= CFG.flySpeedMul;
    crashFactor = Math.min(1, crashFactor + CFG.crashRecover * dt);
    target *= crashFactor;
    speed += (target - speed) * (1 - Math.exp(-2.2 * dt));

    const intents = {
      duck: Math.random() < 0.04,
      hop: Math.random() < 0.02,
      fly: Math.random() < 0.012 && player.fuel > 3 && player.lockT <= 0,
    };
    if (Math.random() < 0.02) {
      player.setLane(Math.max(0, Math.min(2, player.lane + (Math.random() < 0.5 ? -1 : 1))));
    }

    player.update(dt, intents, speed);
    obstacles.update(dt, speed, diff);

    // collisions (same rules as the game)
    const b = player.bounds;
    for (const obs of obstacles.active) {
      const overlapXZ = Math.abs(b.x - obs.x) < b.hx + obs.hx && Math.abs(obs.z) < b.hz + obs.hz;
      if (!overlapXZ) continue;
      if (obs.kind === "ramp") {
        if (!obs.consumed && b.y0 < 0.4) {
          obs.consumed = true;
          player.vy = 11.6;
          ramps++;
        }
        continue;
      }
      const overlapY = b.y0 < obs.y1 && b.y1 > obs.y0;
      if (overlapY && player.invuln <= 0) {
        if (obs.kind !== "gate" && b.y0 >= obs.y1 - 0.25 && player.vy <= 0.5) {
          player.y = obs.y1;
          player.vy = 2.6;
        } else {
          player.setCrashed();
          crashFactor = CFG.crashSpeedMul;
          police.dist = Math.max(CFG.copCrashFloor, police.dist - CFG.copCrashHit);
          crashes++;
        }
      }
    }

    // police heat model
    if (crashFactor < 0.92) police.dist -= dt * 7 * (1.25 - crashFactor);
    else if (player.flying) police.dist += dt * CFG.copFlyGain;
    else police.dist = police.dist + (CFG.copDistStart - police.dist) * (1 - Math.exp(-CFG.copBaselinePull * dt));
    police.dist = Math.max(CFG.copDistBusted - 0.2, Math.min(CFG.copDistMax, police.dist));
    const heat = Math.max(0, Math.min(1, (CFG.copDistMax - police.dist) / (CFG.copDistMax - CFG.copDistBusted)));
    police.update(dt, player.x, heat, speed);

    // invariants
    if (
      Number.isNaN(player.x) || Number.isNaN(player.y) || Number.isNaN(player.fuel) ||
      Number.isNaN(speed) || Number.isNaN(police.dist) || Number.isNaN(police.x)
    ) {
      nanSeen = true;
      break;
    }
    if (player.y < -0.0001 || player.fuel < -0.0001 || player.fuel > CFG.fuelMax + 0.0001) outOfBounds++;
    maxActive = Math.max(maxActive, obstacles.active.length);
  }

  check("no NaN state", !nanSeen);
  check("player stays above ground / fuel in range", outOfBounds === 0, `${outOfBounds} violations`);
  check("obstacle pool bounded", maxActive < 46, `peak ${maxActive} active`);
  check("crashes did happen in the random run", crashes > 0, `${crashes}`);
  check("ramps launch the player", ramps > 0, `${ramps} ramp hits`);
  check("police distance in bounds", police.dist >= CFG.copDistBusted - 0.21 && police.dist <= CFG.copDistMax + 0.001);

  // row fairness: every row must leave a way through
  let unfair = 0;
  let minGap = Infinity;
  let prevAt = -1;
  for (const r of rows) {
    const freeLane = [0, 1, 2].some((l) => !r.lanes.includes(l));
    const passable = freeLane || r.canDuck || r.rampLane >= 0 || r.droneLanes.length > 0 || r.plan === "drones";
    if (!passable) unfair++;
    if (prevAt > 0) minGap = Math.min(minGap, r.at - prevAt);
    prevAt = r.at;
  }
  check("every row has an escape route", unfair === 0, `${unfair} unfair rows of ${rows.length}`);
  check("rows never spawn closer than 24m apart", minGap >= 24, `min gap ${minGap.toFixed(1)}m`);
  check("rows were actually spawned", rows.length > 40, `${rows.length} rows in 3 minutes`);

  console.log(
    `  info  crashes=${crashes} ramps=${ramps} rows=${rows.length} peakObstacles=${maxActive} finalSpeed=${speed.toFixed(1)}m/s`,
  );
}

// ---------------------------------------------------------------------------
console.log("");
if (failures > 0) {
  throw new Error(`${failures} check(s) FAILED`);
}
console.log("all checks passed");
