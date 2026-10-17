import type { Action } from "./input";
import { formatScore } from "./utils";

export interface HudCallbacks {
  onStart: () => void;
  onRestart: () => void;
  onResume: () => void;
  onPause: () => void;
  onMute: () => void;
  onTouch: (action: Action, down: boolean) => void;
}

export interface HudSnapshot {
  score: number;
  coins: number;
  best: number;
  speedMph: number;
  fuel01: number;
  fuelSecs: number;
  thrustActive: boolean;
  heat: number;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class HUD {
  readonly root: HTMLDivElement;
  isTouch: boolean;

  private scoreValue: HTMLSpanElement;
  private coinsValue: HTMLSpanElement;
  private bestValue: HTMLSpanElement;
  private speedValue: HTMLSpanElement;
  private fuelFill: HTMLDivElement;
  private fuelSecs: HTMLSpanElement;
  private fuelWrap: HTMLDivElement;
  private heatFill: HTMLDivElement;
  private heatWrap: HTMLDivElement;
  private vignette: HTMLDivElement;
  private flash: HTMLDivElement;
  private events: HTMLDivElement;
  private countdown: HTMLDivElement;

  private menu: HTMLDivElement;
  private menuBest: HTMLDivElement;
  private busted: HTMLDivElement;
  private bustedScore: HTMLDivElement;
  private bustedBest: HTMLDivElement;
  private bustedNew: HTMLDivElement;
  private pause: HTMLDivElement;

  private muteBtn: HTMLButtonElement;
  private touchControls: HTMLDivElement;

  private lastScore = -1;
  private lastCoins = -1;
  private lastBest = -1;
  private lastSpeed = -1;
  private lastFuelPct = -1;
  private lastHeatPct = -1;

  constructor(parent: HTMLElement, private cb: HudCallbacks) {
    this.isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    this.root = el("div", "hud");
    parent.appendChild(this.root);

    // --- top left: score + coins ---
    const tl = el("div", "panel-pos tl");
    const scoreBox = el("div", "score-box");
    el("div", "label", "SCORE");
    this.scoreValue = el("span", "value", "0");
    scoreBox.appendChild(this.scoreValue);
    const bestBox = el("div", "best", "BEST ");
    this.bestValue = el("span", "", "0");
    bestBox.appendChild(this.bestValue);
    scoreBox.appendChild(bestBox);
    const coinBox = el("div", "coin-box");
    el("span", "coin-icon", "●");
    this.coinsValue = el("span", "value", "0");
    coinBox.appendChild(this.coinsValue);
    tl.append(scoreBox, coinBox);
    this.root.appendChild(tl);

    // --- top right: buttons ---
    const tr = el("div", "panel-pos tr");
    this.muteBtn = el("button", "icon-btn", "♪");
    this.muteBtn.addEventListener("click", () => this.cb.onMute());
    const pauseBtn = el("button", "icon-btn", "❚❚");
    pauseBtn.addEventListener("click", () => this.cb.onPause());
    tr.append(this.muteBtn, pauseBtn);
    this.root.appendChild(tr);

    // --- bottom left: speed ---
    const bl = el("div", "panel-pos bl");
    const speedBox = el("div", "speed-box");
    this.speedValue = el("span", "value", "0");
    speedBox.append(this.speedValue, el("span", "unit", "MPH"));
    bl.appendChild(speedBox);
    this.root.appendChild(bl);

    // --- bottom center: thrust / fuel ---
    const bc = el("div", "panel-pos bc");
    this.fuelWrap = el("div", "fuel-wrap");
    const fuelLabel = el("div", "label", "THRUST");
    const fuelTrack = el("div", "fuel-track");
    this.fuelFill = el("div", "fuel-fill");
    fuelTrack.appendChild(this.fuelFill);
    this.fuelSecs = el("div", "fuel-secs", "10.0s");
    this.fuelWrap.append(fuelLabel, fuelTrack, this.fuelSecs);
    bc.appendChild(this.fuelWrap);
    this.root.appendChild(bc);

    // --- right: heat ---
    const mr = el("div", "panel-pos mr");
    this.heatWrap = el("div", "heat-wrap");
    el("div", "label", "HEAT");
    const heatTrack = el("div", "heat-track");
    this.heatFill = el("div", "heat-fill");
    heatTrack.appendChild(this.heatFill);
    this.heatWrap.appendChild(heatTrack);
    mr.appendChild(this.heatWrap);
    this.root.appendChild(mr);

    // --- overlays ---
    this.vignette = el("div", "vignette");
    this.flash = el("div", "flash");
    this.events = el("div", "event-layer");
    this.countdown = el("div", "countdown hidden");
    this.root.append(this.vignette, this.flash, this.events, this.countdown);

    // --- touch controls ---
    this.touchControls = el("div", "touch-controls");
    const mkBtn = (label: string, action: Action, cls: string) => {
      const b = el("button", `tbtn ${cls}`, label);
      const down = (e: Event) => {
        e.preventDefault();
        b.classList.add("pressed");
        this.cb.onTouch(action, true);
      };
      const up = (e: Event) => {
        e.preventDefault();
        b.classList.remove("pressed");
        this.cb.onTouch(action, false);
      };
      b.addEventListener("touchstart", down, { passive: false });
      b.addEventListener("touchend", up, { passive: false });
      b.addEventListener("touchcancel", up, { passive: false });
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        down(e);
      });
      b.addEventListener("mouseup", up);
      return b;
    };
    const leftGroup = el("div", "t-group left");
    leftGroup.append(mkBtn("◀", "left", ""), mkBtn("▶", "right", ""));
    const rightGroup = el("div", "t-group right");
    rightGroup.append(mkBtn("▲", "hop", "small"), mkBtn("▼", "duck", "small"), mkBtn("⚡FLY", "fly", "fly"));
    this.touchControls.append(leftGroup, rightGroup);
    if (this.isTouch) this.root.appendChild(this.touchControls);

