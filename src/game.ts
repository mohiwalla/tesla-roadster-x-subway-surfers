import * as THREE from "three";
import { AudioEngine } from "./audio";
import { CFG, STORAGE_BEST, STORAGE_MUTED } from "./config";
import { HUD } from "./hud";
import { Input, type Action } from "./input";
import { createTextures, type GameTextures } from "./textures";
import { aabbOverlap, clamp, clamp01, damp, lerp, pick, rand } from "./utils";
import { ObstacleManager, type Obstacle, type RowInfo } from "./world/obstacles";
import { ParticleSystem } from "./world/particles";
import { Pickups } from "./world/pickups";
import { Player } from "./world/player";
import { Police } from "./world/police";
import { Props } from "./world/props";
import { Road } from "./world/road";
import { createWorldScene, type WorldScene } from "./world/scene";

type GameState = "menu" | "countdown" | "running" | "paused" | "busted";

export class Game {
  private textures: GameTextures;
  private world: WorldScene;
  private road: Road;
  private props: Props;
  private obstacles: ObstacleManager;
  private pickups: Pickups;
  private particles: ParticleSystem;
  private player: Player;
  private police: Police;
  private audio = new AudioEngine();
  private input: Input;
  private hud: HUD;
  private clock = new THREE.Clock();

  private state: GameState = "menu";
  private score = 0;
  private coins = 0;
  private best = 0;
  private muted = false;

  private time = 0;
  private speed = CFG.speedStart;
  private crashFactor = 1;
  private boostT = 0;
  private shake = 0;
  private slowmoT = 0;
  private fovCurrent = CFG.fovBase;
  private heatWasHigh = false;

  private menuT = 0;
  private countdownT = 0;
  private countdownStep = -1;
  private goT = 0;
  private bustedT = 0;
  private bustedShown = false;
  private dustAcc = 0;
  private streakAcc = 0;

  private lookTarget = new THREE.Vector3(0, 1.15, -7);
  private sunOffset = new THREE.Vector3();

  constructor(private container: HTMLElement) {
    this.textures = createTextures();
    this.world = createWorldScene(container, this.textures);
    const scene = this.world.scene;

    this.road = new Road(this.textures.road!);
    scene.add(this.road.mesh);
    this.props = new Props(this.textures);
    scene.add(this.props.group);

    this.obstacles = new ObstacleManager(this.textures);
    scene.add(this.obstacles.group);
    this.pickups = new Pickups(this.textures);
    scene.add(this.pickups.group);
    this.particles = new ParticleSystem(scene, this.textures);

    this.player = new Player();
    scene.add(this.player.group);
    this.police = new Police(this.textures.police);
    scene.add(this.police.root);
    this.police.root.visible = false;

    this.input = new Input(container);

    // persistence
    try {
      this.best = Number.parseInt(localStorage.getItem(STORAGE_BEST) ?? "0", 10) || 0;
      this.muted = localStorage.getItem(STORAGE_MUTED) === "1";
    } catch {
      /* private mode */
    }

    this.hud = new HUD(container, {
      onStart: () => this.startRun(),
      onRestart: () => this.startRun(),
      onResume: () => this.resume(),
      onPause: () => this.pause(),
      onMute: () => this.toggleMute(),
      onTouch: (action, down) => this.input.setVirtual(action, down),
    });
    this.hud.setMuted(this.muted);

    this.wireEvents();
    this.setupCameraAndResize();
    this.hud.showMenu(this.best);
    this.hud.showHud(false);

    // Browsers only allow audio to start inside a user gesture; keep trying on
    // every gesture until the context is running.
    const unlockAudio = () => {
      void this.audio.resume();
    };
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio, { passive: true });

