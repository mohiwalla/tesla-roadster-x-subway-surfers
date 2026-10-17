/** Central tuning knobs for Starman's Escape. */
export const CFG = {
  // World
  lanes: 3,
  laneW: 3.0,
  roadHalfW: 9.0,

  // Speed (m/s)
  speedStart: 26,
  speedMax: 50,
  speedRampTime: 150, // seconds to approach speedMax
  flySpeedMul: 1.22, // extra pace while airborne

  // Fuel / thrust ("gas cylinders")
  fuelMax: 10, // seconds of continuous thrust
  fuelRefillRate: 0.85, // seconds of fuel gained per second while not thrusting
  fuelMinTakeoff: 0.8, // minimum tank left to engage flight
  cellFuel: 3, // seconds granted by an energy cell

  // Flight
  cruiseY: 4.15,
  climbRate: 8.0, // damping rate toward cruise altitude
  descendG: 17.0, // gravity while falling after thrust cut
  flyLockAfterCrash: 1.2,

  // Hop / gravity
  hopVy: 9.4,
  gravity: 24.0,

  // Duck (Track Mode drop)
  duckDrop: 0.46,
  duckInRate: 7.0,
  duckOutRate: 5.0,

  // Player box (half extents)
  carHalfW: 0.95,
  carHeight: 1.24,
  carDuckedHeight: 0.78,
  carHalfL: 2.1,

  // Crash handling
  crashSpeedMul: 0.55, // speed cut on crash
  crashRecover: 0.5, // speed fraction recovered per second
  invulnTime: 1.6,
  lockoutTime: 1.1,

  // Police chase (distances in meters behind the player)
  copDistStart: 13,
  copDistMax: 16.5,
  copDistBusted: 2.4,
  copCrashHit: 3.5, // meters gained instantly per crash
  copCrashFloor: 4.5,
  copRecover: 1.4, // m/s the cops fall back while you cruise
  copFlyGain: 2.0, // m/s they fall back while you fly
  copBaselinePull: 0.5, // m/s drift back toward baseline when idle

  // Camera
  camBack: 8.0,
  camUp: 3.8,
  fovBase: 66,
  fovSpeed: 0.42,
  fovFlyBonus: 5,

  // Spawning
  spawnAhead: 300,
  rowGapStart: 52,
  rowGapEnd: 30,
  tutorialRows: 5,

  // Scoring
  scorePerMeter: 1.2,
  coinScore: 10,
  cellScore: 25,

  // Audio thresholds
  sirenNear: 2.5,
  sirenFar: 26,
};

export const STORAGE_BEST = "starman_escape_best";
export const STORAGE_MUTED = "starman_escape_muted";
