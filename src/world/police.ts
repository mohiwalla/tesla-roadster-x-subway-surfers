import * as THREE from "three";
import { CFG } from "../config";
import { clamp, damp } from "../utils";
import { buildPoliceCar, type PoliceRig } from "./policeModel";

/**
 * The pursuit. The cruiser is only physically visible when it is close to the
 * camera frame (z roughly < +4.4), so "heat" maps directly onto how far it has
 * lunged beside the player: far = just a light glow at the screen edge with a
 * distant siren, high = filling the next lane over.
 */
export class Police {
  readonly root: THREE.Group;
  readonly rig: PoliceRig;
  /** Abstract chase distance used for the heat model + siren volume. */
  dist = CFG.copDistStart;
  x = -3;
  mode: "chase" | "busted" = "chase";

  private t = 0;
  private side = -1; // which adjacent lane the cruiser is hunting from
  private sideCooldown = 3;

  constructor(texture?: THREE.Texture) {
    this.rig = buildPoliceCar(texture);
    this.root = this.rig.root;
  }

  reset(): void {
    this.dist = CFG.copDistStart;
    this.x = -3;
    this.mode = "chase";
    this.t = rand0();
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.sideCooldown = 3;
  }

  /** heat: 0 (far) .. 1 (about to bust you). */
  update(dt: number, playerX: number, heat: number, speed: number): void {
    this.t += dt;
    this.sideCooldown -= dt;

    let targetX: number;
    let targetZ: number;
    let rate: number;

    if (this.mode === "busted") {
      // pull up alongside the stopped player
      targetX = playerX + 2.4;
      targetZ = 2.3;
      rate = 2.6;
    } else {
      if (this.sideCooldown <= 0) {
        // occasionally switch which side it is hunting from
        if (Math.random() < 0.5) this.side *= -1;
        this.sideCooldown = randRange(2.5, 6);
      }
      let tx = playerX + this.side * 3.0;
      if (tx > CFG.roadHalfW - 1.4 || tx < -CFG.roadHalfW + 1.4) {
        tx = playerX - this.side * 3.0;
      }
      targetX = tx;
      targetZ = 4.4 - heat * 2.9; // 4.4 (edge of frame) .. 1.5 (right beside you)
      rate = 2.0 + heat * 1.6;
    }

    this.x = damp(this.x, targetX, rate, dt);
    const z = this.mode === "busted" ? damp(this.root.position.z || targetZ, targetZ, 3, dt) : targetZ;
    this.root.position.set(this.x, 0, z);
    this.root.rotation.z = clamp((this.x - targetX) * 0.12 + 0.02 * Math.sin(this.t * 2.2), -0.14, 0.14);

    for (const w of this.rig.wheels) w.rotation.x -= (speed * (this.mode === "busted" ? 0.2 : 1.05) * dt) / this.rig.wheelRadius;

    // flashing light bar
    const speedMul = this.mode === "busted" ? 1.8 : 1;
    const blink = Math.sin(this.t * 9 * speedMul) > 0;
    this.rig.redMat.emissiveIntensity = 0.2 + (blink ? 4.6 : 0);
    this.rig.blueMat.emissiveIntensity = 0.2 + (blink ? 0 : 4.6);
    (this.rig.redGlow.material as THREE.MeshBasicMaterial).opacity = 0.06 + (blink ? 0.5 : 0);
    (this.rig.blueGlow.material as THREE.MeshBasicMaterial).opacity = 0.06 + (blink ? 0 : 0.5);
  }
}

const rand0 = () => Math.random() * 10;
const randRange = (a: number, b: number) => a + Math.random() * (b - a);
