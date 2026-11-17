// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, paused, upgrade, game over
// and victory. Sounds fire on the world's events; the best score is kept in localStorage.
//
// ?seed=N fixes the wave pattern. ?shot=start|play|upgrade|end|win (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_PICKUP, EVENT_SHOOT, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    world.startWave(1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1. Keep your lantern burning.');
  }

  function finishRun(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won
      ? `Victory. Dawn breaks. Score ${world.state.score}. Best ${best}.`
      : `Game over on wave ${world.state.wave}. Score ${world.state.score}. Best ${best}.`);
  }

  /** Which upgrade card, if any, the pointer is over, in logical coordinates. */
  function cardAt(logical) {
    const choices = world.state.choices;
    if (choices.length === 0) return -1;
    const cardW = 300;
    const gap = 36;
    const total = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (1280 - total) / 2;
    const y = 230;
    for (let i = 0; i < choices.length; i += 1) {
      const cx = startX + i * (cardW + gap);
      if (logical.x >= cx && logical.x <= cx + cardW && logical.y >= y && logical.y <= y + 220) return i;
    }
    return -1;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_UPGRADE) {
      let pick = -1;
      if (actions & ACTION_PICK_1) pick = 0;
      else if (actions & ACTION_PICK_2) pick = 1;
      else if (actions & ACTION_PICK_3) pick = 2;
      else if (actions & ACTION_CONFIRM) {
        const mouse = input.mouse();
        if (mouse.seen) pick = cardAt(renderer.toLogical(mouse.x, mouse.y));
      }
      if (pick >= 0 && pick < world.state.choices.length) {
        const choice = world.state.choices[pick];
        audio.upgrade();
        world.applyUpgrade(choice.id);
        screen = SCREEN_PLAY;
        announce(`Blessing taken: ${choice.name}. Wave ${world.state.wave}.`);
      }
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function playInput() {
    const mouse = input.mouse();
    const aim = mouse.seen ? renderer.toLogical(mouse.x, mouse.y) : { x: world.state.player.x, y: world.state.player.y - 200 };
    return { move: input.move(), aimX: aim.x, aimY: aim.y, firing: input.firing() };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, playInput(), false);
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_KILL) audio.enemyDie();
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_WIN) {
      audio.victory();
      finishRun(true);
    } else if (events & EVENT_OVER) {
      audio.gameOver();
      finishRun(false);
    } else if (events & EVENT_WAVE_CLEAR) {
      audio.waveClear();
      screen = SCREEN_UPGRADE;
      announce(`Wave ${world.state.wave} cleared. Choose a blessing.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting wisps close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberfall. Press Space or click to light the lantern.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
