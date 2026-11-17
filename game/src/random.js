// A small seeded generator built on a 32-bit linear congruential step plus a final
// xorshift mix. The same seed always deals the same waves, which is what makes the
// screenshot scenes repeatable, and a run without a seed just picks one at random.

export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    let mixed = state ^ (state >>> 16);
    mixed = Math.imul(mixed, 0x45d9f3b) >>> 0;
    mixed ^= mixed >>> 15;
    return (mixed >>> 0) / 4294967296;
  };
}

/** Pick one element of an array with the seeded generator. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** Fisher-Yates shuffle in place, driven by the seeded generator. */
export function shuffle(random, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}