    // --- menu ---
    this.menu = el("div", "overlay menu");
    const menuPanel = el("div", "menu-inner");
    menuPanel.appendChild(el("div", "title", "STARMAN'S ESCAPE"));
    menuPanel.appendChild(el("div", "subtitle", "TESLA ROADSTER × ENDLESS RUNNER"));
    menuPanel.appendChild(
      el("div", "tagline", "Outrun the cops. Dodge the traffic. Fly when they can't."),
    );
    const controls = el("div", "controls");
    const rows: Array<[string, string]> = this.isTouch
      ? [
          ["◀ ▶", "change lanes (or swipe)"],
          ["▲", "thruster hop (or swipe up)"],
          ["▼", "track-mode duck (or swipe down)"],
          ["⚡", "FLY — 10s of thrust, refills while driving (double-tap)"],
        ]
      : [
          ["← → / A D", "change lanes"],
          ["↑ / W", "thruster hop"],
          ["↓ / S", "track-mode duck"],
          ["SPACE", "FLY — 10s of thrust, refills while driving"],
          ["P", "pause"],
          ["M", "mute"],
        ];
    for (const [k, v] of rows) {
      const row = el("div", "ctrl-row");
      row.append(el("span", "kbd", k), el("span", "ctrl-label", v));
      controls.appendChild(row);
    }
    menuPanel.appendChild(controls);
    const startBtn = el("button", "btn primary", "START RUN");
    startBtn.addEventListener("click", () => this.cb.onStart());
    menuPanel.appendChild(startBtn);
    this.menuBest = el("div", "menu-best", "");
    menuPanel.appendChild(this.menuBest);
    menuPanel.appendChild(
      el(
        "div",
        "credit",
        "Fan-made tribute — not affiliated with Tesla, SpaceX, or Subway Surfers. Thrusters refill while you drive, just like the real one.",
      ),
    );
    this.menu.appendChild(menuPanel);
    parent.appendChild(this.menu);

    // --- busted ---
    this.busted = el("div", "overlay busted hidden");
    const bPanel = el("div", "menu-inner");
    bPanel.appendChild(el("div", "busted-title", "BUSTED"));
    const bStats = el("div", "stats");
    this.bustedScore = el("div", "stat big", "SCORE 0");
    this.bustedBest = el("div", "stat", "BEST 0");
    this.bustedNew = el("div", "stat newbest hidden", "★ NEW BEST ★");
    bStats.append(this.bustedScore, this.bustedBest, this.bustedNew);
    bPanel.appendChild(bStats);
    const againBtn = el("button", "btn primary", "RUN AGAIN");
    againBtn.addEventListener("click", () => this.cb.onRestart());
    bPanel.appendChild(againBtn);
    if (!this.isTouch) bPanel.appendChild(el("div", "hint", "press R to run again"));
    this.busted.appendChild(bPanel);
    parent.appendChild(this.busted);

    // --- pause ---
    this.pause = el("div", "overlay pause hidden");
    const pPanel = el("div", "menu-inner");
    pPanel.appendChild(el("div", "title small", "PAUSED"));
    const resumeBtn = el("button", "btn primary", "RESUME");
    resumeBtn.addEventListener("click", () => this.cb.onResume());
    const rstrtBtn = el("button", "btn", "RESTART RUN");
    rstrtBtn.addEventListener("click", () => this.cb.onRestart());
    pPanel.append(resumeBtn, rstrtBtn);
    if (!this.isTouch) pPanel.appendChild(el("div", "hint", "P to resume"));
    this.pause.appendChild(pPanel);
    parent.appendChild(this.pause);

