import * as THREE from "three";

/**
 * Procedurally built next-gen Roadster: low wedge body, gold-tinted canopy,
 * full-width light bars, active rear wing and four cold-gas nozzles.
 * Forward is -Z. Ground contact at y = 0.
 */

export interface RoadsterRig {
  root: THREE.Group; // physics root: position = (x, y, 0)
  body: THREE.Group; // visual body: gets squat / bank / pitch
  wheels: THREE.Group[]; // spin around local X
  wheelRadius: number;
  wing: THREE.Group;
  flames: THREE.Mesh[];
  tailMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshPhysicalMaterial;
}

function profileShape(): THREE.Shape {
  const s = new THREE.Shape();
  // nose -> hood -> windshield -> roof -> tail -> underside (clockwise)
  s.moveTo(-2.3, 0.14);
  s.lineTo(-2.32, 0.34);
  s.quadraticCurveTo(-1.7, 0.44, -1.1, 0.54);
  s.quadraticCurveTo(-0.7, 0.62, -0.34, 0.8);
  s.lineTo(0.16, 1.14);
  s.lineTo(0.86, 1.16);
  s.quadraticCurveTo(1.35, 1.04, 1.62, 0.9);
  s.lineTo(2.26, 0.86);
  s.lineTo(2.32, 0.52);
  s.lineTo(2.32, 0.22);
  s.lineTo(-2.3, 0.14);
  return s;
}

function glassShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0.83);
  s.lineTo(0.17, 1.13);
  s.lineTo(0.84, 1.15);
  s.lineTo(1.38, 0.92);
  s.lineTo(1.38, 1.0);
  s.lineTo(0.87, 1.08);
  s.lineTo(0.2, 1.06);
  s.lineTo(-0.28, 0.9);
  s.closePath();
  return s;
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  parent: THREE.Object3D,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function buildRoadster(): RoadsterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f1ea, // "Ano White"
    metalness: 0.35,
    roughness: 0.3,
    clearcoat: 0.75,
    clearcoatRoughness: 0.22,
  });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x0d0d12, metalness: 0.5, roughness: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8b34e, // gold-tinted, spacesuit-visor style
    metalness: 0.9,
    roughness: 0.16,
  });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 3.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x220408, emissive: 0xff1a2e, emissiveIntensity: 2.6 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x2c2c33, metalness: 0.9, roughness: 0.35 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc4, metalness: 0.95, roughness: 0.3 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.95 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd23c1e, metalness: 0.4, roughness: 0.5 });

  // ---- main body shell ----
  const bodyGeo = new THREE.ExtrudeGeometry(profileShape(), {
    depth: 1.86,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.045,
    bevelSegments: 2,
  });
  bodyGeo.translate(0, 0, -0.93);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.rotation.y = -Math.PI / 2;
  bodyMesh.castShadow = true;
  body.add(bodyMesh);

  // ---- glass canopy band ----
  const glassGeo = new THREE.ExtrudeGeometry(glassShape(), {
    depth: 1.6,
    bevelEnabled: false,
  });
  glassGeo.translate(0, 0, -0.8);
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.rotation.y = -Math.PI / 2;
  glassMesh.castShadow = false;
  body.add(glassMesh);

  // ---- underbody / trim ----
  box(1.78, 0.1, 4.42, 0, 0.09, 0, carbonMat, body); // undertray
  box(1.86, 0.055, 0.55, 0, 0.11, -2.16, carbonMat, body); // front splitter
  box(1.86, 0.26, 0.5, 0, 0.24, 2.2, carbonMat, body); // rear diffuser
  for (const fx of [-0.55, 0, 0.55]) {
    box(0.03, 0.24, 0.46, fx, 0.24, 2.22, carbonMat, body); // diffuser fins
  }
  box(0.08, 0.1, 2.5, -0.94, 0.16, 0, carbonMat, body); // side skirts
  box(0.08, 0.1, 2.5, 0.94, 0.16, 0, carbonMat, body);
  for (const mx of [-0.99, 0.99]) {
    box(0.13, 0.055, 0.09, mx, 0.84, -0.3, carbonMat, body); // mirror blades
    box(0.05, 0.05, 0.14, mx * 0.94, 0.82, -0.26, carbonMat, body);
  }

  // ---- light bars ----
  const head = box(1.5, 0.055, 0.05, 0, 0.5, -2.33, headMat, body);
  box(1.62, 0.05, 0.05, 0, 0.88, 2.34, tailMat, body);

  // fake glow quads behind the bars (cheap bloom, no post-processing)
  const glowWhite = new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowRed = new THREE.MeshBasicMaterial({ color: 0xff2a3c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const gq1 = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.3), glowWhite);
  gq1.position.set(0, 0.5, -2.36);
  body.add(gq1);
  const gq2 = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.34), glowRed);
  gq2.position.set(0, 0.88, 2.37);
  body.add(gq2);
  for (const m of [gq1, gq2]) m.renderOrder = 5;

  // ---- active rear wing ----
  const wing = new THREE.Group();
  wing.position.set(0, 0.9, 2.02);
  box(0.05, 0.34, 0.1, -0.52, 0.16, 0.1, carbonMat, wing);
  box(0.05, 0.34, 0.1, 0.52, 0.16, 0.1, carbonMat, wing);
  const blade = box(1.72, 0.035, 0.36, 0, 0.34, 0.12, carbonMat, wing);
  blade.rotation.x = -0.08;
  body.add(wing);

  // ---- thruster nozzles + flames ----
  const flames: THREE.Mesh[] = [];
  const flameGeo = new THREE.ConeGeometry(0.085, 0.75, 10, 1, true);
  flameGeo.rotateX(-Math.PI / 2); // point +Z (backwards)
  flameGeo.translate(0, 0, 0.42);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xbfe9ff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const nx of [-0.72, -0.34, 0.34, 0.72]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.16, 10), nozzleMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(nx, 0.46, 2.3);
    nozzle.castShadow = true;
    body.add(nozzle);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(nx, 0.46, 2.32);
    flame.visible = false;
    body.add(flame);
    flames.push(flame);
  }

  // ---- wheels ----
  const wheels: THREE.Group[] = [];
  const wheelR = 0.34;
  for (const [wx, wz] of [
    [-0.82, -1.44],
    [0.82, -1.44],
    [-0.82, 1.5],
    [0.82, 1.5],
  ]) {
    const wg = new THREE.Group();
    wg.position.set(wx, wheelR, wz);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.27, 20), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wg.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.28, 14), rimMat);
    rim.rotation.z = Math.PI / 2;
    wg.add(rim);
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.12), caliperMat);
    caliper.position.set(wx > 0 ? -0.12 : 0.12, 0, 0);
    wg.add(caliper);
    root.add(wg);
    wheels.push(wg);
  }

  // headlight + taillight anchor for game code
  head.visible = true;

  return { root, body, wheels, wheelRadius: wheelR, wing, flames, tailMat, headMat, bodyMat };
}
