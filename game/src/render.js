// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Every wisp, the keeper, the lantern light and the panels are drawn in code —
// no image files. Text that holds a number is rebuilt only when the number changes.

import { FIELD, FONT, PALETTE, WAVES } from './config.js';
import { ENEMY } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const waveLabel = cachedLabel('Wave ');
  const killsLabel = cachedLabel('Wisps banished ');
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `600 ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function circle(x, y, radius, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  function drawBackground(state) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(1, PALETTE.skyBottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Faint rune dots, fixed to the field so the scene never slides.
    context.fillStyle = PALETTE.rune;
    for (let gx = 80; gx < FIELD.width; gx += 160) {
      for (let gy = 70; gy < FIELD.height; gy += 140) {
        context.beginPath();
        context.arc(gx, gy, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
    // The hollow's edge: a soft ring the keeper fights inside.
    context.strokeStyle = 'rgba(107, 79, 168, 0.5)';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(FIELD.width / 2, FIELD.height / 2, 330, 0, Math.PI * 2);
    context.stroke();
    // Vignette.
    const vignette = context.createRadialGradient(640, 360, 260, 640, 360, 760);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(5,2,12,0.55)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    void state;
  }

  function drawPickups(state) {
    for (const p of state.pickups) {
      const bob = Math.sin(state.elapsed * 4 + p.x) * 2;
      const y = p.y + bob;
      const pulse = 0.75 + Math.sin(state.elapsed * 6) * 0.25;
      if (p.kind === 'heart') {
        context.fillStyle = PALETTE.heart;
        context.beginPath();
        context.arc(p.x - 5, y - 2, 6, 0, Math.PI * 2);
        context.arc(p.x + 5, y - 2, 6, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.moveTo(p.x - 11, y - 1);
        context.lineTo(p.x + 11, y - 1);
        context.lineTo(p.x, y + 11);
        context.closePath();
        context.fill();
      } else if (p.kind === 'shield') {
        context.fillStyle = PALETTE.shield;
        context.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const px = p.x + Math.cos(a) * 12 * pulse;
          const py = y + Math.sin(a) * 12 * pulse;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
      } else if (p.kind === 'rapid') {
        context.fillStyle = PALETTE.rapid;
        context.beginPath();
        context.moveTo(p.x, y - 12);
        context.lineTo(p.x + 11, y + 8);
        context.lineTo(p.x - 11, y + 8);
        context.closePath();
        context.fill();
      } else {
        context.fillStyle = PALETTE.gem;
        context.save();
        context.translate(p.x, y);
        context.rotate(Math.PI / 4);
        context.fillRect(-8 * pulse, -8 * pulse, 16 * pulse, 16 * pulse);
        context.restore();
      }
    }
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      const def = ENEMY[e.kind];
      const flashing = e.flash > 0;
      if (e.kind === 'mote') {
        circle(e.x, e.y, e.radius + 3, 'rgba(183, 140, 255, 0.25)');
        circle(e.x, e.y, e.radius, flashing ? '#ffffff' : def.color);
        circle(e.x - 5, e.y - 2, 3.5, '#ffffff');
        circle(e.x + 5, e.y - 2, 3.5, '#ffffff');
        circle(e.x - 5, e.y - 2, 1.8, '#1a1030');
        circle(e.x + 5, e.y - 2, 1.8, '#1a1030');
      } else if (e.kind === 'spitter') {
        context.fillStyle = flashing ? '#ffffff' : def.color;
        context.save();
        context.translate(e.x, e.y);
        context.rotate(Math.PI / 4);
        context.fillRect(-e.radius * 0.8, -e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
        context.restore();
        circle(e.x, e.y, 6, '#1a1030');
        circle(e.x - 8, e.y - 8, 2.5, '#ffffff');
        circle(e.x + 8, e.y - 8, 2.5, '#ffffff');
      } else if (e.kind === 'brute') {
        context.fillStyle = flashing ? '#ffffff' : def.color;
        context.beginPath();
        context.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#7a1f1a';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(e.x - 14, e.y - 8);
        context.lineTo(e.x - 2, e.y + 4);
        context.lineTo(e.x + 12, e.y - 10);
        context.stroke();
        circle(e.x - 9, e.y - 4, 4, '#ffffff');
        circle(e.x + 9, e.y - 4, 4, '#ffffff');
        circle(e.x - 9, e.y - 4, 2, '#1a1030');
        circle(e.x + 9, e.y - 4, 2, '#1a1030');
        // Health bar over the brute, so the player can see the fight's length.
        context.fillStyle = 'rgba(0,0,0,0.5)';
        context.fillRect(e.x - 26, e.y - e.radius - 14, 52, 6);
        context.fillStyle = '#ff8a7a';
        context.fillRect(e.x - 26, e.y - e.radius - 14, 52 * Math.max(0, e.hp / e.maxHp), 6);
      } else if (e.kind === 'dasher') {
        const angle = Math.atan2(e.vy, e.vx);
        const winding = e.phase === 'windup';
        context.fillStyle = winding || flashing ? '#ffffff' : def.color;
        context.save();
        context.translate(e.x, e.y);
        context.rotate(angle);
        context.beginPath();
        context.moveTo(e.radius + 6, 0);
        context.lineTo(-e.radius, -e.radius * 0.85);
        context.lineTo(-e.radius, e.radius * 0.85);
        context.closePath();
        context.fill();
        context.restore();
        circle(e.x, e.y, 4, '#1a1030');
        if (winding) {
          context.strokeStyle = 'rgba(255, 209, 102, 0.8)';
          context.lineWidth = 2;
          context.beginPath();
          context.arc(e.x, e.y, e.radius + 8, 0, Math.PI * 2);
          context.stroke();
        }
      }
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return; // Blink while hurt-proof.
    // Lantern glow.
    const glow = context.createRadialGradient(p.x, p.y, 6, p.x, p.y, 120);
    glow.addColorStop(0, 'rgba(255, 200, 87, 0.5)');
    glow.addColorStop(1, 'rgba(255, 200, 87, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(p.x, p.y, 120, 0, Math.PI * 2);
    context.fill();
    // Cloak.
    context.fillStyle = '#2e6f6a';
    context.beginPath();
    context.moveTo(p.x, p.y - p.radius - 4);
    context.lineTo(p.x + p.radius, p.y + p.radius);
    context.lineTo(p.x - p.radius, p.y + p.radius);
    context.closePath();
    context.fill();
    // Hood and face.
    circle(p.x, p.y - 4, 11, '#123f3c');
    circle(p.x + Math.cos(p.angle) * 4, p.y - 4 + Math.sin(p.angle) * 4, 4, '#fff3c4');
    // The lantern itself, held out toward the aim.
    const lx = p.x + Math.cos(p.angle) * 24;
    const ly = p.y + Math.sin(p.angle) * 24;
    circle(lx, ly, 8, PALETTE.player);
    circle(lx, ly, 4, PALETTE.playerCore);
    // Shield ring.
    if (p.shield > 0) {
      context.strokeStyle = 'rgba(122, 217, 255, 0.85)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawShots(state) {
    for (const b of state.bullets) {
      context.strokeStyle = PALETTE.bullet;
      context.lineWidth = 4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
      context.stroke();
      circle(b.x, b.y, 3, '#fff3c4');
    }
    for (const o of state.orbs) {
      const pulse = 1 + Math.sin(state.elapsed * 10 + o.x) * 0.15;
      circle(o.x, o.y, o.radius * pulse + 3, 'rgba(255, 122, 217, 0.3)');
      circle(o.x, o.y, o.radius * pulse, PALETTE.orb);
      circle(o.x, o.y, 3, '#ffffff');
    }
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      circle(pt.x, pt.y, pt.size, pt.color);
    }
    context.globalAlpha = 1;
    for (const f of state.floats) {
      context.globalAlpha = Math.max(0, f.life);
      text(f.text, f.x, f.y, 18, f.color, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, best) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 26, PALETTE.text, 'left', 'top');
    text(bestLabel(best), 24, 50, 18, PALETTE.muted, 'left', 'top');
    text(waveLabel(state.wave) + ` of ${WAVES}`, FIELD.width / 2, 18, 26, PALETTE.text, 'center', 'top');
    const remaining = state.spawnQueue.length + state.enemies.length;
    text(remaining === 1 ? '1 wisp left' : `${remaining} wisps left`, FIELD.width / 2, 50, 18, PALETTE.muted, 'center', 'top');
    // Health bar, top right, with a shield segment when one is held.
    const barX = FIELD.width - 264;
    const barW = 240;
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillRect(barX - 6, 14, barW + 12, 30);
    context.fillStyle = '#3a2a66';
    context.fillRect(barX, 20, barW, 10);
    context.fillStyle = state.player.hp > 30 ? '#7ddb6a' : PALETTE.danger;
    context.fillRect(barX, 20, barW * Math.max(0, state.player.hp / state.player.maxHp), 10);
    if (state.player.shield > 0) {
      context.fillStyle = PALETTE.shield;
      context.fillRect(barX, 32, barW * Math.min(1, state.player.shield / 60), 5);
    }
    text(`HP ${Math.ceil(state.player.hp)}`, barX, 42, 15, PALETTE.text, 'left', 'top');
    text('WASD move · Mouse aim · Hold click to burn · P pause · M mute', 24, FIELD.height - 28, 15, PALETTE.muted, 'left', 'top');
    if (state.bannerT > 0) {
      context.globalAlpha = Math.min(1, state.bannerT);
      text(state.banner, FIELD.width / 2, 108, 34, PALETTE.gold, 'center', 'top');
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const lineHeight = 32;
    const height = 150 + lines.length * lineHeight + 66;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(8, 4, 18, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 46, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 132 + i * lineHeight, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 23, PALETTE.gold, 'center');
  }

  function drawTitle(state, best) {
    const lines = [
      'Ten waves of shadow wisps rise from the hollow.',
      'Keep your lantern burning until dawn. Clear wave 10 to win.',
      'WASD or arrows to move · Mouse to aim · Hold click or Space to burn',
      'Wisps drop hearts, shields and swiftness. Between waves, choose a blessing.',
      bestLabel(best),
    ];
    drawPanel('EMBERFALL', lines, 'Click or press Space to light the lantern', PALETTE.gold);
    text('Lanterns of the Hollow', FIELD.width / 2, 118, 24, PALETTE.gold, 'center');
  }

  function drawUpgrade(state) {
    context.fillStyle = 'rgba(8, 4, 18, 0.66)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text(`Wave ${state.wave} cleared!`, FIELD.width / 2, 130, 40, PALETTE.gold, 'center');
    text('Choose a lantern blessing — press 1, 2 or 3, or click a card', FIELD.width / 2, 172, 22, PALETTE.muted, 'center');
    const cardW = 300;
    const cardH = 220;
    const gap = 36;
    const total = state.choices.length * cardW + (state.choices.length - 1) * gap;
    const startX = (FIELD.width - total) / 2;
    const y = 230;
    state.choices.forEach((choice, i) => {
      const cx = startX + i * (cardW + gap);
      context.fillStyle = PALETTE.panel;
      context.fillRect(cx, y, cardW, cardH);
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 3;
      context.strokeRect(cx, y, cardW, cardH);
      circle(cx + cardW / 2, y + 62, 34, '#3a2a66');
      text(choice.icon, cx + cardW / 2, y + 70, 22, PALETTE.gold, 'center');
      text(choice.name, cx + cardW / 2, y + 132, 24, PALETTE.text, 'center');
      text(choice.desc, cx + cardW / 2, y + 168, 19, PALETTE.muted, 'center');
      text(`[${i + 1}]`, cx + cardW / 2, y + 200, 18, PALETTE.gold, 'center');
    });
    text(`Score ${state.score} · Wave ${state.wave} of ${WAVES} cleared`, FIELD.width / 2, 520, 22, PALETTE.text, 'center');
  }

  function drawOver(state, best, won) {
    const lines = won
      ? [`Dawn breaks over the hollow. The last wisp is ash.`, `Score ${state.score}`, `Time ${formatTime(state.elapsed)} · ${killsLabel(state.kills)}`, bestLabel(best)]
      : [`The lantern gutters out on wave ${state.wave} of ${WAVES}.`, `Score ${state.score}`, `${killsLabel(state.kills)} · Time ${formatTime(state.elapsed)}`, bestLabel(best)];
    drawPanel(won ? 'DAWN BREAKS' : 'THE LIGHT FADES', lines, 'Press Space or click to play again', won ? PALETTE.gold : PALETTE.danger);
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? Math.sin(state.elapsed * 91) * state.shake : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.elapsed * 113) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawBackground(state);
    drawPickups(state);
    drawEnemies(state);
    if (screen !== SCREEN_TITLE) drawPlayer(state);
    else drawPlayer(state);
    drawShots(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The wisps wait in the dark.'], 'Press P to return to the fight', PALETTE.panelEdge);
    } else if (screen === SCREEN_UPGRADE) {
      drawUpgrade(state);
    } else if (screen === SCREEN_OVER) {
      drawOver(state, best, false);
    } else if (screen === SCREEN_WIN) {
      drawOver(state, best, true);
    }
  }

  /** Convert CSS pixels over the canvas into logical playfield coordinates. */
  function toLogical(cssX, cssY) {
    const ratio = window.devicePixelRatio || 1;
    return { x: (cssX * ratio - view.x) / view.scale, y: (cssY * ratio - view.y) / view.scale };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical };
}
