// All sound is synthesized with WebAudio: short oscillator blips and filtered noise,
// no audio files. The context is created on the first player gesture (browsers block
// sound before one), and M toggles mute. Shot scenes never unlock audio, so they stay silent.

const MASTER = 0.16;

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = MASTER;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, endFreq, seconds, type, volume, delay) {
    if (!context || muted) return;
    const start = context.currentTime + (delay || 0);
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  function noise(seconds, volume, cutoff, delay) {
    if (!context || muted) return;
    const start = context.currentTime + (delay || 0);
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() { return muted; },
    shoot() { tone(720, 320, 0.07, 'square', 0.10); },
    hit() { tone(180, 90, 0.09, 'sawtooth', 0.14); },
    enemyDie() { noise(0.18, 0.22, 1400); tone(320, 60, 0.18, 'triangle', 0.16); },
    pickup() { tone(660, 660, 0.08, 'sine', 0.18); tone(990, 990, 0.12, 'sine', 0.16, 0.07); },
    hurt() { tone(140, 55, 0.25, 'sawtooth', 0.22); noise(0.12, 0.14, 700); },
    waveClear() { tone(523, 523, 0.12, 'triangle', 0.2); tone(659, 659, 0.12, 'triangle', 0.2, 0.1); tone(784, 784, 0.22, 'triangle', 0.2, 0.2); },
    upgrade() { tone(440, 880, 0.16, 'sine', 0.18); },
    gameOver() { tone(392, 392, 0.2, 'triangle', 0.2); tone(311, 311, 0.2, 'triangle', 0.2, 0.18); tone(233, 110, 0.5, 'triangle', 0.2, 0.36); },
    victory() {
      const notes = [523, 659, 784, 1047, 784, 1047];
      notes.forEach((freq, i) => tone(freq, freq, 0.22, 'triangle', 0.2, i * 0.13));
    },
    click() { tone(880, 660, 0.05, 'sine', 0.12); },
  };
}
