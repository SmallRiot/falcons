// Exact finite-horizon probabilities (apart from floating-point rounding).
import { payouts } from './store.mjs';
const outcomes = new Map();
for (let path = 0; path < 65536; path++) {
  const slot = path.toString(2).replaceAll('0', '').length;
  const delta = Math.round(payouts[slot] * 5) - 5;
  outcomes.set(delta, (outcomes.get(delta) ?? 0) + 1 / 65536);
}
const drift = [...outcomes].reduce((sum,[delta,p]) => sum + delta*p, 0);
const minDelta = Math.min(...outcomes.keys());
let previous = new Float64Array(0), previousAward = new Float64Array(0);
for (let remaining = 1; remaining <= 800; remaining++) {
  // Above this balance even the worst sequence can afford every remaining puck.
  const cutoff = 5 - minDelta * (remaining - 1);
  const chance = new Float64Array(cutoff), award = new Float64Array(cutoff);
  for (let balance = 5; balance < cutoff; balance++) {
    for (const [delta, p] of outcomes) {
      const next = balance + delta;
      const safe = next >= previous.length;
      chance[balance] += p * (safe ? 1 : previous[next]);
      award[balance] += p * (safe ? next + drift * (remaining - 1) : previousAward[next]);
    }
  }
  if (remaining >= 300 && remaining % 100 === 0) {
    const probability = chance[500];
    console.log(remaining, (probability*100).toFixed(3), (award[500]/5/probability).toFixed(2), (award[500]/5).toFixed(2));
  }
  previous = chance;
  previousAward = award;
}
