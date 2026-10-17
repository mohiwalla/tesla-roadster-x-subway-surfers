import * as THREE from "three";

/** Canvas-generated textures — the game ships with zero external assets. */

export interface GameTextures {
  soft?: THREE.Texture; // radial soft dot (particles, glows)
  road?: THREE.Texture;
  gate?: THREE.Texture;
  barrier?: THREE.Texture;
  police?: THREE.Texture;
  ads: THREE.Texture[];
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function softCircle(size = 128): THREE.Texture {
  return canvasTexture(size, size, (ctx) => {
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(0.75, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

function roadTexture(): THREE.Texture {
  // Tile spans 18 m wide x 12 m long.
  const W = 512;
  const H = 1024;
  const pxPerMx = W / 18;
  const pxPerMz = H / 12;
  const xOf = (m: number) => W / 2 + m * pxPerMx;
  return canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = "#16141d";
    ctx.fillRect(0, 0, W, H);

    // asphalt speckle
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const s = Math.random() * 1.8 + 0.4;
      const v = Math.random();
      ctx.fillStyle = v > 0.6 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.18)";
      ctx.fillRect(x, y, s, s);
    }

    // slightly darker shoulders
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, xOf(-4.7), H);
    ctx.fillRect(xOf(4.7), 0, W - xOf(4.7), H);

    // edge lines (solid)
    ctx.fillStyle = "#ded8c6";
    ctx.globalAlpha = 0.9;
    ctx.fillRect(xOf(-4.65), 0, 5, H);
    ctx.fillRect(xOf(4.65) - 5, 0, 5, H);
    ctx.globalAlpha = 1;

    // lane dashes between lanes: at x = -1.5 and +1.5, dash 3 m, gap 9 m (one dash per tile)
    ctx.fillStyle = "#efe9d8";
    const dashLen = 3 * pxPerMz;
    for (const lx of [-1.5, 1.5]) {
      ctx.fillRect(xOf(lx) - 3.5, 0, 7, dashLen);
    }

    // faint wheel-polish tracks in each lane
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    for (const lane of [-3, 0, 3]) {
      ctx.fillRect(xOf(lane - 0.75) - 8, 0, 16, H);
      ctx.fillRect(xOf(lane + 0.75) - 8, 0, 16, H);
    }
  });
}

function gatePanelTexture(): THREE.Texture {
  return canvasTexture(1024, 256, (ctx) => {
    ctx.fillStyle = "#191223";
    ctx.fillRect(0, 0, 1024, 256);
    // hazard chevrons at both ends
    const stripe = (x0: number, dir: number) => {
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#ffb347" : "#22162e";
        ctx.beginPath();
        const x = x0 + dir * i * 24;
        ctx.moveTo(x, 224);
        ctx.lineTo(x + dir * 24, 224);
        ctx.lineTo(x + dir * 24, 256);
        ctx.lineTo(x, 256);
        ctx.fill();
      }
    };
    stripe(0, 1);
    stripe(1024, -1);

    ctx.font = "bold 96px Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffb347";
    ctx.shadowBlur = 28;
    ctx.fillStyle = "#ffd9a0";
    ctx.fillText("LOW CLEARANCE", 512, 96);
    ctx.font = "bold 64px Menlo, monospace";
    ctx.fillStyle = "#ffb347";
    ctx.fillText("▼  TRACK MODE  ▼", 512, 186);
  });
}

function barrierTexture(): THREE.Texture {
  return canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = "#d8d3c8";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#5a5a60";
    ctx.fillRect(0, 104, 256, 24);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 256, 88);
    ctx.clip();
    for (let i = -2; i < 12; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#e8632c" : "#f4efe6";
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32 + 32, 0);
      ctx.lineTo(i * 32 - 16, 88);
      ctx.lineTo(i * 32 - 48, 88);
      ctx.fill();
    }
    ctx.restore();
  });
}

function billboardTexture(title: string, sub: string, accent: string): THREE.Texture {
  return canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = "#120b1e";
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 496, 240);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = accent;
    ctx.shadowBlur = 26;
    ctx.fillStyle = accent;
    ctx.font = "bold 64px Menlo, monospace";
    ctx.fillText(title, 256, sub ? 96 : 128);
    if (sub) {
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#f6f2ff";
      ctx.font = "bold 38px Menlo, monospace";
      ctx.fillText(sub, 256, 176);
    }
  });
}

function policeTexture(): THREE.Texture {
  return canvasTexture(512, 128, (ctx) => {
    ctx.clearRect(0, 0, 512, 128);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 92px Menlo, monospace";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillText("POLICE", 260, 70);
    ctx.fillStyle = "#f6f2ff";
    ctx.fillText("POLICE", 256, 64);
  });
}

export function createTextures(): GameTextures {
  return {
    soft: softCircle(128),
    road: roadTexture(),
    gate: gatePanelTexture(),
    barrier: barrierTexture(),
    police: policeTexture(),
    ads: [
      billboardTexture("ROADSTER", "0-60 < 1s", "#4de1ff"),
      billboardTexture("GIGA TEXAS", "37 mi →", "#ffb347"),
      billboardTexture("MARS AHEAD", "↑ next exit", "#ff4d8d"),
      billboardTexture("STARMAN", "was here", "#4de1ff"),
      billboardTexture("PIT STOP", "cold gas • 6s", "#ffb347"),
      billboardTexture("NO FLY ZONE?", "(we don't care)", "#ff4d8d"),
    ],
  };
}
