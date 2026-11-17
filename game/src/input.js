// Keyboard and mouse input. Held keys steer, the mouse aims, holding the mouse button
// (or Space) fires. One-shot presses — start, restart, pause, mute, upgrade picks — are
// queued as bit flags and taken once by the loop, so a press between frames is never lost
// or counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_PICK_1 = 8;
export const ACTION_PICK_2 = 16;
export const ACTION_PICK_3 = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const PICKS = new Map([['Digit1', ACTION_PICK_1], ['Digit2', ACTION_PICK_2], ['Digit3', ACTION_PICK_3], ['Numpad1', ACTION_PICK_1], ['Numpad2', ACTION_PICK_2], ['Numpad3', ACTION_PICK_3]]);

export function createInput(canvas) {
  const keys = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let firing = false;
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeen = false;

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      firing = true;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (PICKS.has(event.code)) {
      if (!event.repeat) actions |= PICKS.get(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
    else if (CONFIRM.has(event.code)) firing = false;
  });
  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = false;
    firing = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    trackMouse(event);
    firing = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => { firing = false; });
  canvas.addEventListener('pointermove', trackMouse);
  canvas.addEventListener('pointerleave', () => { firing = false; });

  return {
    /** Steering as x/y in -1..1, normalised so diagonals are not faster. */
    move() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    firing() { return firing; },
    mouse() { return { x: mouseX, y: mouseY, seen: mouseSeen }; },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
