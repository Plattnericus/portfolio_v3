/**
 * The loader's candy syrup: six wave layers drawn into two canvases (behind and
 * in front of the lollipop).
 *
 * `makeSyrup` is self-contained on purpose: the same function runs on the page
 * and, turned back into source, inside a worker that draws the waves off the
 * main thread. So it may only use its own locals and browser globals.
 */
export function makeSyrup() {
  const SYRUP = ["#8a5cff", "#3a9dff", "#36c06a", "#ffd23b", "#ff9233", "#ff5c8a"];
  // layers drawn behind the lollipop; the rest are in front of it
  const BACK = 3;
  const n = SYRUP.length;
  const K: number[] = [];
  const SPEED: number[] = [];
  const PHASE: number[] = [];
  const AMP: number[] = [];
  const LIFT: number[] = [];
  for (let i = 0; i < n; i++) {
    K.push((Math.PI * 2) / (0.55 + 0.11 * i));
    SPEED.push((i % 2 ? -1 : 1) * (0.9 + 0.22 * i));
    PHASE.push(i * 1.7);
    AMP.push(1 + i * 0.12);
    LIFT.push((n - 1 - i) * 0.034);
  }

  /** seconds on a clock the page and a worker share */
  const now = () => (performance.timeOrigin + performance.now()) / 1000;

  const crest = (i: number, x: number, t: number, W: number, H: number, levels: number[], slosh: number) => {
    const u = x / W;
    const a = H * 0.022 * slosh * AMP[i];
    return (
      H * (1 - levels[i] - LIFT[i]) +
      a * (Math.sin(u * K[i] + t * SPEED[i] + PHASE[i]) + 0.45 * Math.sin(u * K[i] * 2.1 - t * SPEED[i] * 1.35 + PHASE[i] * 2))
    );
  };

  const paint = (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    from: number,
    to: number,
    t: number,
    W: number,
    H: number,
    levels: number[],
    slosh: number,
  ) => {
    ctx.clearRect(0, 0, W, H);
    const step = Math.max(10, W / 90);
    for (let i = from; i < to; i++) {
      if (H * (1 - levels[i] - LIFT[i]) > H * 1.12) continue;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W + step; x += step) ctx.lineTo(x, crest(i, x, t, W, H, levels, slosh));
      ctx.lineTo(W + step, H);
      ctx.closePath();
      ctx.fillStyle = SYRUP[i];
      ctx.fill();
      // a glossy line along the crest, like light on syrup
      ctx.beginPath();
      for (let x = 0; x <= W + step; x += step) {
        const y = crest(i, x, t, W, H, levels, slosh) + 5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  };

  return { SYRUP, BACK, now, crest, paint };
}

type Syrup = ReturnType<typeof makeSyrup>;

/** The worker's whole program; it receives `makeSyrup` as its argument. */
function workerMain(make: () => Syrup) {
  const s = make();
  const scope = self as unknown as {
    onmessage: ((e: MessageEvent) => void) | null;
    requestAnimationFrame?: (fn: () => void) => number;
    close: () => void;
  };
  let back: OffscreenCanvasRenderingContext2D | null = null;
  let front: OffscreenCanvasRenderingContext2D | null = null;
  let W = 0;
  let H = 0;
  let running = false;
  let levels: number[] = [];
  let slosh = 1;
  for (let i = 0; i < s.SYRUP.length; i++) levels.push(0.05);
  const next = (fn: () => void) => (scope.requestAnimationFrame ? scope.requestAnimationFrame(fn) : setTimeout(fn, 16));
  const size = (w: number, h: number, ratio: number) => {
    W = w;
    H = h;
    for (const ctx of [back, front]) {
      if (!ctx) continue;
      ctx.canvas.width = Math.ceil(w * ratio);
      ctx.canvas.height = Math.ceil(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  };
  const loop = () => {
    if (!running || !back || !front) return;
    const t = s.now();
    s.paint(back, 0, s.BACK, t, W, H, levels, slosh);
    s.paint(front, s.BACK, s.SYRUP.length, t, W, H, levels, slosh);
    next(loop);
  };
  scope.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === "init") {
      back = (m.back as OffscreenCanvas).getContext("2d");
      front = (m.front as OffscreenCanvas).getContext("2d");
      size(m.w, m.h, m.ratio);
      running = true;
      loop();
    } else if (m.type === "size") size(m.w, m.h, m.ratio);
    else if (m.type === "state") {
      levels = m.levels;
      slosh = m.slosh;
    } else if (m.type === "stop") {
      running = false;
      scope.close();
    }
  };
}

/** A worker that draws the syrup, built from the functions above. */
export function makeSyrupWorker() {
  const src = `(${workerMain.toString()})(${makeSyrup.toString()});`;
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  const worker = new Worker(url);
  // the browser fetches the script asynchronously; let it go once it has surely started
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  return worker;
}

export const syrup = makeSyrup();
