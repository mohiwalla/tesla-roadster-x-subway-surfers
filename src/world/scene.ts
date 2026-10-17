import * as THREE from "three";
import { CFG } from "../config";
import type { GameTextures } from "../textures";
import { rand } from "../utils";

export interface WorldScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sunLight: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  sky: THREE.Group;
}

const smooth01 = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function buildSky(textures: GameTextures, sunDir: THREE.Vector3): THREE.Group {
  const sky = new THREE.Group();
  const R = 950;

  // gradient dome via vertex colors (tone-mapped correctly, unlike a raw ShaderMaterial)
  const geo = new THREE.SphereGeometry(R, 48, 32);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color(0x140b33);
  const pink = new THREE.Color(0xd8547e);
  const orange = new THREE.Color(0xff8a4d);
  const groundDark = new THREE.Color(0x2a1638);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / R;
    if (y < 0) {
      c.copy(groundDark).lerp(orange, smooth01(-0.35, -0.01, y));
    } else {
      c.copy(orange).lerp(pink, smooth01(0.0, 0.09, y));
      c.lerp(zenith, Math.pow(smooth01(0.08, 0.55, y), 0.85));
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  sky.add(dome);

  // sun: soft core + wide halo, using the shared soft particle texture
  if (textures.soft) {
    const mk = (color: number, scale: number, opacity: number) => {
      const m = new THREE.SpriteMaterial({
        map: textures.soft,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const s = new THREE.Sprite(m);
      s.scale.setScalar(scale);
      return s;
    };
    const halo = mk(0xff7a3c, 380, 0.42);
    const mid = mk(0xffa95e, 170, 0.5);
    const core = mk(0xffe9c0, 62, 0.95);
    const p = sunDir.clone().multiplyScalar(R * 0.94);
    halo.position.copy(p);
    mid.position.copy(p);
    core.position.copy(p);
    halo.renderOrder = -9;
    mid.renderOrder = -8;
    core.renderOrder = -7;
    sky.add(halo, mid, core);
  }

  // stars, fading in toward the top of the dome
  const starCount = 700;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = rand(0.18, 1); // y component
    const r = Math.sqrt(1 - v * v);
    starPos[i * 3] = Math.cos(u) * r * R * 0.98;
    starPos[i * 3 + 1] = v * R * 0.98;
    starPos[i * 3 + 2] = Math.sin(u) * r * R * 0.98;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xaab4ff,
      size: 1.9,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      fog: false,
    }),
  );
  stars.renderOrder = -6;
  sky.add(stars);

  return sky;
}

function buildMesas(sunDir: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const sunXZ = new THREE.Vector2(sunDir.x, sunDir.z).multiplyScalar(900);
  const colors = [0x1c1230, 0x241638, 0x1a0f2a, 0x281a3e];
  let placed = 0;
  let guard = 0;
  while (placed < 14 && guard++ < 100) {
    const x = rand(-430, 430);
    const z = rand(-560, -390);
    if (sunXZ.distanceTo(new THREE.Vector2(x, z)) < 190) continue; // keep the sun window clear
    const h = rand(20, 58);
    const useBox = Math.random() < 0.35;
    const mat = new THREE.MeshStandardMaterial({ color: colors[placed % colors.length], flatShading: true, roughness: 1 });
    const mesh = useBox
      ? new THREE.Mesh(new THREE.BoxGeometry(rand(30, 70), h, rand(30, 70)), mat)
      : new THREE.Mesh(new THREE.CylinderGeometry(rand(6, 16), rand(13, 26), h, 6), mat);
    mesh.position.set(x, h / 2 - 2.5, z);
    group.add(mesh);
    placed++;
  }
  return group;
}

export function createWorldScene(container: HTMLElement, textures: GameTextures): WorldScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.domElement.className = "webgl";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x55274f, 75, 470);

  const camera = new THREE.PerspectiveCamera(
    CFG.fovBase,
    (container.clientWidth || 1280) / (container.clientHeight || 720),
    0.1,
    1600,
  );
  camera.position.set(0, CFG.camUp, CFG.camBack);

  const sunDir = new THREE.Vector3(-0.55, 0.2, -0.81).normalize();

  const sky = buildSky(textures, sunDir);
  sky.frustumCulled = false;
  scene.add(sky);
  scene.add(buildMesas(sunDir));

  // desert floor
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 2000),
    new THREE.MeshStandardMaterial({ color: 0x251a31, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.03, -400);
  ground.receiveShadow = true;
  scene.add(ground);

  // lighting: low synthwave sun, warm hemisphere, cool fill
  const hemi = new THREE.HemisphereLight(0x8a6fd8, 0x2a1a3a, 0.55);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight(0xffb066, 2.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -26;
  sunLight.shadow.camera.right = 26;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -12;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 220;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const fill = new THREE.DirectionalLight(0x5f7dff, 0.55);
  fill.position.set(60, 40, 90);
  scene.add(fill);

  return { renderer, scene, camera, sunLight, sunDir, sky };
}
