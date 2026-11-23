/** Tiny WebAudio synth. Off until the visitor turns it on. */
let ctx: AudioContext | null = null;
let enabled = false;

export function setSound(on: boolean) {
  enabled = on;
  if (on) {
    ctx ??= new AudioContext();
    void ctx.resume();
  }
}

export function soundOn() {
  return enabled;
}

function voice(type: OscillatorType, from: number, to: number, dur: number, vol: number, delay = 0) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur * 0.7);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function pop(pitch = 1) {
  voice("sine", 420 * pitch, 1100 * pitch, 0.16, 0.22);
}

export function boing() {
  voice("triangle", 180, 520, 0.38, 0.2);
  voice("sine", 360, 980, 0.3, 0.08, 0.04);
}

/** C major arpeggio, for milestones */
export function chime() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => voice("sine", f, f * 1.01, 0.4, 0.12, i * 0.07));
}
