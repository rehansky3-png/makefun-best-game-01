// The screenshot scenes behind ?shot=start|play|upgrade|end|win. Each one plays the
// real rules forward from a fresh world for a fixed stretch, steered by a simple
// autopilot — aim at the nearest wisp, kite away when one gets close, gather pickups
// when hurt — so the frame is what a real game looks like and the same seed always
// gives the same frame. The win scene plays with the keeper's lantern burning
// brighter (god mode, a shot-only helper in the world), the end scene stands still
// and never fires, as a careless player would.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const LIMIT_SECONDS = 600;

/** Aim at the nearest wisp, leading it slightly, and kite away when crowded. */
function pilotInput(state) {
  const player = state.player;
  let nearest = null;
  let nearestD = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < nearestD) {
      nearestD = d;
      nearest = e;
    }
  }
  let aimX = player.x + Math.cos(player.angle) * 200;
  let aimY = player.y + Math.sin(player.angle) * 200;
  if (nearest) {
    const flight = nearestD / 660;
    aimX = nearest.x + nearest.vx * flight;
    aimY = nearest.y + nearest.vy * flight;
  }
  // Kite: back away from the nearest wisp, drift sideways, and stay in the field.
  let mx = 0;
  let my = 0;
  if (nearest && nearestD < 190) {
    mx = (player.x - nearest.x) / nearestD;
    my = (player.y - nearest.y) / nearestD;
  } else if (nearest) {
    mx = -(nearest.y - player.y) / nearestD * 0.5;
    my = (nearest.x - player.x) / nearestD * 0.5;
  }
  // Hurt keepers drift toward the nearest heart.
  if (player.hp < 55) {
    let heart = null;
    let heartD = Infinity;
    for (const p of state.pickups) {
      if (p.kind !== 'heart') continue;
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d < heartD) {
        heartD = d;
        heart = p;
      }
    }
    if (heart) {
      mx = (heart.x - player.x) / heartD;
      my = (heart.y - player.y) / heartD;
    }
  }
  const cx = FIELD.width / 2;
  const cy = FIELD.height / 2;
  if (player.x < 70) mx += 1;
  if (player.x > FIELD.width - 70) mx -= 1;
  if (player.y < 70) my += 1;
  if (player.y > FIELD.height - 70) my -= 1;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  return { move: { x: mx, y: my }, aimX, aimY, firing: nearest !== null };
}

/** Run the world forward with the pilot for up to `seconds`, stopping early on `stop`. */
function runFor(world, seconds, stop) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, pilotInput(world.state), false);
    if (stop && stop(events)) return events;
    if (events & EVENT_OVER) return events;
    // A cleared wave offers a blessing; the pilot takes the first and fights on,
    // or the run would stall with its choices unanswered.
    if ((events & EVENT_WAVE_CLEAR) !== 0 && world.state.choices.length > 0) {
      world.applyUpgrade(world.state.choices[0].id);
    }
  }
  return 0;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Unknown names stage the title.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    world.startWave(1);
    // Stop mid-fight in wave 2, with wisps on screen and flames flying: a frame
    // taken after the wave is cleared would show an empty field.
    runFor(world, 90, () => world.state.wave >= 2 && world.state.enemies.length >= 6);
    if (world.state.over) {
      world.reset();
      world.state.god = true;
      world.startWave(1);
      runFor(world, 90, () => world.state.wave >= 2 && world.state.enemies.length >= 6);
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'upgrade') {
    world.startWave(1);
    runFor(world, LIMIT_SECONDS, (events) => (events & EVENT_WAVE_CLEAR) !== 0);
    if (world.state.choices.length === 0) {
      world.reset();
      world.state.god = true;
      world.startWave(1);
      runFor(world, LIMIT_SECONDS, (events) => (events & EVENT_WAVE_CLEAR) !== 0);
    }
    return { screen: SCREEN_UPGRADE, best: world.state.score };
  }
  if (name === 'end') {
    world.startWave(1);
    const idle = { move: { x: 0, y: 0 }, aimX: world.state.player.x, aimY: world.state.player.y - 100, firing: false };
    const steps = Math.floor(LIMIT_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      if (world.step(STEP, idle, false) & EVENT_OVER) break;
    }
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'win') {
    world.state.god = true;
    world.startWave(1);
    runFor(world, LIMIT_SECONDS, (events) => (events & EVENT_WIN) !== 0);
    if (!world.state.won) {
      world.state.won = true;
      world.state.wave = 10;
    }
    return { screen: SCREEN_WIN, best: world.state.score };
  }
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, null, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
