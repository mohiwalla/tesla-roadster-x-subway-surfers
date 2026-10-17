import * as THREE from "three";
import { CFG } from "../config";
import type { GameTextures } from "../textures";
import { lerp, rand, randInt } from "../utils";

export type ObstacleKind = "barrier" | "traffic" | "truck" | "gate" | "ramp" | "drone";
export type RowPlan = "single" | "double" | "gate" | "ramp" | "traffic2" | "drones" | "gauntlet";

export interface Obstacle {
  kind: ObstacleKind;
  root: THREE.Group;
  active: boolean;
  x: number;
  z: number;
  y0: number;
  y1: number;
  baseY: number;
  localY0: number;
  localY1: number;
  hx: number;
  hz: number;
  halfY: number;
  consumed: boolean;
  phase: number;
  rotors: THREE.Object3D[];
}

export interface RowInfo {
  plan: RowPlan;
  z: number;
  /** Absolute spawn distance marker, used to verify row spacing. */
  at: number;
  lanes: number[]; // lanes blocked at ground level
  rampLane: number; // -1 when absent
  droneLanes: number[];
  canDuck: boolean;
  canJump: boolean; // every ground blocker is low enough to clear with a thruster hop
}

/**
 * Chooses a row pattern. Pure function (unit-testable): every returned plan
 * guarantees at least one escape route (free lane, duck-under, ramp, or flight).
 */
export function chooseRowPlan(diff: number, rng: () => number, rowsSinceGate: number): RowPlan {
  if (diff > 0.12 && rowsSinceGate >= 4 && rng() < 0.1 + diff * 0.16) return "gate";
  if (diff > 0.5 && rng() < 0.12) return "gauntlet";
  if (diff > 0.33 && rng() < 0.13) return "drones";
  if (diff > 0.12 && rng() < 0.26) return "double";
  if (rng() < 0.18) return "ramp";
  if (diff > 0.2 && rng() < 0.28) return "traffic2";
  return "single";
}

export class ObstacleManager {
  readonly group = new THREE.Group();
  readonly active: Obstacle[] = [];
  /** Row summaries, exposed for the headless fairness check. */
  readonly debugRows: RowInfo[] = [];
  onRow: ((info: RowInfo) => void) | null = null;

  private pools = new Map<ObstacleKind, Obstacle[]>();
  private travelled = 0;
  private nextRowAt = 100;
  private rowsSinceGate = 10;
  private lastSingleLane = -1;
  private prevPlan: RowPlan | null = null;
  private t = 0;

  private hazardMat: THREE.MeshStandardMaterial;
  private gateLightMat: THREE.MeshStandardMaterial;
  private barrierMat: THREE.MeshStandardMaterial;
  private trafficMats: THREE.MeshStandardMaterial[];
  private truckMats: THREE.MeshStandardMaterial[];
  private tireMat: THREE.MeshStandardMaterial;
  private concreteMat: THREE.MeshStandardMaterial;
  private rampMat: THREE.MeshStandardMaterial;
  private droneMat: THREE.MeshStandardMaterial;
  private droneRotorMat: THREE.MeshBasicMaterial;
  private beaconMat: THREE.MeshStandardMaterial;

