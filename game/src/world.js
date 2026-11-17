// The game's rules and state, with no drawing and no browser in it: the keeper, four
// kinds of shadow wisp, flame bullets, pickups, particles, ten waves and the lantern
// upgrades offered between waves. step() advances one fixed step and returns what
// happened as bit flags, so the caller can play sounds without the world knowing
// about screens or audio. Nothing here allocates after createWorld returns, except
// the short arrays the wave lists and upgrade choices rebuild.

import { ENEMY, FIELD, PICKUP, PLAYER, SPAWN, WAVES } from './config.js';
import { pick, shuffle } from './random.js';

export const KIND_MOTE = 'mote';
export const KIND_SPITTER = 'spitter';
export const KIND_BRUTE = 'brute';
export const KIND_DASHER = 'dasher';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_OVER = 8;
export const EVENT_WIN = 16;
export const EVENT_KILL = 32;
export const EVENT_SHOOT = 64;

/** The lantern upgrades offered between waves: one clear job each, named for what it does. */
export const UPGRADES = [
  { id: 'ember-rounds', name: 'Ember Rounds', desc: '+25% flame damage', icon: 'DMG' },
  { id: 'swift-hands', name: 'Swift Hands', desc: '+18% fire rate', icon: 'RTE' },
  { id: 'twin-lantern', name: 'Twin Lantern', desc: '+1 flame per shot', icon: 'x2' },
  { id: 'long-flame', name: 'Long Flame', desc: 'Flames pierce +1 wisp', icon: 'PRC' },
  { id: 'swift-boots', name: 'Swift Boots', desc: '+12% move speed', icon: 'SPD' },
  { id: 'heartwood', name: 'Heartwood', desc: '+25 max health, heal 25', icon: 'HP' },
  { id: 'wide-net', name: 'Wide Net', desc: 'Pickups drift to you', icon: 'MAG' },
  { id: 'guard-flame', name: 'Guard Flame', desc: '+40 shield at each wave start', icon: 'SHD' },
];

