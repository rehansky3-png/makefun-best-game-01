// Every tuning number and colour for Emberfall lives here. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends
// on the screen size. Ten waves stand between the keeper and dawn.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** How many waves a run lasts; clearing wave 10 wins the game. */
export const WAVES = 10;

export const PLAYER = {
  radius: 18,
  speed: 300,
  maxHp: 100,
  invulnerable: 0.9,
  fireInterval: 0.22,
  bulletSpeed: 660,
  bulletDamage: 10,
  bulletRadius: 5,
  magnetRadius: 90,
};

export const ENEMY = {
  mote: { hp: 12, speed: 105, radius: 14, damage: 8, score: 50, color: '#b78cff' },
  spitter: { hp: 20, speed: 70, radius: 16, damage: 10, score: 80, color: '#ff7ad9' },
  brute: { hp: 70, speed: 48, radius: 28, damage: 18, score: 150, color: '#ff5a4e' },
  dasher: { hp: 16, speed: 95, radius: 13, damage: 12, score: 100, color: '#ffd166' },
};

export const PICKUP = {
  dropChance: 0.14,
  radius: 13,
  magnetSpeed: 320,
};

/** Seconds between spawns at wave 1, shrinking each wave down to this floor. */
export const SPAWN = { first: 1.15, perWave: 0.09, min: 0.42 };

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall.best';

export const PALETTE = {
  backdrop: '#0b0716',
  skyTop: '#171233',
  skyBottom: '#241040',
  ground: '#1d1433',
  rune: '#3a2a66',
  player: '#ffc857',
  playerCore: '#fff3c4',
  bullet: '#ffe08a',
  orb: '#ff7ad9',
  heart: '#ff5a76',
  shield: '#7ad9ff',
  rapid: '#9dff6e',
  gem: '#e0aaff',
  panel: '#1a1030',
  panelEdge: '#6b4fa8',
  text: '#f4efff',
  muted: '#b3a6d6',
  gold: '#ffc857',
  danger: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