    // Touches on buttons must never leak into the canvas swipe/tap handler.
    const stopButtonTouch = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("button")) e.stopPropagation();
    };
    for (const node of [this.root, this.menu, this.busted, this.pause]) {
      node.addEventListener("touchstart", stopButtonTouch);
      node.addEventListener("touchend", stopButtonTouch);
      node.addEventListener("touchcancel", stopButtonTouch);
    }
  }

  // ------------------------------------------------------------------ states
  showMenu(best: number): void {
    this.menu.classList.remove("hidden");
    this.root.classList.add("dimmed");
    this.menuBest.textContent = best > 0 ? `BEST ${formatScore(best)}` : "";
  }

  hideMenu(): void {
    this.menu.classList.add("hidden");
  }

  hideAllOverlays(): void {
    this.menu.classList.add("hidden");
    this.busted.classList.add("hidden");
    this.pause.classList.add("hidden");
    this.root.classList.remove("dimmed");
  }

  showBusted(score: number, best: number, isNew: boolean): void {
    this.bustedScore.textContent = `SCORE ${formatScore(score)}`;
    this.bustedBest.textContent = `BEST ${formatScore(best)}`;
    this.bustedNew.classList.toggle("hidden", !isNew);
    this.busted.classList.remove("hidden");
    this.root.classList.add("dimmed");
  }

  showPause(): void {
    this.pause.classList.remove("hidden");
  }

  hidePause(): void {
    this.pause.classList.add("hidden");
  }

  showCountdown(text: string, kind: "num" | "go"): void {
    this.countdown.textContent = text;
    // restart the CSS animation even when the class string is unchanged
    this.countdown.className = "countdown";
    void this.countdown.offsetWidth;
    this.countdown.className = `countdown show ${kind}`;
  }

  hideCountdown(): void {
    this.countdown.className = "countdown hidden";
  }

  showHud(show: boolean): void {
    this.root.classList.toggle("hud-hidden", !show);
  }

  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? "✕" : "♪";
    this.muteBtn.classList.toggle("muted", muted);
  }

  event(text: string, cls = ""): void {
    const node = el("div", `event-pop ${cls}`, text);
    this.events.appendChild(node);
    window.setTimeout(() => node.remove(), 1300);
  }

  flashRed(alpha: number, ms: number): void {
    this.flash.style.opacity = String(alpha);
    window.setTimeout(() => (this.flash.style.opacity = "0"), ms);
  }

  // ------------------------------------------------------------------ update
  update(s: HudSnapshot): void {
    if (s.score !== this.lastScore) {
      this.lastScore = s.score;
      this.scoreValue.textContent = formatScore(s.score);
    }
    if (s.coins !== this.lastCoins) {
      this.lastCoins = s.coins;
      this.coinsValue.textContent = String(s.coins);
    }
    if (s.best !== this.lastBest) {
      this.lastBest = s.best;
      this.bestValue.textContent = formatScore(s.best);
    }
    const mph = Math.round(s.speedMph);
    if (mph !== this.lastSpeed) {
      this.lastSpeed = mph;
      this.speedValue.textContent = String(mph);
    }
    const fuelPct = Math.round(s.fuel01 * 100);
    if (fuelPct !== this.lastFuelPct) {
      this.lastFuelPct = fuelPct;
      this.fuelFill.style.width = `${fuelPct}%`;
      this.fuelSecs.textContent = `${s.fuelSecs.toFixed(1)}s`;
      this.fuelWrap.classList.toggle("low", s.fuel01 < 0.28 && s.fuel01 > 0.001);
      this.fuelWrap.classList.toggle("empty", s.fuel01 <= 0.001);
      this.fuelWrap.classList.toggle("thrusting", s.thrustActive);
    } else if (Math.abs(Number.parseFloat(this.fuelSecs.textContent ?? "0") - s.fuelSecs) > 0.05) {
      this.fuelSecs.textContent = `${s.fuelSecs.toFixed(1)}s`;
    }
    const heatPct = Math.round(s.heat * 100);
    if (heatPct !== this.lastHeatPct) {
      this.lastHeatPct = heatPct;
      this.heatFill.style.height = `${heatPct}%`;
      this.heatWrap.classList.toggle("hot", s.heat > 0.72);
    }
    this.vignette.style.opacity = s.heat > 0.62 ? String(Math.min(0.85, (s.heat - 0.62) * 2.2)) : "0";
  }
}
