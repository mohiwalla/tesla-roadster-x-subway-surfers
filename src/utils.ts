import * as THREE from "three";

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const randInt = (a: number, b: number): number => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Framerate-independent exponential damping. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

/** Frame-rate independent approach used by THREE.MathUtils.damp, kept local for clarity. */
export const dampVec3: THREE.Vector3 = new THREE.Vector3(); // scratch, avoid churn
export const scratchV = new THREE.Vector3();
export const scratchV2 = new THREE.Vector3();

export interface AABB {
  x: number; // center x
  y0: number; // bottom
  y1: number; // top
  z?: number; // center z (defaults to 0)
  hx: number; // half extent x
  hz: number; // half extent z
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    Math.abs(a.x - b.x) < a.hx + b.hx &&
    a.y0 < b.y1 &&
    a.y1 > b.y0 &&
    Math.abs((a.z ?? 0) - (b.z ?? 0)) < a.hz + b.hz
  );
}

/** Small typed event emitter. */
export class Emitter<Events extends object> {
  private handlers: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const list = this.handlers[event];
    if (!list) return;
    for (const cb of list) cb(payload);
  }
}

export function formatScore(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

export function easeOutCubic(t: number): number {
  const c = 1 - Math.min(1, Math.max(0, t));
  return 1 - c * c * c;
}

export function easeInCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * c;
}

export function easeOutBack(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
}
