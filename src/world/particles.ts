import * as THREE from "three";
import type { GameTextures } from "../textures";
import { rand } from "../utils";

const VERT = `
attribute float psize;
attribute float alpha;
attribute vec3 pcolor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = alpha;
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * (300.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  float a = t.a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
}`;

/** One-draw-call CPU particle pool rendered as THREE.Points. */
export class PointsPool {
  readonly points: THREE.Points;
  /** World scroll advection (m/s) so particles are carried with the road illusion. */
  worldSpeed = 0;

  private cap: number;
  private cursor = 0;
  private life: Float32Array;
  private maxLife: Float32Array;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private a0: Float32Array;
  private a1: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;

  private posAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;

  private gravity: number;
  private drag: number;

  constructor(capacity: number, texture: THREE.Texture | undefined, blending: THREE.Blending, gravity: number, drag: number) {
    this.cap = capacity;
    this.gravity = gravity;
    this.drag = drag;

    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.a0 = new Float32Array(capacity);
    this.a1 = new Float32Array(capacity);
    this.c0 = new Float32Array(capacity * 3);
    this.c1 = new Float32Array(capacity * 3);

    const positions = new Float32Array(capacity * 3);
    for (let i = 0; i < capacity; i++) positions[i * 3 + 1] = -999;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(capacity), 3);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("psize", this.sizeAttr);
    geo.setAttribute("alpha", this.alphaAttr);
    geo.setAttribute("pcolor", this.colorAttr);

    let map = texture;
    if (!map) {
      map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
      map.needsUpdate = true;
    }

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size0: number,
    size1: number,
    start: THREE.Color,
    end: THREE.Color,
    alpha0: number,
    alpha1: number,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = size0;
    this.s1[i] = size1;
    this.a0[i] = alpha0;
    this.a1[i] = alpha1;
    this.c0[i * 3] = start.r;
    this.c0[i * 3 + 1] = start.g;
    this.c0[i * 3 + 2] = start.b;
    this.c1[i * 3] = end.r;
    this.c1[i * 3 + 1] = end.g;
    this.c1[i * 3 + 2] = end.b;
  }

  update(dt: number): void {
    const posArr = this.posAttr.array as Float32Array;
    const sizeArr = this.sizeAttr.array as Float32Array;
    const alphaArr = this.alphaAttr.array as Float32Array;
    const colorArr = this.colorAttr.array as Float32Array;
    const adv = this.worldSpeed * dt;
    const dragMul = Math.max(0, 1 - this.drag * dt);

    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        alphaArr[i] = 0;
        sizeArr[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        alphaArr[i] = 0;
        sizeArr[i] = 0;
        continue;
      }
      this.vx[i] *= dragMul;
      this.vy[i] *= dragMul;
      this.vz[i] *= dragMul;
      this.vy[i] -= this.gravity * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt + adv;

      const t = 1 - this.life[i] / this.maxLife[i];
      posArr[i * 3] = this.px[i];
      posArr[i * 3 + 1] = this.py[i];
      posArr[i * 3 + 2] = this.pz[i];
      sizeArr[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      alphaArr[i] = this.a0[i] + (this.a1[i] - this.a0[i]) * t;
      colorArr[i * 3] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      colorArr[i * 3 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      colorArr[i * 3 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
    }

    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    const alphaArr = this.alphaAttr.array as Float32Array;
    alphaArr.fill(0);
    this.alphaAttr.needsUpdate = true;
  }
}

const WHITE = new THREE.Color(0.92, 0.95, 1.0);
const GRAY = new THREE.Color(0.42, 0.44, 0.52);
const DUST = new THREE.Color(0.5, 0.4, 0.38);
const DUST_END = new THREE.Color(0.22, 0.17, 0.2);
const SPARK = new THREE.Color(1.0, 0.85, 0.5);
const SPARK_END = new THREE.Color(0.7, 0.15, 0.05);
const STREAK = new THREE.Color(0.7, 0.9, 1.0);
const STREAK_END = new THREE.Color(0.3, 0.5, 0.8);

/** Facade over the pools with gameplay-flavoured emitters. */
export class ParticleSystem {
  private smoke: PointsPool;
  private spark: PointsPool;

  constructor(scene: THREE.Scene, textures: GameTextures) {
    this.smoke = new PointsPool(460, textures.soft, THREE.NormalBlending, -0.9, 1.2); // light stuff rises
    this.spark = new PointsPool(300, textures.soft, THREE.AdditiveBlending, 13, 0.7);
    scene.add(this.smoke.points, this.spark.points);
  }

  setWorldSpeed(s: number): void {
    this.smoke.worldSpeed = s;
    this.spark.worldSpeed = s;
  }

  update(dt: number): void {
    this.smoke.update(dt);
    this.spark.update(dt);
  }

  thruster(x: number, y: number, z: number, count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      this.smoke.spawn(
        x + rand(-0.24, 0.24),
        y + rand(-0.12, 0.12),
        z + rand(0, 0.4),
        rand(-0.7, 0.7),
        rand(0.2, 1.4),
        rand(0.5, 2.4) * power,
        rand(0.55, 1.05),
        0.42,
        rand(1.6, 2.6),
        WHITE,
        GRAY,
        0.5,
        0,
      );
    }
  }

  dust(x: number, z: number, strength: number): void {
    const n = Math.min(4, Math.ceil(strength * 2));
    for (let i = 0; i < n; i++) {
      this.smoke.spawn(
        x + rand(-0.7, 0.7) * 1.2,
        rand(0.05, 0.3),
        z + rand(0.5, 2.4),
        rand(-1.2, 1.2),
        rand(0.4, 1.5),
        rand(1, 3),
        rand(0.4, 0.8),
        0.3,
        rand(0.9, 1.6),
        DUST,
        DUST_END,
        0.34,
        0,
      );
    }
  }

  landing(x: number, z: number, strength: number): void {
    const n = Math.min(20, 4 + Math.ceil(strength * 1.6));
    for (let i = 0; i < n; i++) {
      this.smoke.spawn(
        x + rand(-1.0, 1.0),
        rand(0.02, 0.2),
        z + rand(-1.4, 1.4),
        rand(-2.4, 2.4),
        rand(0.6, 2.8),
        rand(-1.5, 2.5),
        rand(0.4, 0.9),
        0.4,
        rand(1.4, 2.4),
        DUST,
        DUST_END,
        0.4,
        0,
      );
    }
  }

  sparks(x: number, y: number, z: number, count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      this.spark.spawn(
        x + rand(-0.6, 0.6),
        y + rand(0, 0.7),
        z + rand(-0.6, 0.9),
        rand(-4, 4) * power,
        rand(0.5, 4.5) * power,
        rand(-3, 3) * power,
        rand(0.25, 0.55),
        0.14,
        0.02,
        SPARK,
        SPARK_END,
        1,
        0,
      );
    }
  }

  windStreak(): void {
    this.spark.spawn(
      rand(-7, 7),
      rand(0.4, 6.5),
      rand(-30, -6),
      rand(-0.3, 0.3),
      rand(-0.3, 0.3),
      rand(24, 42),
      0.32,
      0.075,
      0.02,
      STREAK,
      STREAK_END,
      0.32,
      0,
    );
  }
}