  constructor(private textures: GameTextures) {
    this.hazardMat = new THREE.MeshStandardMaterial({ color: 0x2a1a05, emissive: 0xff9020, emissiveIntensity: 0.2 });
    this.gateLightMat = new THREE.MeshStandardMaterial({ color: 0x2a1a05, emissive: 0xffb347, emissiveIntensity: 1.2 });
    this.barrierMat = textures.barrier
      ? new THREE.MeshStandardMaterial({ map: textures.barrier, roughness: 0.85 })
      : new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.85 });
    this.trafficMats = [0x6b3b2c, 0x4a4f38, 0x2c3a56, 0x6a6d75].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.55 }),
    );
    this.truckMats = [0x3a4250, 0x4d3b2a].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.7 }),
    );
    this.tireMat = new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 0.95 });
    this.concreteMat = new THREE.MeshStandardMaterial({ color: 0x241b30, roughness: 0.95 });
    this.rampMat = new THREE.MeshStandardMaterial({ color: 0x262030, metalness: 0.3, roughness: 0.6 });
    this.droneMat = new THREE.MeshStandardMaterial({ color: 0x22242c, metalness: 0.6, roughness: 0.45 });
    this.droneRotorMat = new THREE.MeshBasicMaterial({ color: 0x11131a, transparent: true, opacity: 0.55 });
    this.beaconMat = new THREE.MeshStandardMaterial({ color: 0x220408, emissive: 0xff2030, emissiveIntensity: 2.2 });
  }

  // ------------------------------------------------------------------- build
  private build(kind: ObstacleKind): Obstacle {
    const g = new THREE.Group();
    const obs: Obstacle = {
      kind,
      root: g,
      active: false,
      x: 0,
      z: 0,
      y0: 0,
      y1: 0,
      baseY: 0,
      localY0: 0,
      localY1: 1,
      hx: 1,
      hz: 1,
      halfY: 1,
      consumed: false,
      phase: rand(0, Math.PI * 2),
      rotors: [],
    };

    if (kind === "barrier") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.5), this.barrierMat);
      body.position.y = 0.52;
      body.castShadow = true;
      g.add(body);
      for (const rz of [-0.26, 0.26]) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), this.hazardMat);
        light.position.set(-0.9, 0.86, rz);
        g.add(light);
        const light2 = light.clone();
        light2.position.x = 0.9;
        g.add(light2);
      }
      obs.hx = 1.22;
      obs.localY1 = 1.15;
      obs.hz = 0.32;
    } else if (kind === "traffic") {
      const bodyMat = this.trafficMats[randInt(0, this.trafficMats.length - 1)];
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.1), bodyMat);
      body.position.y = 0.62;
      body.castShadow = true;
      g.add(body);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.54, 2.0),
        new THREE.MeshStandardMaterial({ color: 0x0a0d14, metalness: 0.85, roughness: 0.2 }),
      );
      cabin.position.set(0, 1.16, 0.25);
      cabin.castShadow = true;
      g.add(cabin);
      for (const [wx, wz] of [
        [-0.85, -1.35],
        [0.85, -1.35],
        [-0.85, 1.35],
        [0.85, 1.35],
      ]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 12), this.tireMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.3, wz);
        g.add(w);
      }
      for (const [hx, hz] of [
        [-0.86, -2.06],
        [0.86, -2.06],
        [-0.86, 2.06],
        [0.86, 2.06],
      ]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), this.hazardMat);
        h.position.set(hx, 0.64, hz);
        g.add(h);
      }
      obs.hx = 0.98;
      obs.localY1 = 1.44;
      obs.hz = 2.1;
    } else if (kind === "truck") {
      const bodyMat = this.truckMats[randInt(0, this.truckMats.length - 1)];
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 2.2), bodyMat);
      cab.position.set(0, 1.35, -2.4);
      cab.castShadow = true;
      g.add(cab);
      const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.2, 6.4), bodyMat.clone());
      (trailer.material as THREE.MeshStandardMaterial).color.offsetHSL(0, -0.05, 0.06);
      trailer.position.set(0, 1.45, 1.2);
      trailer.castShadow = true;
      g.add(trailer);
      for (const [wx, wz] of [
        [-1.0, -2.4],
        [1.0, -2.4],
        [-1.0, 0.6],
        [1.0, 0.6],
        [-1.0, 2.6],
        [1.0, 2.6],
      ]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), this.tireMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.42, wz);
        g.add(w);
      }
      const haz = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.06), this.hazardMat);
      haz.position.set(0, 1.1, 4.42);
      g.add(haz);
      obs.hx = 1.2;
      obs.localY1 = 2.56;
      obs.hz = 3.55;
    } else if (kind === "gate") {
      for (const px of [-4.9, 4.9]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.6, 0.26), this.concreteMat);
        post.position.set(px, 1.8, 0);
        post.castShadow = true;
        g.add(post);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), this.gateLightMat);
        lamp.position.set(px, 2.35, 0);
        g.add(lamp);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.36, 0.32), this.concreteMat);
      beam.position.y = 3.34;
      beam.castShadow = true;
      g.add(beam);
      const panelMat = this.textures.gate
        ? new THREE.MeshStandardMaterial({ map: this.textures.gate, side: THREE.DoubleSide, roughness: 0.8 })
        : new THREE.MeshStandardMaterial({ color: 0xffb347, side: THREE.DoubleSide });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(9.7, 1.05), panelMat);
      panel.position.y = 1.56;
      g.add(panel);
      obs.hx = 4.85;
      obs.localY0 = 1.03;
      obs.localY1 = 2.09;
      obs.hz = 0.2;
    } else if (kind === "ramp") {
      const shape = new THREE.Shape();
      shape.moveTo(2.3, 0);
      shape.lineTo(-2.3, 0.95);
      shape.lineTo(-2.3, 0);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.6, bevelEnabled: false });
      geo.translate(0, 0, -1.3);
      const wedge = new THREE.Mesh(geo, this.rampMat);
      wedge.rotation.y = -Math.PI / 2;
      wedge.castShadow = true;
      wedge.receiveShadow = true;
      g.add(wedge);
      // glowing lip at the launch edge
      const lip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.12), this.gateLightMat);
      lip.position.set(0, 0.95, -2.24);
      g.add(lip);
      obs.hx = 1.32;
      obs.localY1 = 0.98;
      obs.hz = 2.35;
    } else {
      // drone
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), this.droneMat);
      core.castShadow = true;
      g.add(core);
      const armGeo = new THREE.BoxGeometry(0.85, 0.04, 0.07);
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Mesh(armGeo, this.droneMat);
        arm.rotation.y = (i * Math.PI) / 2 + Math.PI / 4;
        g.add(arm);
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 12), this.droneRotorMat);
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        rotor.position.set(Math.cos(a) * 0.52, 0.06, Math.sin(a) * 0.52);
        g.add(rotor);
        obs.rotors.push(rotor);
      }
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this.beaconMat);
      beacon.position.y = 0.18;
      g.add(beacon);
      obs.hx = 0.8;
      obs.halfY = 0.45;
      obs.hz = 0.8;
    }
    return obs;
  }

  private obtain(kind: ObstacleKind): Obstacle {
    const pool = this.pools.get(kind);
    const reused = pool?.pop();
    const obs = reused ?? this.build(kind);
    obs.active = true;
    obs.consumed = false;
    obs.root.visible = true;
    this.group.add(obs.root);
    this.active.push(obs);
    return obs;
  }

  private spawn(kind: ObstacleKind, lane: number, z: number, y?: number): Obstacle {
    const obs = this.obtain(kind);
    obs.x = (lane - (CFG.lanes - 1) / 2) * CFG.laneW;
    obs.z = z;
    obs.baseY = y ?? 0;
    if (kind === "drone") {
      obs.y0 = obs.baseY - obs.halfY;
      obs.y1 = obs.baseY + obs.halfY;
    } else {
      obs.y0 = obs.baseY + obs.localY0;
      obs.y1 = obs.baseY + obs.localY1;
    }
    obs.root.position.set(obs.x, obs.baseY, obs.z);
    return obs;
  }

  // ----------------------------------------------------------------- spawning
  private spawnRow(diff: number): void {
    const plan = chooseRowPlan(diff, Math.random, this.rowsSinceGate);
    const z = -(this.nextRowAt - this.travelled);
    const info: RowInfo = { plan, z, at: this.nextRowAt, lanes: [], rampLane: -1, droneLanes: [], canDuck: plan === "gate", canJump: true };

    if (plan === "single") {
      let lane = randInt(0, 2);
      if (lane === this.lastSingleLane && Math.random() < 0.7) lane = (lane + 1 + randInt(0, 1)) % 3;
      this.lastSingleLane = lane;
      const roll = Math.random();
      const kind: ObstacleKind = roll < 0.55 ? "barrier" : roll < 0.9 ? "traffic" : "truck";
      if (kind !== "barrier") info.canJump = false;
      this.spawn(kind, lane, z);
      info.lanes.push(lane);
    } else if (plan === "double") {
      const a = randInt(0, 2);
      const b = (a + 1 + randInt(0, 1)) % 3;
      const kinds: ObstacleKind[] = Math.random() < 0.5 ? ["barrier", "traffic"] : ["barrier", "truck"];
      for (const [i, lane] of [a, b].entries()) {
        this.spawn(kinds[i], lane, z + (i === 1 ? -rand(4, 8) : 0));
        info.lanes.push(lane);
        if (kinds[i] !== "barrier") info.canJump = false;
      }
    } else if (plan === "gate") {
      this.spawn("gate", 1, z);
      info.lanes.push(0, 1, 2);
      info.canJump = false;
    } else if (plan === "ramp") {
      const lane = randInt(0, 2);
      this.spawn("ramp", lane, z);
      info.rampLane = lane;
    } else if (plan === "traffic2") {
      const a = randInt(0, 2);
      const b = (a + 1 + randInt(0, 1)) % 3;
      this.spawn("traffic", a, z);
      this.spawn("traffic", b, z - rand(5, 9));
      info.lanes.push(a, b);
      info.canJump = false;
    } else if (plan === "drones") {
      const lanes = Math.random() < 0.5 ? [randInt(0, 2)] : [0, 2];
      for (const lane of lanes) {
        this.spawn("drone", lane, z - rand(0, 6), rand(3.3, 4.4));
        info.droneLanes.push(lane);
      }
    } else {
      // gauntlet: trucks left + right, launching ramp in the middle
      this.spawn("truck", 0, z);
      this.spawn("truck", 2, z);
      this.spawn("ramp", 1, z + 4);
      info.lanes.push(0, 2);
      info.rampLane = 1;
      info.canJump = false;
    }

    this.rowsSinceGate = plan === "gate" ? 0 : this.rowsSinceGate + 1;
    this.prevPlan = plan;
    this.debugRows.push(info);
    if (this.debugRows.length > 240) this.debugRows.shift();
    this.onRow?.(info);

    let gap = lerp(CFG.rowGapStart, CFG.rowGapEnd, diff) * rand(0.92, 1.14);
    if (this.prevPlan === "ramp" || plan === "ramp") gap *= 1.12; // give players time to land
    this.nextRowAt += gap;
  }

  // ------------------------------------------------------------------ update
  update(dt: number, scroll: number, diff: number): void {
    this.t += dt;
    this.travelled += scroll * dt;

    let ahead = this.nextRowAt - this.travelled;
    while (ahead < CFG.spawnAhead && ahead > 20) {
      this.spawnRow(diff);
      const next = this.nextRowAt - this.travelled;
      if (next <= ahead) break; // safety against runaway spawning
      ahead = next;
    }

    const dz = scroll * dt;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const obs = this.active[i];
      obs.root.position.z += dz;
      obs.z = obs.root.position.z;
      if (obs.kind === "drone") {
        const bob = Math.sin(this.t * 1.4 + obs.phase) * 0.22;
        obs.root.position.y = obs.baseY + bob;
        obs.y0 = obs.baseY + bob - obs.halfY;
        obs.y1 = obs.baseY + bob + obs.halfY;
        for (const r of obs.rotors) r.rotation.y += dt * 30;
      }
      if (obs.z > 26) this.release(obs, i);
    }

    // shared blinkers
    const pulse = Math.sin(this.t * 6) > 0 ? 1.6 : 0.15;
    this.hazardMat.emissiveIntensity = pulse;
    this.gateLightMat.emissiveIntensity = Math.sin(this.t * 4) > 0 ? 2.0 : 0.6;
  }

  private release(obs: Obstacle, index: number): void {
    this.active.splice(index, 1);
    obs.active = false;
    obs.root.visible = false;
    this.group.remove(obs.root);
    const pool = this.pools.get(obs.kind) ?? [];
    pool.push(obs);
    this.pools.set(obs.kind, pool);
  }

  clear(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.release(this.active[i], i);
    this.travelled = 0;
    this.nextRowAt = 100;
    this.rowsSinceGate = 10;
    this.lastSingleLane = -1;
    this.prevPlan = null;
    this.debugRows.length = 0;
  }
}
