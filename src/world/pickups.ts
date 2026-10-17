import * as THREE from "three";
import { CFG } from "../config";
import type { GameTextures } from "../textures";
import { rand } from "../utils";

interface Pickup {
  mesh: THREE.Mesh;
  glow: THREE.Sprite | null;
  active: boolean;
  x: number;
  y: number;
  z: number;
  baseY: number;
  phase: number;
}

const MAX_COINS = 150;
const MAX_CELLS = 10;

/** Coins and cyan energy cells ("+3s of thrust"). Move with the world scroll. */
export class Pickups {
  readonly group = new THREE.Group();
  private coins: Pickup[] = [];
  private cells: Pickup[] = [];
  private t = 0;

  private coinGeo = new THREE.TorusGeometry(0.42, 0.13, 10, 22);
  private coinMat: THREE.MeshStandardMaterial;
  private cellGeo = new THREE.CapsuleGeometry(0.16, 0.36, 4, 10);
  private cellMat: THREE.MeshStandardMaterial;

  constructor(textures: GameTextures) {
    this.coinMat = new THREE.MeshStandardMaterial({
      color: 0xffc94d,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x8a5a00,
      emissiveIntensity: 0.7,
    });
    this.cellMat = new THREE.MeshStandardMaterial({
      color: 0x0a2a33,
      metalness: 0.5,
      roughness: 0.3,
      emissive: 0x4de1ff,
      emissiveIntensity: 2.2,
    });
    for (let i = 0; i < MAX_COINS; i++) {
      this.coins.push(this.makePickup(this.coinGeo, this.coinMat, textures.soft, 0xffc94d, 1.5, 0.35));
    }
    for (let i = 0; i < MAX_CELLS; i++) {
      this.cells.push(this.makePickup(this.cellGeo, this.cellMat, textures.soft, 0x4de1ff, 1.9, 0.45));
    }
  }

  private makePickup(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    glowTex: THREE.Texture | undefined,
    glowColor: number,
    glowScale: number,
    glowOpacity: number,
  ): Pickup {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    this.group.add(mesh);
    let glow: THREE.Sprite | null = null;
    if (glowTex) {
      const gmat = new THREE.SpriteMaterial({
        map: glowTex,
        color: glowColor,
        transparent: true,
        opacity: glowOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      glow = new THREE.Sprite(gmat);
      glow.scale.setScalar(glowScale);
      glow.visible = false;
      mesh.add(glow);
    }
    return { mesh, glow, active: false, x: 0, y: 0.95, z: 0, baseY: 0.95, phase: rand(0, Math.PI * 2) };
  }

  private obtain(pool: Pickup[]): Pickup | null {
    for (const p of pool) {
      if (!p.active) {
        p.active = true;
        p.mesh.visible = true;
        if (p.glow) p.glow.visible = true;
        return p;
      }
    }
    return null;
  }

  spawnCoinLine(lane: number, z: number, count: number, y = 0.95, spacing = 2.4): void {
    const x = (lane - (CFG.lanes - 1) / 2) * CFG.laneW;
    for (let i = 0; i < count; i++) {
      const p = this.obtain(this.coins);
      if (!p) return;
      p.x = x;
      p.baseY = y;
      p.z = z - i * spacing;
      p.mesh.rotation.set(0, rand(0, Math.PI), 0);
      p.mesh.position.set(p.x, p.baseY, p.z);
    }
  }

  /** A parabola of coins over an obstacle — the reward for a ramp or a flight line. */
  spawnCoinArc(lane: number, z: number, count: number, baseY = 1.0, peak = 2.9): void {
    const x = (lane - (CFG.lanes - 1) / 2) * CFG.laneW;
    for (let i = 0; i < count; i++) {
      const p = this.obtain(this.coins);
      if (!p) return;
      const t = count === 1 ? 0.5 : i / (count - 1);
      p.x = x;
      p.baseY = baseY + (peak - baseY) * Math.sin(Math.PI * t);
      p.z = z - i * 2.3;
      p.mesh.position.set(p.x, p.baseY, p.z);
    }
  }

  /** Row of coins at flight altitude. */
  spawnFlightLine(lane: number, z: number, count: number): void {
    this.spawnCoinLine(lane, z, count, CFG.cruiseY - 0.15, 2.6);
  }

  spawnCell(lane: number, z: number, y = 1.0): void {
    const p = this.obtain(this.cells);
    if (!p) return;
    p.x = (lane - (CFG.lanes - 1) / 2) * CFG.laneW;
    p.baseY = y;
    p.z = z;
    p.mesh.position.set(p.x, p.baseY, p.z);
  }

  update(dt: number, scroll: number): void {
    this.t += dt;
    const dz = scroll * dt;
    for (const pool of [this.coins, this.cells]) {
      for (const p of pool) {
        if (!p.active) continue;
        p.z += dz;
        const bob = Math.sin(this.t * 2.4 + p.phase) * 0.08;
        p.mesh.position.set(p.x, p.baseY + bob, p.z);
        p.mesh.rotation.y += dt * 3.6;
        if (p.glow) {
          const s = p.glow.scale.x;
          p.glow.scale.setScalar(Math.max(0.01, s + Math.sin(this.t * 3 + p.phase) * 0.006));
        }
        if (p.z > 20) {
          p.active = false;
          p.mesh.visible = false;
          if (p.glow) p.glow.visible = false;
        }
      }
    }
  }

  /** Collect pickups near the player box. Returns counts gathered this frame. */
  collect(px: number, py0: number, py1: number): { coins: number; cells: number } {
    let coins = 0;
    let cells = 0;
    for (const p of this.coins) {
      if (!p.active) continue;
      if (Math.abs(p.x - px) < 1.3 && Math.abs(p.z) < 2.6 && p.mesh.position.y > py0 - 1.1 && p.mesh.position.y < py1 + 1.1) {
        p.active = false;
        p.mesh.visible = false;
        if (p.glow) p.glow.visible = false;
        coins++;
      }
    }
    for (const p of this.cells) {
      if (!p.active) continue;
      if (Math.abs(p.x - px) < 1.4 && Math.abs(p.z) < 2.8 && p.mesh.position.y > py0 - 1.2 && p.mesh.position.y < py1 + 1.2) {
        p.active = false;
        p.mesh.visible = false;
        if (p.glow) p.glow.visible = false;
        cells++;
      }
    }
    return { coins, cells };
  }

  clear(): void {
    for (const pool of [this.coins, this.cells]) {
      for (const p of pool) {
        p.active = false;
        p.mesh.visible = false;
        if (p.glow) p.glow.visible = false;
      }
    }
  }
}
