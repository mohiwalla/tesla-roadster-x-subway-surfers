/** Keyboard + touch input. Edge-triggered actions are consumed by the game. */

export type Action = "left" | "right" | "hop" | "duck" | "fly" | "pause" | "mute" | "start" | "restart";

const KEY_MAP: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "hop",
  KeyW: "hop",
  ArrowDown: "duck",
  KeyS: "duck",
  Space: "fly",
  KeyP: "pause",
  Escape: "pause",
  KeyM: "mute",
  KeyR: "restart",
};

/** Actions that are useful as one-shot triggers. */
const EDGE_ACTIONS: ReadonlySet<Action> = new Set([
  "left",
  "right",
  "hop",
  "fly",
  "pause",
  "mute",
  "start",
  "restart",
]);

export class Input {
  private down = new Set<Action>();
  private pressed = new Set<Action>(); // pending edge triggers
  private virtual = new Map<Action, boolean>();

  private touchStart: { x: number; y: number; t: number } | null = null;
  private lastTapTime = 0;
  private swipeDuckUntil = 0; // virtual duck hold after swipe-down

  constructor(target: HTMLElement) {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
    window.addEventListener("blur", () => {
      this.down.clear();
      this.virtual.clear();
    });

    const opts: AddEventListenerOptions = { passive: false };
    target.addEventListener("touchstart", (e) => this.onTouchStart(e), opts);
    target.addEventListener("touchend", (e) => this.onTouchEnd(e), opts);
    target.addEventListener("touchmove", (e) => e.preventDefault(), opts);
    target.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    const action = KEY_MAP[e.code];
    if (!action) return;
    // Space would scroll the page and arrows can scroll focused elements.
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (isDown) {
      if (!e.repeat) {
        this.press(action);
      }
      this.down.add(action);
    } else {
      this.down.delete(action);
    }
  }

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this.touchStart = { x: t.clientX, y: t.clientY, t: performance.now() };
  }

  private onTouchEnd(e: TouchEvent): void {
    const start = this.touchStart;
    this.touchStart = null;
    if (!start) return;
    if (e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const now = performance.now();
    const twoTaps = now - this.lastTapTime < 300;
    this.lastTapTime = now;

    const dist = Math.hypot(dx, dy);
    if (dist > 36) {
      if (Math.abs(dx) > Math.abs(dy)) {
        this.press(dx > 0 ? "right" : "left");
      } else if (dy < 0) {
        this.press("hop");
      } else {
        // swipe down = track-mode duck for a short window
        this.swipeDuckUntil = now + 650;
        this.press("duck");
      }
      return;
    }
    // tap
    if (twoTaps) {
      this.press("fly");
    } else {
      this.press("start");
      this.press("hop");
    }
  }

  /** Used by on-screen touch buttons. */
  setVirtual(action: Action, isDown: boolean): void {
    if (isDown) {
      this.press(action);
      this.virtual.set(action, true);
    } else {
      this.virtual.delete(action);
    }
  }

  private press(action: Action): void {
    if (EDGE_ACTIONS.has(action)) this.pressed.add(action);
  }

  /** True while an action is held (keyboard, virtual buttons, or swipe-duck). */
  held(action: Action): boolean {
    if (this.virtual.get(action)) return true;
    if (action === "duck" && performance.now() < this.swipeDuckUntil) return true;
    return this.down.has(action);
  }

  /** Consumes a pending edge trigger. */
  consume(action: Action): boolean {
    if (this.pressed.has(action)) {
      this.pressed.delete(action);
      return true;
    }
    return false;
  }

  consumeAny(actions: Action[]): Action | null {
    for (const a of actions) {
      if (this.consume(a)) return a;
    }
    return null;
  }

  clearEdges(): void {
    this.pressed.clear();
    this.virtual.clear();
  }
}
