import * as THREE from "three";
import { CFG } from "../config";
import { Emitter, clamp, clamp01, damp } from "../utils";
import { buildRoadster, type RoadsterRig } from "./carModel";

export interface PlayerIntents {
  duck: boolean;
  hop: boolean;
  fly: boolean;
}

export interface PlayerEvents {
  hop: undefined;
  land: number; // impact speed
  takeoff: undefined;
  fuelEmpty: undefined;
}

export interface PlayerBounds {
  x: number;
  y0: number;
  y1: number;
  hx: number;
  hz: number;
}

/** The Roadster: lane tweening, thruster hops, Track-Mode duck and fuel-limited flight. */
export class Player {
  readonly group: THREE.Group;
  readonly rig: RoadsterRig;
  readonly events = new Emitter<PlayerEvents>();

  lane = 1;
  x = 0;
  y = 0;
  vy = 0;
  flying = false;
  fuel = CFG.fuelMax;
  duckAmt = 0;
  invuln = 0;
  lockT = 0;

  private t = 0;
  private bank = 0;
  private pitch = 0;
  private hopFlame = 0;

  constructor() {
    this.rig = buildRoadster();
    this.group = this.rig.root;
  }

  reset(): void {
    this.lane = 1;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.flying = false;
    this.fuel = CFG.fuelMax;
    this.duckAmt = 0;
    this.invuln = 0;
    this.lockT = 0;
    this.t = 0;
    this.bank = 0;
    this.pitch = 0;
    this.hopFlame = 0;
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.rig.body.position.set(0, 0, 0);
    this.rig.body.rotation.set(0, 0, 0);
    this.rig.body.visible = true;
    for (const f of this.rig.flames) f.visible = false;
  }

  get grounded(): boolean {
    return this.y <= 0.001 && !this.flying;
  }

  get ducked(): boolean {
    return this.duckAmt > 0.65 && this.y < 0.35 && !this.flying;
  }

  get fuel01(): number {
    return clamp01(this.fuel / CFG.fuelMax);
  }

  get airborne(): boolean {
    return !this.grounded;
  }

  laneX(lane: number): number {
    return (lane - (CFG.lanes - 1) / 2) * CFG.laneW;
  }

  setLane(lane: number): boolean {
    const next = clamp(lane, 0, CFG.lanes - 1);
    if (next === this.lane) return false;
    this.lane = next;
    return true;
  }

  /** Called by the game when a collision is registered. */
  setCrashed(): void {
    this.invuln = CFG.invulnTime;
    this.lockT = CFG.lockoutTime;
    if (this.flying) {
      this.flying = false;
      this.vy = -0.5;
    } else {
      this.vy = Math.max(this.vy, 2.4);
    }
  }

  update(dt: number, intents: PlayerIntents, speed: number): void {
    this.t += dt;
    if (this.lockT > 0) this.lockT -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    // lateral
    const targetX = this.laneX(this.lane);
    this.x = damp(this.x, targetX, 10.5, dt);

    // duck (Track Mode squat) — only meaningful on the ground
    const wantDuck = intents.duck && !this.flying && this.y < 0.3;
    this.duckAmt = damp(this.duckAmt, wantDuck ? 1 : 0, wantDuck ? CFG.duckInRate : CFG.duckOutRate, dt);

    // flight toggle
    if (intents.fly && this.lockT <= 0) {
      if (this.flying) {
        this.flying = false;
        this.vy = -1.2;
      } else if (this.fuel >= CFG.fuelMinTakeoff) {
        this.flying = true;
        this.events.emit("takeoff", undefined);
      }
    }
    if (this.flying && intents.duck) {
      // pull down to land early
      this.flying = false;
      this.vy = -1.2;
    }

    // vertical motion
    if (this.flying) {
      this.fuel -= dt;
      if (this.fuel <= 0) {
        this.fuel = 0;
        this.flying = false;
        this.vy = -1.0;
        this.events.emit("fuelEmpty", undefined);
      } else {
        const rate = this.y < 1 ? 5.5 : 3.2;
        const cruise = CFG.cruiseY + Math.sin(this.t * 1.7) * 0.08;
        const ny = damp(this.y, cruise, rate, dt);
        this.vy = (ny - this.y) / Math.max(dt, 1e-4);
        this.y = ny;
      }
    } else {
      const airborne = this.y > 0.001 || Math.abs(this.vy) > 0.001;
      if (airborne) {
        this.vy -= CFG.gravity * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          const impact = -this.vy;
          this.vy = 0;
          if (impact > 0.6) this.events.emit("land", impact);
        }
      }
      if (intents.hop && this.grounded && this.lockT <= 0 && this.duckAmt < 0.5) {
        this.vy = CFG.hopVy;
        this.hopFlame = 0.22;
        this.events.emit("hop", undefined);
      }
    }

    // thrusters off => the tanks refill
    if (!this.flying) this.fuel = Math.min(CFG.fuelMax, this.fuel + dt * CFG.fuelRefillRate);
    if (this.hopFlame > 0) this.hopFlame -= dt;

    this.applyVisuals(dt, speed);
    this.group.position.set(this.x, this.y, 0);
  }

  private applyVisuals(dt: number, speed: number): void {
    const rig = this.rig;
    rig.body.position.y = -CFG.duckDrop * this.duckAmt;

    const targetX = this.laneX(this.lane);
    const bankTarget = clamp((this.x - targetX) * 0.24, -0.3, 0.3);
    this.bank = damp(this.bank, bankTarget, 8, dt);
    const pitchTarget = this.flying ? 0.06 : clamp(this.vy * 0.014, -0.1, 0.17);
    this.pitch = damp(this.pitch, pitchTarget, 6, dt);
    rig.body.rotation.z = this.bank;
    rig.body.rotation.x = this.pitch;

    const spin = this.grounded ? speed : speed * 0.35;
    for (const w of rig.wheels) w.rotation.x -= (spin * dt) / rig.wheelRadius;

    const wingTarget = this.flying ? 0.34 : this.invuln > 0 ? -0.22 : 0.06 + clamp01(speed / 50) * 0.12;
    rig.wing.rotation.x = damp(rig.wing.rotation.x, wingTarget, 4, dt);

    const thrusting = this.flying || this.hopFlame > 0;
    for (let i = 0; i < rig.flames.length; i++) {
      const f = rig.flames[i];
      f.visible = thrusting;
      if (thrusting) {
        const pulse = 0.7 + 0.45 * Math.sin(this.t * 42 + i * 1.7) + (this.flying ? 0.3 : 0);
        f.scale.set(1, 1, Math.max(0.35, pulse));
      }
    }

    rig.body.visible = this.invuln <= 0 || Math.sin(this.t * 32) > -0.35;
  }

  get bounds(): PlayerBounds {
    const h = this.ducked ? CFG.carDuckedHeight : CFG.carHeight;
    return { x: this.x, y0: this.y, y1: this.y + h, hx: CFG.carHalfW * 0.92, hz: CFG.carHalfL * 0.92 };
  }
}