    window.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "running") this.pause();
    });
  }

  private wireEvents(): void {
    this.player.events.on("hop", () => {
      this.audio.hop();
      this.particles.thruster(this.player.x, this.player.y + 0.35, 2.4, 9, 1.3);
    });
    this.player.events.on("land", (impact) => {
      this.audio.land(impact > 7);
      this.particles.landing(this.player.x + rand(-0.5, 0.5), rand(-0.4, 0.6), impact * 0.24);
    });
    this.player.events.on("takeoff", () => {
      this.audio.takeoff();
      this.particles.thruster(this.player.x, this.player.y + 0.4, 2.5, 20, 1.8);
    });
    this.player.events.on("fuelEmpty", () => {
      this.audio.psst(0.6);
      this.hud.event("TANKS EMPTY — REFILLING", "amber");
    });

    this.obstacles.onRow = (info) => this.onRowSpawned(info);
  }

  private onRowSpawned(info: RowInfo): void {
    const freeLanes = [0, 1, 2].filter((l) => !info.lanes.includes(l));
    const r = Math.random();
    if (info.plan === "ramp") {
      this.pickups.spawnCoinArc(info.rampLane, info.z - 3.5, 6, 1.1, 3.0);
    } else if (info.plan === "gate") {
      this.pickups.spawnCoinLine(1, info.z - 6, 4, 0.55, 2.2); // low line to reward the duck
    } else if (info.plan === "drones") {
      if (freeLanes.length) this.pickups.spawnCoinLine(pick(freeLanes), info.z - 2, 5, 0.95, 2.3);
    } else if (info.plan === "gauntlet") {
      this.pickups.spawnCoinArc(1, info.z + 1.5, 7, 1.2, 3.4);
    } else if (freeLanes.length && r < 0.5) {
      this.pickups.spawnCoinLine(pick(freeLanes), info.z - 2, 4 + Math.floor(Math.random() * 3), 0.95, 2.4);
    }
    if (info.plan === "drones" && Math.random() < 0.3 && freeLanes.length) {
      this.pickups.spawnFlightLine(pick(freeLanes), info.z - 12, 4);
    }
    if (Math.random() < 0.17) {
      const lane = info.lanes.length === 3 ? 1 : pick([0, 1, 2]);
      const y = Math.random() < 0.3 ? CFG.cruiseY - 0.2 : 0.95;
      this.pickups.spawnCell(lane, info.z - rand(9, 16), y);
    }
  }

  private setupCameraAndResize(): void {
    const resize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.world.renderer.setSize(w, h);
      this.world.camera.aspect = w / h;
      this.world.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(resize).observe(this.container);
    }
    resize();
  }

  // ------------------------------------------------------------------- state
  start(): void {
    this.clock.start();
    requestAnimationFrame(this.tick);
  }

  private startRun(): void {
    void this.audio.init();
    this.audio.setMuted(this.muted);
    this.input.clearEdges();
    this.hud.hideAllOverlays();
    this.hud.showHud(true);
    this.hud.hideCountdown();

    this.score = 0;
    this.coins = 0;
    this.time = 0;
    this.speed = CFG.speedStart;
    this.crashFactor = 1;
    this.boostT = 0;
    this.heatWasHigh = false;
    this.bustedT = 0;
    this.bustedShown = false;
    this.dustAcc = 0;
    this.streakAcc = 0;
    this.player.reset();
    this.police.reset();
    this.police.root.visible = true;
    this.obstacles.clear();
    this.pickups.clear();
    this.audio.stopMusic();
    this.audio.sirenOff();

    this.state = "countdown";
    this.countdownT = 0;
    this.countdownStep = -1;
    this.goT = 0;
  }

  private pause(): void {
    if (this.state !== "running") return;
    this.state = "paused";
    this.hud.showPause();
    this.audio.setMusicDuck(true);
    this.audio.setEngine(this.speed / CFG.speedMax, false, false);
    this.audio.setThruster(false, 0);
    this.audio.setSiren(this.police.dist, 0, CFG.sirenFar);
    this.world.renderer.render(this.world.scene, this.world.camera); // keep last frame fresh
  }

  private resume(): void {
    if (this.state !== "paused") return;
    this.state = "running";
    this.hud.hidePause();
    this.audio.setMusicDuck(false);
    this.input.clearEdges();
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    this.hud.setMuted(this.muted);
    try {
      localStorage.setItem(STORAGE_MUTED, this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  private goBusted(): void {
    if (this.state === "busted") return;
    this.state = "busted";
    this.bustedT = 0;
    this.bustedShown = false;
    this.police.mode = "busted";
    this.shake = 0.5;
    this.audio.stopMusic();
    this.audio.setThruster(false, 0);
    this.audio.busted();
    this.hud.event("BUSTED!", "red big");
    this.hud.flashRed(0.7, 500);
  }

  // --------------------------------------------------------------------- loop
  private tick = (): void => {
    requestAnimationFrame(this.tick);
    const raw = Math.min(this.clock.getDelta(), 0.05);

    // slow-motion drama after a crash
    let dt = raw;
    if (this.slowmoT > 0) {
      this.slowmoT -= raw;
      dt = raw * 0.35;
    }

    if (this.input.consume("mute")) this.toggleMute();
    if (this.state === "running" && this.input.consume("pause")) this.pause();
    else if (this.state === "paused" && this.input.consume("pause")) this.resume();
    if (this.state === "busted" && (this.input.consume("restart") || this.input.consume("start"))) {
      this.startRun();
      return;
    }
    if (this.state === "paused" && this.input.consume("restart")) this.startRun();

    switch (this.state) {
      case "menu":
        this.menuUpdate(raw);
        break;
      case "countdown":
        this.countdownUpdate(dt);
        break;
      case "running":
        this.runUpdate(dt);
        break;
      case "busted":
        this.bustedUpdate(dt);
        break;
      case "paused":
        break;
    }

    this.updateCamera(raw);
    this.world.renderer.render(this.world.scene, this.world.camera);
    this.hud.update({
      score: Math.floor(this.score),
      coins: this.coins,
      best: this.best,
      speedMph: this.speed * 2.23694,
      fuel01: this.player.fuel01,
      fuelSecs: this.player.fuel,
      thrustActive: this.player.flying,
      heat: this.heat(),
    });
  };

  private heat(): number {
    return clamp01((CFG.copDistMax - this.police.dist) / (CFG.copDistMax - CFG.copDistBusted));
  }

  private menuUpdate(dt: number): void {
    this.menuT += dt;
    this.player.update(dt, { duck: false, hop: false, fly: false }, 0);
    this.props.update(dt, 6); // slow drift so the world feels alive
    this.road.update(dt, 6);

    if (this.input.consumeAny(["start", "fly", "hop"])) {
      this.startRun();
      return;
    }
    if (this.input.consume("restart")) this.startRun();
  }

  private countdownUpdate(dt: number): void {
    this.countdownT += dt;
    this.player.update(dt, { duck: false, hop: false, fly: false }, 0);
    const step = Math.floor(this.countdownT / 0.8);
    if (step !== this.countdownStep && step <= 3) {
      this.countdownStep = step;
      if (step < 3) {
        this.hud.showCountdown(String(3 - step), "num");
        this.audio.countdownBeep(false);
      } else {
        this.hud.showCountdown("GO", "go");
        this.audio.countdownBeep(true);
        this.audio.startMusic();
        this.state = "running";
        this.goT = 0.7;
        this.input.clearEdges();
      }
    }
    this.police.update(dt, 0, 0.15, 20);
    this.audio.setEngine(0.15, false, false);
  }

  private runUpdate(dt: number): void {
    this.time += dt;
    const diff = clamp01(this.time / CFG.speedRampTime);

    // ---- speed ----
    let target = lerp(CFG.speedStart, CFG.speedMax, 1 - Math.exp(-this.time / 70));
    if (this.player.flying) target *= CFG.flySpeedMul;
    if (this.boostT > 0) {
      target *= 1.12;
      this.boostT -= dt;
    }
    this.crashFactor = Math.min(1, this.crashFactor + CFG.crashRecover * dt);
    target *= this.crashFactor;
    this.speed = damp(this.speed, target, 2.2, dt);

    // ---- input / player ----
    if (this.input.consume("left") && this.player.setLane(this.player.lane - 1)) this.audio.laneSwitch();
    if (this.input.consume("right") && this.player.setLane(this.player.lane + 1)) this.audio.laneSwitch();
    const intents = {
      duck: this.input.held("duck"),
      hop: this.input.consume("hop"),
      fly: this.input.consume("fly"),
    };
    this.player.update(dt, intents, this.speed);

    // ---- world ----
    this.road.update(dt, this.speed);
    this.props.update(dt, this.speed);
    this.obstacles.update(dt, this.speed, diff);
    this.pickups.update(dt, this.speed);

    // ---- particles ----
    this.particles.setWorldSpeed(this.speed);
    if (this.player.flying) {
      const n = Math.min(6, Math.ceil(dt * 130));
      const py = this.player.y + 0.46;
      this.particles.thruster(this.player.x - 0.5, py, 2.5, Math.max(1, Math.floor(n / 2)), 1.2);
      this.particles.thruster(this.player.x + 0.5, py, 2.5, Math.max(1, Math.floor(n / 2)), 1.2);
      this.streakAcc += dt * 40;
      while (this.streakAcc >= 1) {
        this.streakAcc -= 1;
        this.particles.windStreak();
      }
    } else if (this.player.grounded && this.speed > 16) {
      this.dustAcc += dt * (2 + this.speed * 0.14);
      while (this.dustAcc >= 1) {
        this.dustAcc -= 1;
        this.particles.dust(this.player.x + rand(-0.85, 0.85), 1.6, 1);
      }
    }
    this.particles.update(dt);

    // ---- pickups ----
    const b = this.player.bounds;
    const got = this.pickups.collect(b.x, b.y0, b.y1);
    if (got.coins > 0) {
      this.coins += got.coins;
      this.score += got.coins * CFG.coinScore;
      this.audio.coin();
      this.particles.sparks(this.player.x, this.player.y + 0.8, -1.5, 6, 0.5);
    }
    if (got.cells > 0) {
      this.player.fuel = Math.min(CFG.fuelMax, this.player.fuel + CFG.cellFuel);
      this.score += CFG.cellScore;
      this.audio.cell();
      this.hud.event("+" + CFG.cellFuel + "s THRUST", "cyan");
    }

    // ---- collisions ----
    this.checkCollisions();

    // ---- police chase ----
    if (this.crashFactor < 0.92) {
      this.police.dist -= dt * 7 * (1.25 - this.crashFactor);
    } else if (this.player.flying) {
      this.police.dist += dt * CFG.copFlyGain;
    } else {
      this.police.dist = damp(this.police.dist, CFG.copDistStart, CFG.copBaselinePull, dt);
    }
    this.police.dist = clamp(this.police.dist, CFG.copDistBusted - 0.2, CFG.copDistMax);
    const heat = this.heat();
    this.police.update(dt, this.player.x, heat, this.speed);
    this.audio.setSiren(this.police.dist, clamp(this.police.x / 9, -1, 1), CFG.sirenFar);

    if (heat > 0.75) this.heatWasHigh = true;
    if (heat < 0.3 && this.heatWasHigh) {
      this.heatWasHigh = false;
      this.score += 50;
      this.hud.event("LOST 'EM! +50", "cyan");
      this.audio.coin();
    }
    if (this.police.dist <= CFG.copDistBusted) {
      this.goBusted();
      return;
    }

    // ---- engine audio / score / shake ----
    this.audio.setEngine(this.speed / CFG.speedMax, this.player.flying, true);
    this.audio.setThruster(this.player.flying, 1);
    this.score += this.speed * dt * CFG.scorePerMeter;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.6);

    if (this.goT > 0) {
      this.goT -= dt;
      if (this.goT <= 0) this.hud.hideCountdown();
    }
  }

  private checkCollisions(): void {
    const b = this.player.bounds;
    for (const obs of this.obstacles.active) {
      const overlapXZ =
        Math.abs(b.x - obs.x) < b.hx + obs.hx && Math.abs(0 - obs.z) < b.hz + obs.hz;
      if (!overlapXZ) continue;

      if (obs.kind === "ramp") {
        if (!obs.consumed && b.y0 < 0.4) {
          obs.consumed = true;
          this.player.vy = 11.6;
          this.player.y = Math.max(this.player.y, 0.15);
          this.boostT = Math.max(this.boostT, 0.9);
          this.score += 25;
          this.hud.event("SICK AIR! +25", "cyan");
          this.audio.psst(0.7);
          this.audio.hop();
          this.particles.thruster(this.player.x, this.player.y + 0.4, 2.5, 12, 1.5);
        }
        continue;
      }

      if (!aabbOverlap(b, obs)) continue;
      if (this.player.invuln > 0) continue;

      // Landing on a roof: forgiving bounce instead of a crash.
      if (obs.kind !== "gate" && b.y0 >= obs.y1 - 0.25 && this.player.vy <= 0.5) {
        this.player.y = obs.y1;
        this.player.vy = 2.6;
        this.audio.land(true);
        this.particles.sparks(this.player.x, obs.y1, -1.5, 8, 0.7);
        continue;
      }
      this.crash(obs);
      return; // one crash per frame
    }
  }

  private crash(obs: Obstacle): void {
    this.crashFactor = CFG.crashSpeedMul;
    this.player.setCrashed();
    this.audio.crash();
    this.particles.sparks(this.player.x + rand(-0.5, 0.5), this.player.y + 0.6, -2.0, 26, 1.3);
    this.particles.thruster(this.player.x, this.player.y + 0.4, 1.5, 10, 0.8);
    this.shake = 0.7;
    this.slowmoT = 0.35;
    this.hud.event("CRASH!", "red");
    this.hud.flashRed(0.45, 280);
    this.police.dist = Math.max(CFG.copCrashFloor, this.police.dist - CFG.copCrashHit);
    void obs;
  }

  private bustedUpdate(dt: number): void {
    this.bustedT += dt;
    this.speed = damp(this.speed, 0, 1.4, dt);
    this.player.update(dt, { duck: false, hop: false, fly: false }, this.speed);
    this.police.update(dt, this.player.x, 1, this.speed);
    this.road.update(dt, this.speed);
    this.props.update(dt, this.speed);
    this.obstacles.update(dt, this.speed, 1);
    this.pickups.update(dt, this.speed);
    this.particles.setWorldSpeed(this.speed);
    this.particles.update(dt);

    this.audio.setSiren(2.2, 0, CFG.sirenFar);
    this.audio.setEngine(0, false, false);
    this.audio.setThruster(false, 0);

    if (!this.bustedShown && this.bustedT > 1.7) {
      this.bustedShown = true;
      const isNew = Math.floor(this.score) > this.best;
      if (isNew) {
        this.best = Math.floor(this.score);
        try {
          localStorage.setItem(STORAGE_BEST, String(this.best));
        } catch {
          /* ignore */
        }
        this.audio.newBest();
      }
      this.hud.showBusted(this.score, this.best, isNew);
    }
  }

  // ------------------------------------------------------------------- camera
  private updateCamera(dt: number): void {
    const cam = this.world.camera;
    const player = this.player;
    let fovTarget = CFG.fovBase;

    if (this.state === "menu") {
      const a = this.menuT * 0.22;
      const px = Math.sin(a) * 8.6;
      const pz = Math.cos(a) * 8.6;
      cam.position.x = px;
      cam.position.y = 3.0 + Math.sin(this.menuT * 0.5) * 0.25;
      cam.position.z = pz;
      this.lookTarget.set(0, 0.78, 0);
      cam.lookAt(this.lookTarget);
    } else if (this.state === "busted") {
      const heatShake = this.shake > 0 ? this.shake * 0.2 : 0;
      const tx = player.x + 5.4 + rand(-heatShake, heatShake);
      const ty = 3.1 + rand(-heatShake, heatShake);
      const tz = 6.2;
      cam.position.x = damp(cam.position.x, tx, 2.2, dt);
      cam.position.y = damp(cam.position.y, ty, 2.2, dt);
      cam.position.z = damp(cam.position.z, tz, 2.2, dt);
      this.lookTarget.set(player.x + 1.1, 0.85, 1.4);
      cam.lookAt(this.lookTarget);
    } else {
      const heat = this.heat();
      const sh = this.shake * this.shake;
      const tx = player.x * 0.58 + rand(-0.12, 0.12) * sh;
      const ty = CFG.camUp + player.y * 0.36 + rand(-0.1, 0.1) * sh;
      const tz = CFG.camBack + (heat > 0.55 ? (heat - 0.55) * 2.4 : 0) + rand(-0.1, 0.1) * sh;
      cam.position.x = damp(cam.position.x, tx, 5.5, dt);
      cam.position.y = damp(cam.position.y, ty, 5.5, dt);
      cam.position.z = damp(cam.position.z, tz, 5.5, dt);
      const lx = player.x * 0.5;
      this.lookTarget.x = damp(this.lookTarget.x, lx, 6, dt);
      this.lookTarget.y = damp(this.lookTarget.y, player.y * 0.45 + 1.15, 6, dt);
      this.lookTarget.z = -7;
      cam.lookAt(this.lookTarget);

      fovTarget = CFG.fovBase + (this.speed - CFG.speedStart) * CFG.fovSpeed + (player.flying ? CFG.fovFlyBonus : 0);
    }

    this.fovCurrent = damp(this.fovCurrent, fovTarget, 3, dt);
    if (Math.abs(cam.fov - this.fovCurrent) > 0.01) {
      cam.fov = this.fovCurrent;
      cam.updateProjectionMatrix();
    }

    // sky + sun follow the camera / player
    this.world.sky.position.set(cam.position.x, 0, cam.position.z);
    this.sunOffset.copy(this.world.sunDir).multiplyScalar(90);
    this.world.sunLight.position.set(player.x + this.sunOffset.x, this.sunOffset.y, this.sunOffset.z);
    this.world.sunLight.target.position.set(player.x * 0.5, 0, -2);
    this.world.sunLight.target.updateMatrixWorld();
  }
}

export type { Action };
