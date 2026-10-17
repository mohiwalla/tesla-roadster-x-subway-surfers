import * as THREE from "three";
import type { GameTextures } from "../textures";
import { rand } from "../utils";

interface Ring {
  items: THREE.Object3D[];
  loop: number;
}

/** Roadside decor: poles, rocks, cacti, billboards and overpasses. Ring-buffer recycled. */
export class Props {
  readonly group = new THREE.Group();
  private rings: Ring[] = [];

  constructor(textures: GameTextures) {
    this.buildPoles();
    this.buildRocks(-1);
    this.buildRocks(1);
    this.buildCacti();
    this.buildBillboards(textures);
    this.buildOverpasses();
  }

  private addRing(items: THREE.Object3D[], loop: number): void {
    for (const it of items) this.group.add(it);
    this.rings.push({ items, loop });
  }

  private buildPoles(): void {
    const items: THREE.Object3D[] = [];
    const spacing = 42;
    const count = 14;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a2f46, roughness: 0.9 });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x2c2336, roughness: 0.9 });
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 7.4, 8), poleMat);
      pole.position.y = 3.7;
      pole.castShadow = true;
      g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.0), armMat);
      arm.position.set(0, 6.9, -0.7);
      g.add(arm);
      const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), armMat);
      arm2.position.set(0, 6.55, -0.4);
      g.add(arm2);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.66, 0.42), armMat);
      box.position.set(0, 5.4, 0);
      g.add(box);
      g.position.set(10.6, 0, 40 - i * spacing);
      items.push(g);
    }
    this.addRing(items, spacing * count);
  }

  private buildRocks(side: number): void {
    const items: THREE.Object3D[] = [];
    const spacing = 36;
    const count = 20;
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0x322543, flatShading: true, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x3c2b4e, flatShading: true, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x2a1f3a, flatShading: true, roughness: 1 }),
    ];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.IcosahedronGeometry(rand(0.6, 2.6), 0);
      const rock = new THREE.Mesh(geo, mats[i % mats.length]);
      rock.scale.set(rand(0.8, 1.6), rand(0.45, 1.0), rand(0.8, 1.6));
      rock.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
      rock.position.set(side * rand(11.5, 36), 0.1, 40 - i * spacing);
      rock.castShadow = true;
      items.push(rock);
    }
    this.addRing(items, spacing * count);
  }

  private buildCacti(): void {
    const items: THREE.Object3D[] = [];
    const spacing = 150;
    const count = 8;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1e3d2b, roughness: 1 });
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const side = i % 2 === 0 ? 1 : -1;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.6, 8), trunkMat);
      trunk.position.y = 1.3;
      trunk.castShadow = true;
      g.add(trunk);
      const armMat = trunkMat;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.0, 8), armMat);
      arm.rotation.z = Math.PI / 2.2;
      arm.position.set(-0.55, 1.6, 0);
      g.add(arm);
      const armUp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), armMat);
      armUp.position.set(-0.95, 2.0, 0);
      g.add(armUp);
      const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.8, 8), armMat);
      arm2.rotation.z = -Math.PI / 2.4;
      arm2.position.set(0.5, 1.9, 0);
      g.add(arm2);
      g.position.set(side * rand(13, 24), 0, 40 - i * spacing);
      items.push(g);
    }
    this.addRing(items, spacing * count);
  }

  private buildBillboards(textures: GameTextures): void {
    if (!textures.ads.length) return;
    const items: THREE.Object3D[] = [];
    const spacing = 150;
    const count = 5;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2c2336, roughness: 0.9 });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x17101f, roughness: 0.9 });
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const side = i % 2 === 0 ? 1 : -1;
      for (const px of [-1.9, 1.9]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.4, 0.18), postMat);
        post.position.set(px, 2.7, 0);
        post.castShadow = true;
        g.add(post);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(8.2, 4.3, 0.22), backMat);
      back.position.set(0, 6.6, -0.13);
      back.castShadow = true;
      g.add(back);
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 4.1),
        new THREE.MeshBasicMaterial({ map: textures.ads[i % textures.ads.length], fog: true }),
      );
      panel.position.set(0, 6.6, 0);
      g.add(panel);
      g.position.set(side * 12.5, 0, 40 - i * spacing);
      g.rotation.y = side > 0 ? -Math.PI / 2 + 0.34 : Math.PI / 2 - 0.34;
      items.push(g);
    }
    this.addRing(items, spacing * count);
  }

  private buildOverpasses(): void {
    const items: THREE.Object3D[] = [];
    const spacing = 290;
    const count = 3;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x241b30, roughness: 0.95 });
    const amber = new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffb347, emissiveIntensity: 1.6 });
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.BoxGeometry(26, 2.0, 1.8), concrete);
      beam.position.set(0, 7.2, 0);
      beam.castShadow = true;
      g.add(beam);
      for (const px of [-11.4, 11.4]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7.4, 1.6), concrete);
        pillar.position.set(px, 3.7, 0);
        pillar.castShadow = true;
        g.add(pillar);
      }
      for (const lx of [-4, 0, 4]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), amber);
        lamp.position.set(lx, 6.1, -0.8);
        g.add(lamp);
      }
      g.position.set(0, 0, 40 - i * spacing - 80);
      items.push(g);
    }
    this.addRing(items, spacing * count);
  }

  update(dt: number, scroll: number): void {
    const dz = scroll * dt;
    for (const ring of this.rings) {
      for (const item of ring.items) {
        item.position.z += dz;
        if (item.position.z > 60) item.position.z -= ring.loop;
      }
    }
  }
}