const PICKUP_KINDS = ['heart', 'shield', 'rapid', 'gem'];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createWorld(random) {
  const player = { x: FIELD.width / 2, y: FIELD.height / 2, angle: -Math.PI / 2, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, shield: 0, fireCd: 0, invuln: 0, radius: PLAYER.radius };
  const stats = { damage: PLAYER.bulletDamage, fireInterval: PLAYER.fireInterval, multishot: 1, pierce: 0, moveSpeed: PLAYER.speed, magnet: PLAYER.magnetRadius };
  const state = {
    player, stats, enemies: [], bullets: [], orbs: [], pickups: [], particles: [], floats: [],
    score: 0, kills: 0, wave: 1, elapsed: 0, spawnQueue: [], spawnTimer: 0, banner: '',
    bannerT: 0, shake: 0, choices: [], shieldBonus: 0, god: false, over: false, won: false,
  };

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.angle = -Math.PI / 2;
    player.hp = PLAYER.maxHp;
    player.maxHp = PLAYER.maxHp;
    player.shield = 0;
    player.fireCd = 0;
    player.invuln = 0;
    stats.damage = PLAYER.bulletDamage;
    stats.fireInterval = PLAYER.fireInterval;
    stats.multishot = 1;
    stats.pierce = 0;
    stats.moveSpeed = PLAYER.speed;
    stats.magnet = PLAYER.magnetRadius;
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.orbs.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.floats.length = 0;
    state.score = 0;
    state.kills = 0;
    state.wave = 1;
    state.elapsed = 0;
    state.spawnQueue.length = 0;
    state.spawnTimer = 0;
    state.banner = '';
    state.bannerT = 0;
    state.shake = 0;
    state.choices.length = 0;
    state.shieldBonus = 0;
    state.god = false;
    state.over = false;
    state.won = false;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const v = speed * (0.3 + random() * 0.7);
      state.particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life: 0.5 + random() * 0.4, maxLife: 0.9, size: 2 + random() * 3, color });
    }
  }

  function floatText(x, y, text, color) {
    state.floats.push({ x, y, text, life: 1, color });
  }

  function buildSpawnQueue(wave) {
    const list = [];
    const motes = 4 + wave * 2;
    for (let i = 0; i < motes; i += 1) list.push(KIND_MOTE);
    if (wave >= 2) for (let i = 0; i < wave; i += 1) list.push(KIND_SPITTER);
    if (wave >= 3) for (let i = 0; i < Math.floor(wave / 2); i += 1) list.push(KIND_BRUTE);
    if (wave >= 4) for (let i = 0; i < wave - 2; i += 1) list.push(KIND_DASHER);
    return shuffle(random, list);
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildSpawnQueue(wave);
    state.spawnTimer = 0.8;
    state.banner = wave === 1 ? 'Wave 1 — the wisps stir' : `Wave ${wave} of ${WAVES}`;
    state.bannerT = 2.2;
    player.shield = Math.max(player.shield, state.shieldBonus);
  }

  function spawnEnemy(kind) {
    const def = ENEMY[kind];
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = Math.floor(random() * 4);
      if (edge === 0) { x = random() * FIELD.width; y = -30; }
      else if (edge === 1) { x = random() * FIELD.width; y = FIELD.height + 30; }
      else if (edge === 2) { x = -30; y = random() * FIELD.height; }
      else { x = FIELD.width + 30; y = random() * FIELD.height; }
      if (dist(x, y, player.x, player.y) > 240) break;
    }
    const hpScale = 1 + (state.wave - 1) * 0.12;
    state.enemies.push({
      kind, x, y, vx: 0, vy: 0, hp: Math.round(def.hp * hpScale), maxHp: Math.round(def.hp * hpScale),
      radius: def.radius, speed: def.speed * (1 + (state.wave - 1) * 0.03), damage: def.damage,
      score: def.score, shootCd: 1.5 + random(), phase: 'stalk', phaseT: 0.8 + random(), lx: 0, ly: 0,
      flash: 0, wobble: random() * Math.PI * 2,
    });
  }

  function spawnPickup(x, y, forced) {
    const kind = forced || pick(random, PICKUP_KINDS);
    const angle = random() * Math.PI * 2;
    state.pickups.push({ kind, x, y, vx: Math.cos(angle) * 60, vy: Math.sin(angle) * 60, life: 12 });
  }

  function killEnemy(index) {
    const enemy = state.enemies[index];
    state.enemies.splice(index, 1);
    state.score += enemy.score;
    state.kills += 1;
    burst(enemy.x, enemy.y, ENEMY[enemy.kind].color, enemy.kind === KIND_BRUTE ? 26 : 12, 220);
    floatText(enemy.x, enemy.y - 10, `+${enemy.score}`, '#ffe08a');
    if (enemy.kind === KIND_BRUTE) {
      // A brute bursts into two motes that scatter from its husk.
      for (let i = 0; i < 2; i += 1) {
        const angle = random() * Math.PI * 2;
        state.enemies.push({
          kind: KIND_MOTE, x: enemy.x + Math.cos(angle) * 30, y: enemy.y + Math.sin(angle) * 30,
          vx: Math.cos(angle) * 120, vy: Math.sin(angle) * 120, hp: ENEMY.mote.hp, maxHp: ENEMY.mote.hp,
          radius: ENEMY.mote.radius, speed: ENEMY.mote.speed, damage: ENEMY.mote.damage,
          score: ENEMY.mote.score, shootCd: 0, phase: 'stalk', phaseT: 0, lx: 0, ly: 0, flash: 0, wobble: random() * 6,
        });
      }
      spawnPickup(enemy.x, enemy.y, 'heart');
    } else if (random() < PICKUP.dropChance) {
      spawnPickup(enemy.x, enemy.y);
    }
  }

  function hurtPlayer(damage) {
    if (player.invuln > 0 || state.god || state.over) return 0;
    let rest = damage;
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, rest);
      player.shield -= absorbed;
      rest -= absorbed;
    }
    player.hp -= rest;
    player.invuln = PLAYER.invulnerable;
    state.shake = Math.max(state.shake, 10);
    burst(player.x, player.y, '#ff5a4e', 10, 180);
    if (player.hp <= 0) {
      player.hp = 0;
      state.over = true;
      burst(player.x, player.y, '#ffc857', 40, 320);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function offerChoices() {
    const pool = UPGRADES.slice();
    shuffle(random, pool);
    state.choices = pool.slice(0, 3);
  }

  function applyUpgrade(id) {
    const found = UPGRADES.find((u) => u.id === id);
    if (!found) return;
    if (id === 'ember-rounds') stats.damage *= 1.25;
    else if (id === 'swift-hands') stats.fireInterval = Math.max(0.09, stats.fireInterval * 0.82);
    else if (id === 'twin-lantern') stats.multishot = Math.min(5, stats.multishot + 1);
    else if (id === 'long-flame') stats.pierce += 1;
    else if (id === 'swift-boots') stats.moveSpeed *= 1.12;
    else if (id === 'heartwood') { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); }
    else if (id === 'wide-net') stats.magnet *= 2;
    else if (id === 'guard-flame') state.shieldBonus += 40;
    state.choices.length = 0;
    startWave(state.wave + 1);
  }

  function fireFlames() {
    const spread = 0.14;
    const count = stats.multishot;
    for (let i = 0; i < count; i += 1) {
      const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
      const angle = player.angle + offset;
      state.bullets.push({
        x: player.x + Math.cos(angle) * 24, y: player.y + Math.sin(angle) * 24,
        vx: Math.cos(angle) * PLAYER.bulletSpeed, vy: Math.sin(angle) * PLAYER.bulletSpeed,
        damage: stats.damage * (state.god ? 6 : 1), pierce: stats.pierce, radius: PLAYER.bulletRadius, life: 0.9,
      });
    }
    state.particles.push({ x: player.x + Math.cos(player.angle) * 26, y: player.y + Math.sin(player.angle) * 26, vx: 0, vy: 0, life: 0.12, maxLife: 0.12, size: 10, color: '#ffe08a' });
  }

  /**
   * One fixed step. `input` is { move: {x, y}, aimX, aimY, firing } in logical
   * coordinates, or null for the title screen's backdrop, where wisps drift harmlessly.
   */
  function step(dt, input, attract) {
    let events = 0;
    state.elapsed += dt;
    if (state.bannerT > 0) state.bannerT -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floats.length - 1; i >= 0; i -= 1) {
      const f = state.floats[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) state.floats.splice(i, 1);
    }

    if (attract) {
      // Title backdrop: wisps drift in from the edges and wander; nothing can hurt.
      if (state.enemies.length < 9 && random() < dt * 1.2) spawnEnemy(KIND_MOTE);
      for (const enemy of state.enemies) {
        enemy.wobble += dt * 2;
        enemy.x += Math.cos(enemy.wobble) * 26 * dt;
        enemy.y += Math.sin(enemy.wobble * 0.7) * 22 * dt + 12 * dt;
        if (enemy.y > FIELD.height + 40) { enemy.y = -30; enemy.x = random() * FIELD.width; }
        if (enemy.x < -40) enemy.x = FIELD.width + 30;
        if (enemy.x > FIELD.width + 40) enemy.x = -30;
      }
      return events;
    }

    if (state.over || state.won) return events;

    // The keeper moves and aims.
    const mx = input.move.x;
    const my = input.move.y;
    player.x = Math.min(FIELD.width - 28, Math.max(28, player.x + mx * stats.moveSpeed * dt));
    player.y = Math.min(FIELD.height - 28, Math.max(28, player.y + my * stats.moveSpeed * dt));
    player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    if (player.invuln > 0) player.invuln -= dt;
    if (player.fireCd > 0) player.fireCd -= dt;
    if (input.firing && player.fireCd <= 0) {
      fireFlames();
      player.fireCd = stats.fireInterval;
      events |= EVENT_SHOOT;
    }

    // Spawn the wave's queue on a timer that quickens each wave.
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer = Math.max(SPAWN.min, SPAWN.first - SPAWN.perWave * (state.wave - 1));
      }
    }

    // Enemies: each kind hunts in its own way.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      if (e.flash > 0) e.flash -= dt;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / d;
      const ny = dy / d;
      if (e.kind === KIND_MOTE) {
        e.wobble += dt * 3;
        e.vx = nx * e.speed + Math.cos(e.wobble) * 30;
        e.vy = ny * e.speed + Math.sin(e.wobble) * 30;
      } else if (e.kind === KIND_SPITTER) {
        const strafe = Math.sin(state.elapsed * 1.4 + e.wobble);
        const toward = d > 300 ? 1 : d < 190 ? -1 : 0;
        e.vx = nx * e.speed * toward - ny * 46 * strafe;
        e.vy = ny * e.speed * toward + nx * 46 * strafe;
        e.shootCd -= dt;
        if (e.shootCd <= 0 && d < 560) {
          e.shootCd = 2.4;
          state.orbs.push({ x: e.x, y: e.y, vx: nx * 235, vy: ny * 235, damage: e.damage, radius: 7, life: 4 });
          burst(e.x, e.y, '#ff7ad9', 4, 80);
        }
      } else if (e.kind === KIND_BRUTE) {
        e.vx = nx * e.speed;
        e.vy = ny * e.speed;
      } else if (e.kind === KIND_DASHER) {
        e.phaseT -= dt;
        if (e.phase === 'stalk') {
          e.vx = nx * e.speed * 0.7;
          e.vy = ny * e.speed * 0.7;
          if (e.phaseT <= 0 && d < 420) { e.phase = 'windup'; e.phaseT = 0.55; e.lx = nx; e.ly = ny; }
        } else if (e.phase === 'windup') {
          e.vx = 0;
          e.vy = 0;
          e.flash = 0.05;
          if (e.phaseT <= 0) { e.phase = 'lunge'; e.phaseT = 0.34; e.vx = e.lx * 430; e.vy = e.ly * 430; }
        } else if (e.phase === 'lunge') {
          if (e.phaseT <= 0) { e.phase = 'rest'; e.phaseT = 0.9; e.vx = 0; e.vy = 0; }
        } else {
          e.vx = 0;
          e.vy = 0;
          if (e.phaseT <= 0) { e.phase = 'stalk'; e.phaseT = 1.1; }
        }
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = Math.min(FIELD.width + 40, Math.max(-40, e.x));
      e.y = Math.min(FIELD.height + 40, Math.max(-40, e.y));
      // Touching a wisp hurts the keeper.
      if (d < e.radius + player.radius && player.invuln <= 0) {
        events |= hurtPlayer(e.damage);
        if (state.over) return events;
        // Shove the wisp back so one touch is one hit.
        e.x -= nx * 26;
        e.y -= ny * 26;
      }
    }

    // Flames fly and bite.
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        state.bullets.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const e = state.enemies[j];
        if (dist(b.x, b.y, e.x, e.y) < b.radius + e.radius) {
          e.hp -= b.damage;
          e.flash = 0.08;
          burst(b.x, b.y, '#ffe08a', 3, 120);
          if (e.hp <= 0) {
            killEnemy(j);
            events |= EVENT_KILL;
          }
          if (b.pierce > 0) b.pierce -= 1;
          else { state.bullets.splice(i, 1); }
          break;
        }
      }
    }

    // Spitter orbs drift and sting.
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const o = state.orbs[i];
      o.life -= dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.life <= 0 || o.x < -20 || o.x > FIELD.width + 20 || o.y < -20 || o.y > FIELD.height + 20) {
        state.orbs.splice(i, 1);
        continue;
      }
      if (dist(o.x, o.y, player.x, player.y) < o.radius + player.radius && player.invuln <= 0) {
        state.orbs.splice(i, 1);
        events |= hurtPlayer(o.damage);
        if (state.over) return events;
      }
    }

    // Pickups drift, get magnetised, and are gathered.
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const p = state.pickups[i];
      p.life -= dt;
      const d = dist(p.x, p.y, player.x, player.y);
      if (d < stats.magnet) {
        const pull = 1 - d / stats.magnet;
        p.vx += ((player.x - p.x) / Math.max(1, d)) * PICKUP.magnetSpeed * pull * dt * 8;
        p.vy += ((player.y - p.y) / Math.max(1, d)) * PICKUP.magnetSpeed * pull * dt * 8;
      }
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) { state.pickups.splice(i, 1); continue; }
      if (d < PICKUP.radius + player.radius) {
        state.pickups.splice(i, 1);
        if (p.kind === 'heart') { player.hp = Math.min(player.maxHp, player.hp + 25); floatText(player.x, player.y - 26, '+25', '#ff5a76'); }
        else if (p.kind === 'shield') { player.shield += 30; floatText(player.x, player.y - 26, '+30 shield', '#7ad9ff'); }
        else if (p.kind === 'rapid') { stats.fireInterval = Math.max(0.09, stats.fireInterval * 0.92); floatText(player.x, player.y - 26, 'Swifter!', '#9dff6e'); }
        else { state.score += 100; floatText(player.x, player.y - 26, '+100', '#e0aaff'); }
        events |= EVENT_PICKUP;
      }
    }

    // The wave is clear when its queue is empty and no wisp remains.
    if (state.spawnQueue.length === 0 && state.enemies.length === 0 && state.choices.length === 0) {
      state.score += 100 + state.wave * 25;
      if (state.wave >= WAVES) {
        state.won = true;
        return events | EVENT_WIN;
      }
      offerChoices();
      return events | EVENT_WAVE_CLEAR;
    }
    return events;
  }

  reset();
  return { state, reset, step, startWave, applyUpgrade };
}
