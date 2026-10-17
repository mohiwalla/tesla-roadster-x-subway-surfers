import * as THREE from "three";

/** The scrolling highway. One texture tile spans 12 m of road. */
export class Road {
  static readonly TILE = 12;
  readonly mesh: THREE.Mesh;
  private tex: THREE.Texture;

  constructor(texture: THREE.Texture) {
    const tex = texture.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    const length = 660;
    tex.repeat.set(1, length / Road.TILE);

    const geo = new THREE.PlaneGeometry(18, length);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.93, metalness: 0.04 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(0, 0, 40 - length / 2);
    this.mesh.receiveShadow = true;
    this.tex = tex;
  }

  /** scroll: forward speed in m/s (the world flows toward the camera). */
  update(dt: number, scroll: number): void {
    this.tex.offset.y += (scroll * dt) / Road.TILE;
  }
}
