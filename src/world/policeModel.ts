import * as THREE from "three";

/** Procedural police cruiser. Forward is -Z. Ground contact at y = 0. */

export interface PoliceRig {
  root: THREE.Group;
  wheels: THREE.Group[];
  wheelRadius: number;
  redMat: THREE.MeshStandardMaterial;
  blueMat: THREE.MeshStandardMaterial;
  redGlow: THREE.Mesh;
  blueGlow: THREE.Mesh;
  headMat: THREE.MeshStandardMaterial;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function buildPoliceCar(policeTexture?: THREE.Texture): PoliceRig {
  const root = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x10141f, metalness: 0.55, roughness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x07080c, metalness: 0.4, roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a0d14, metalness: 0.9, roughness: 0.15 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 2.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x220408, emissive: 0xff1a2e, emissiveIntensity: 1.6 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0x330006, emissive: 0xff2030, emissiveIntensity: 0 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x000633, emissive: 0x2a5bff, emissiveIntensity: 0 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x8f939c, metalness: 0.9, roughness: 0.35 });

  // body + cabin
  box(1.95, 0.62, 4.6, 0, 0.62, 0, bodyMat, root);
  box(1.8, 0.5, 2.3, 0, 1.12, 0.25, bodyMat, root);
  // windshield band
  box(1.66, 0.4, 0.06, 0, 1.14, -0.93, glassMat, root);
  box(1.66, 0.36, 0.06, 0, 1.12, 1.42, glassMat, root);
  for (const sx of [-0.9, 0.9]) {
    box(0.05, 0.32, 1.9, sx, 1.14, 0.25, glassMat, root);
  }
  // white door panels
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e6e2, metalness: 0.3, roughness: 0.5 });
  for (const sx of [-0.985, 0.985]) {
    box(0.03, 0.5, 1.9, sx, 0.62, 0.35, whiteMat, root);
  }
  // push bar
  box(1.9, 0.5, 0.1, 0, 0.5, -2.4, darkMat, root);
  for (const bx of [-0.65, -0.22, 0.22, 0.65]) {
    box(0.07, 0.5, 0.1, bx, 0.5, -2.44, darkMat, root);
  }
  // side POLICE lettering
  if (policeTexture) {
    const mat = new THREE.MeshBasicMaterial({ map: policeTexture, transparent: true });
    for (const sx of [-0.99, 0.99]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), mat);
      p.position.set(sx, 0.72, 0.4);
      p.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      root.add(p);
    }
  }
  // lights
  box(0.6, 0.1, 0.06, -0.6, 0.62, -2.32, headMat, root);
  box(0.6, 0.1, 0.06, 0.6, 0.62, -2.32, headMat, root);
  box(1.7, 0.09, 0.06, 0, 0.72, 2.32, tailMat, root);

  // light bar
  box(1.2, 0.07, 0.34, 0, 1.41, 0.25, darkMat, root);
  box(0.52, 0.13, 0.28, -0.28, 1.51, 0.25, redMat, root);
  box(0.52, 0.13, 0.28, 0.28, 1.51, 0.25, blueMat, root);

  // glow quads above the bar
  const glowRedMat = new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowBlueMat = new THREE.MeshBasicMaterial({ color: 0x3f6dff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const redGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.85), glowRedMat);
  redGlow.position.set(-0.28, 1.72, 0.25);
  const blueGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.85), glowBlueMat);
  blueGlow.position.set(0.28, 1.72, 0.25);
  root.add(redGlow, blueGlow);

  // wheels
  const wheels: THREE.Group[] = [];
  const wheelR = 0.36;
  for (const [wx, wz] of [
    [-0.88, -1.5],
    [0.88, -1.5],
    [-0.88, 1.55],
    [0.88, 1.55],
  ]) {
    const wg = new THREE.Group();
    wg.position.set(wx, wheelR, wz);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.28, 18), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wg.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.29, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    wg.add(rim);
    root.add(wg);
    wheels.push(wg);
  }

  return { root, wheels, wheelRadius: wheelR, redMat, blueMat, redGlow, blueGlow, headMat };
}
