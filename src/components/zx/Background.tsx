import { useEffect } from "react";

/**
 * Animated dragon-scale + ember background (ported from zerox.js) — optimised:
 * pre-rendered hex layer & ember sprite, no shadowBlur, 30fps on phones,
 * pauses when the tab is hidden, static frame for reduced-motion users.
 *
 * Self-contained on purpose (no imports, no outer variables): it is also inlined as a
 * plain <script> right after the canvas in the HTML, so the animation starts at first
 * paint instead of waiting for the app's JavaScript to download and hydrate.
 */
export function startZxBackground(c: HTMLCanvasElement | null): (() => void) | undefined {
  const w = window as unknown as { __zxBg?: boolean };
  if (!c || w.__zxBg) return;
  w.__zxBg = true;
  // Canvas needs plain rgb triples; these mirror the --zx-glow token of each theme.
  const FIRE_RGB = "255,90,20";
  const THEME_RGB: Record<string, string> = { fire: FIRE_RGB, blue: "56,189,248", purple: "168,85,247" };
  // Secondary aurora tint per theme (mirrors --zx-c).
  const FIRE_RGB2 = "255,196,40";
  const THEME_RGB2: Record<string, string> = { fire: FIRE_RGB2, blue: "110,120,255", purple: "236,90,190" };

  const x = c.getContext("2d");
  if (!x) return;

  const small = window.matchMedia("(max-width: 768px)").matches;
  const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4;
  const mobile = small || lowEnd;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frameMs = 1000 / (mobile ? 30 : 60);
  const S_HEX = 46;

  let W = 0, H = 0, raf = 0, last = 0, mx = 0.5, my = 0.5;
  let theme = document.documentElement.getAttribute("data-zx") || "fire";
  let g = THEME_RGB[theme] ?? FIRE_RGB;
  let g2 = THEME_RGB2[theme] ?? FIRE_RGB2;
  let hex: HTMLCanvasElement | null = null;
  let ember: HTMLCanvasElement | null = null;
  let auA: HTMLCanvasElement | null = null;
  let auB: HTMLCanvasElement | null = null;
  let grid: HTMLCanvasElement | null = null;
  let horizon = 0;

  // Slow drifting aurora blobs (pre-rendered sprites, scaled with drawImage).
  const AU = [
    { x: 0.18, y: 0.3, r: 0.55, s: 0.00012, p: 0, b: false },
    { x: 0.82, y: 0.55, r: 0.5, s: 0.0001, p: 2.1, b: true },
    { x: 0.5, y: 0.05, r: 0.45, s: 0.00008, p: 4.2, b: true },
  ];
  // Occasional shooting light streaks.
  const ST = Array.from({ length: mobile ? 2 : 4 }, () => ({ x: 0, y: 0, v: 0, l: 0, life: -Math.random() * 400 }));

  const P = Array.from({ length: mobile ? 42 : 110 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 2.2 + 0.4,
    s: Math.random() * 0.9 + 0.25,
    w: Math.random() * Math.PI * 2,
  }));
  const SQ = Array.from({ length: mobile ? 6 : 14 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    z: Math.random() * 60 + 30,
    a: Math.random() * 6.28,
    v: (Math.random() - 0.5) * 0.004,
  }));

  function buildHex() {
    hex = document.createElement("canvas");
    hex.width = W + S_HEX * 2;
    hex.height = H + S_HEX * 2;
    const h = hex.getContext("2d")!;
    h.strokeStyle = `rgba(${g},.16)`;
    h.lineWidth = 1;
    h.beginPath();
    for (let yy = 0; yy < hex.height + S_HEX; yy += S_HEX * 0.75) {
      const ox = Math.round(yy / (S_HEX * 0.75)) % 2 ? S_HEX / 2 : 0;
      for (let xx = 0; xx < hex.width + S_HEX; xx += S_HEX) {
        const px = xx + ox;
        h.moveTo(px + S_HEX * 0.5, yy);
        h.arc(px, yy, S_HEX * 0.5, 0, Math.PI, true);
      }
    }
    h.stroke();
  }
  function buildAurora() {
    const mk = (rgb: string) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const e = cv.getContext("2d")!;
      const gr = e.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, `rgba(${rgb},.55)`);
      gr.addColorStop(0.4, `rgba(${rgb},.18)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      e.fillStyle = gr;
      e.fillRect(0, 0, 128, 128);
      return cv;
    };
    auA = mk(g);
    auB = mk(g2);
  }
  // Perspective "cyber floor": converging lines pre-rendered; moving cross lines drawn per frame.
  function buildGrid() {
    horizon = H * 0.66;
    grid = document.createElement("canvas");
    grid.width = W;
    grid.height = Math.ceil(H - horizon);
    const h = grid.getContext("2d")!;
    const fade = h.createLinearGradient(0, 0, 0, grid.height);
    fade.addColorStop(0, `rgba(${g},0)`);
    fade.addColorStop(1, `rgba(${g},.32)`);
    h.strokeStyle = fade;
    h.lineWidth = 1;
    h.beginPath();
    const n = mobile ? 14 : 24;
    for (let i = -n; i <= n; i++) {
      h.moveTo(W / 2, 0);
      h.lineTo(W / 2 + (i / n) * W * 1.6, grid.height);
    }
    h.stroke();
  }
  function buildEmber() {
    ember = document.createElement("canvas");
    ember.width = ember.height = 32;
    const e = ember.getContext("2d")!;
    const gr = e.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, `rgba(255,255,255,1)`);
    gr.addColorStop(0.18, `rgba(${g},1)`);
    gr.addColorStop(0.45, `rgba(${g},.35)`);
    gr.addColorStop(1, `rgba(${g},0)`);
    e.fillStyle = gr;
    e.fillRect(0, 0, 32, 32);
  }
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    c!.width = W;
    c!.height = H;
    buildHex();
    buildGrid();
  }

  function draw(t: number) {
    x!.clearRect(0, 0, W, H);
    const gr = x!.createRadialGradient(W * (0.3 + mx * 0.4), H * (0.25 + my * 0.2), 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    gr.addColorStop(0, `rgba(${g},.22)`);
    gr.addColorStop(0.5, `rgba(${g},.05)`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    x!.fillStyle = gr;
    x!.fillRect(0, 0, W, H);

    // aurora blobs
    if (auA && auB) {
      x!.globalAlpha = 0.5;
      for (const a of AU) {
        const R = Math.max(W, H) * a.r * (1 + 0.08 * Math.sin(t * a.s * 2 + a.p));
        const cx = W * (a.x + 0.12 * Math.sin(t * a.s + a.p));
        const cy = H * (a.y + 0.08 * Math.cos(t * a.s * 1.3 + a.p));
        x!.drawImage(a.b ? auB : auA, cx - R, cy - R, R * 2, R * 2);
      }
      x!.globalAlpha = 1;
    }

    // perspective floor
    if (grid) {
      x!.drawImage(grid, 0, horizon);
      const gh = H - horizon;
      const phase = (t / 2400) % 1;
      const rows = mobile ? 9 : 13;
      x!.lineWidth = 1;
      for (let i = 0; i < rows; i++) {
        const z = (i + phase) / rows;
        const yy = horizon + gh * z * z;
        x!.strokeStyle = `rgba(${g},${(z * 0.38).toFixed(3)})`;
        x!.beginPath();
        x!.moveTo(0, yy);
        x!.lineTo(W, yy);
        x!.stroke();
      }
      const hz = x!.createLinearGradient(0, horizon - 2, 0, horizon + 2);
      hz.addColorStop(0, `rgba(${g},0)`);
      hz.addColorStop(0.5, `rgba(${g},.55)`);
      hz.addColorStop(1, `rgba(${g},0)`);
      x!.fillStyle = hz;
      x!.fillRect(0, horizon - 2, W, 4);
    }

    // diagonal light beam sweeping across every ~10s
    {
      const cyc = (t % 10000) / 10000;
      if (cyc < 0.35) {
        const bx = -W * 0.4 + (cyc / 0.35) * W * 1.8;
        x!.save();
        x!.translate(bx, 0);
        x!.rotate(0.35);
        const bg = x!.createLinearGradient(-90, 0, 90, 0);
        bg.addColorStop(0, `rgba(${g2},0)`);
        bg.addColorStop(0.5, `rgba(${g2},.07)`);
        bg.addColorStop(1, `rgba(${g2},0)`);
        x!.fillStyle = bg;
        x!.fillRect(-90, -H, 180, H * 3);
        x!.restore();
      }
    }

    // shooting streaks
    x!.lineCap = "round";
    for (const st of ST) {
      st.life += 1;
      if (st.life === 1) {
        st.x = Math.random() * W * 0.8;
        st.y = Math.random() * H * 0.45;
        st.v = 6 + Math.random() * 6;
        st.l = 80 + Math.random() * 90;
      }
      if (st.life > 0) {
        st.x += st.v;
        st.y += st.v * 0.45;
        const sg = x!.createLinearGradient(st.x - st.l, st.y - st.l * 0.45, st.x, st.y);
        sg.addColorStop(0, `rgba(${g},0)`);
        sg.addColorStop(1, `rgba(255,255,255,.85)`);
        x!.strokeStyle = sg;
        x!.lineWidth = 1.6;
        x!.beginPath();
        x!.moveTo(st.x - st.l, st.y - st.l * 0.45);
        x!.lineTo(st.x, st.y);
        x!.stroke();
        if (st.x > W + st.l || st.y > H) st.life = -(120 + Math.random() * 360);
      }
    }

    // dragon-scale field (pre-rendered, drifting + breathing)
    if (hex) {
      const off = ((t / 60) * 0.3) % S_HEX;
      x!.globalAlpha = 0.55 + 0.45 * Math.sin(t / 1400);
      x!.drawImage(hex, -S_HEX + off, -S_HEX * 0.75);
      x!.globalAlpha = 1;
    }

    // horned eye-glow slits
    const ey = H * 0.32 + Math.sin(t / 1800) * 8;
    for (const ex of [W * 0.36, W * 0.64]) {
      x!.save();
      x!.translate(ex, ey);
      x!.rotate(ex < W / 2 ? 0.18 : -0.18);
      const eg = x!.createRadialGradient(0, 0, 0, 0, 0, 70);
      eg.addColorStop(0, `rgba(${g},.55)`);
      eg.addColorStop(1, "rgba(0,0,0,0)");
      x!.fillStyle = eg;
      x!.fillRect(-70, -70, 140, 140);
      x!.fillStyle = `rgba(${g},.9)`;
      x!.beginPath();
      x!.ellipse(0, 0, 26, 3.6 + Math.sin(t / 700) * 0.8, 0, 0, 6.28);
      x!.fill();
      x!.restore();
    }

    // rising embers (sprite, no shadowBlur)
    if (ember) {
      for (const p of P) {
        p.y -= p.s;
        p.x += Math.sin(t / 900 + p.w) * 0.5;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
        const sz = p.r * 7;
        x!.globalAlpha = 0.3 + 0.6 * Math.abs(Math.sin(t / 600 + p.w));
        x!.drawImage(ember, p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      x!.globalAlpha = 1;
    }

    // fire tongues at the bottom (fire theme)
    if (theme === "fire") {
      const step = mobile ? 40 : 28;
      for (let f = 0; f < W + step; f += step) {
        const fh = 60 + 40 * Math.sin(t / 260 + f * 0.05) + 30 * Math.sin(t / 170 + f * 0.11);
        const fg = x!.createLinearGradient(0, H, 0, H - fh * 1.6);
        fg.addColorStop(0, "rgba(255,40,0,.55)");
        fg.addColorStop(0.5, "rgba(255,140,0,.25)");
        fg.addColorStop(1, "rgba(255,210,0,0)");
        x!.fillStyle = fg;
        x!.beginPath();
        x!.moveTo(f - 20, H);
        x!.quadraticCurveTo(f, H - fh * 1.6, f + step + 20, H);
        x!.fill();
      }
    }

    x!.strokeStyle = `rgba(${g},.22)`;
    for (const q of SQ) {
      q.a += q.v;
      x!.save();
      x!.translate(q.x + Math.sin(t / 3000 + q.a) * 30, q.y + Math.cos(t / 3500 + q.a) * 20);
      x!.rotate(q.a);
      x!.strokeRect(-q.z / 2, -q.z / 2, q.z, q.z);
      x!.restore();
    }
  }

  function loop(t: number) {
    raf = requestAnimationFrame(loop);
    if (t - last < frameMs - 2) return;
    last = t;
    draw(t);
  }

  resize();
  buildEmber();
  buildAurora();

  const onResize = () => { resize(); if (reduce) draw(0); };
  window.addEventListener("resize", onResize, { passive: true });
  const onMove = (e: PointerEvent) => { mx = e.clientX / W; my = e.clientY / H; };
  if (!mobile) window.addEventListener("pointermove", onMove, { passive: true });

  const mo = new MutationObserver(() => {
    theme = document.documentElement.getAttribute("data-zx") || "fire";
    g = THEME_RGB[theme] ?? FIRE_RGB;
    g2 = THEME_RGB2[theme] ?? FIRE_RGB2;
    buildHex();
    buildGrid();
    buildEmber();
    buildAurora();
    if (reduce) draw(0);
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-zx"] });

  const onVis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reduce) raf = requestAnimationFrame(loop);
  };
  document.addEventListener("visibilitychange", onVis);

  // Paint the first frame synchronously so the animated layer appears with no gap.
  draw(performance.now());
  document.documentElement.classList.add("zx-live");
  if (!reduce) raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    document.documentElement.classList.remove("zx-live");
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("visibilitychange", onVis);
    mo.disconnect();
  };
}

/** Inline boot script: runs the moment the browser parses the canvas. */
export const ZX_BG_BOOT = `(${startZxBackground.toString()})(document.getElementById("zx-bg"))`;

/** Background layers. Rendered in the HTML shell; the inline script animates the canvas. */
export function ZxBackgroundLayers() {
  return (
    <>
      <div id="zx-backdrop" aria-hidden="true" />
      <div id="zx-vignette" aria-hidden="true" />
      <canvas id="zx-bg" aria-hidden="true" suppressHydrationWarning />
      <script dangerouslySetInnerHTML={{ __html: ZX_BG_BOOT }} />
    </>
  );
}

/** Safety net: if the inline script was blocked, start the animation after hydration. */
export function ZxBackground() {
  useEffect(() => {
    startZxBackground(document.getElementById("zx-bg") as HTMLCanvasElement | null);
  }, []);
  return null;
}
