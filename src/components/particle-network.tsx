"use client";

import { useEffect, useRef } from "react";

/**
 * Latar "jaringan jalan": titik = titik parkir, garis = ruas yang
 * menghubungkannya. Sekitar 10% titik berwarna aksen sebagai titik parkir
 * resmi. Ia sengaja dibuat redup — kalau menarik perhatian dari dua kartu
 * peran, ia gagal.
 */

type Dot = {
  x: number;
  y: number;
  /** arah gerak, selalu vektor satuan */
  dx: number;
  dy: number;
  /** laju dalam px per milidetik */
  speed: number;
  accent: boolean;
};

/** DPR 3 di HP menengah membunuh fill rate tanpa manfaat yang terlihat. */
const MAX_DPR = 2;
/** Jepit dt supaya titik tidak melompat setelah tab kembali dari background. */
const MAX_DT = 32;
/** Jumlah kelompok alfa untuk membatch garis: satu stroke per kelompok. */
const ALPHA_STEPS = 6;
const MAX_LINK_ALPHA = 0.3;
const CURSOR_RADIUS = 140;
/** Seberapa kuat kursor membelokkan arah titik. Halus, bukan menyedot. */
const CURSOR_TURN = 0.035;
const RESIZE_DEBOUNCE = 150;

type Rgb = readonly [number, number, number];

/** Hanya terpakai kalau token CSS gagal dibaca; senada dengan --ink-muted. */
const FALLBACK: Rgb = [76, 91, 118];

/** Baca token warna `#rrggbb` (atau `#rgb`) dari CSS jadi triplet RGB. */
function parseHex(value: string): Rgb {
  const hex = value.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  if (full.length !== 6) return FALLBACK;
  const parsed = Number.parseInt(full, 16);
  if (Number.isNaN(parsed)) return FALLBACK;
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/** Sel tetangga yang diperiksa agar tiap pasangan titik dinilai tepat sekali. */
const NEIGHBOR_CELLS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export function ParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Warna diambil dari token CSS, bukan hex yang ditempel di komponen.
    const rootStyles = getComputedStyle(document.documentElement);
    const mutedRgb = parseHex(rootStyles.getPropertyValue("--ink-muted"));
    const accentRgb = parseHex(rootStyles.getPropertyValue("--accent"));

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canHover = window.matchMedia("(hover: hover)");

    let width = 0;
    let height = 0;
    let linkDistance = 110;
    let dots: Dot[] = [];
    let frame = 0;
    let last = 0;
    let resizeTimer = 0;
    let pointerAttached = false;
    const pointer = { x: 0, y: 0, active: false };

    // Dipakai ulang tiap frame supaya tidak mengalokasi array baru terus.
    const buckets: number[][] = Array.from({ length: ALPHA_STEPS }, () => []);

    const createDot = (): Dot => {
      const angle = Math.random() * Math.PI * 2;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        speed: 0.006 + Math.random() * 0.01,
        accent: Math.random() < 0.1,
      };
    };

    /** Jumlah titik dihitung dari luas viewport, dengan batas atas. */
    const targetCount = (): number => {
      const area = width * height;
      return width >= 768
        ? Math.min(90, Math.round(area / 18000))
        : Math.min(34, Math.round(area / 34000));
    };

    const applySize = (): boolean => {
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;
      if (nextWidth === 0 || nextHeight === 0) return false;

      const prevWidth = width;
      const prevHeight = height;
      width = nextWidth;
      height = nextHeight;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // Sisa kode berpikir dalam CSS px, bukan piksel perangkat.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      linkDistance =
        width >= 768 ? Math.min(160, Math.min(width, height) * 0.18) : 110;

      // Skalakan posisi lama secara proporsional — mengacak ulang semuanya
      // terlihat seperti kedipan/bug.
      if (prevWidth > 0 && prevHeight > 0) {
        const scaleX = width / prevWidth;
        const scaleY = height / prevHeight;
        for (const dot of dots) {
          dot.x *= scaleX;
          dot.y *= scaleY;
        }
      }

      const target = targetCount();
      while (dots.length > target) dots.pop();
      while (dots.length < target) dots.push(createDot());

      return true;
    };

    const update = (dt: number) => {
      for (const dot of dots) {
        if (pointer.active) {
          const toX = pointer.x - dot.x;
          const toY = pointer.y - dot.y;
          const distance = Math.hypot(toX, toY);
          if (distance > 0.001 && distance < CURSOR_RADIUS) {
            // Tarikan hanya membelokkan arah; lajunya dinormalisasi kembali.
            // Tidak ada energi yang menumpuk, jadi titik tidak menggumpal dan
            // langsung melayang normal begitu kursor menjauh.
            const pull = CURSOR_TURN * (1 - distance / CURSOR_RADIUS);
            const nextX = dot.dx + (toX / distance) * pull;
            const nextY = dot.dy + (toY / distance) * pull;
            const length = Math.hypot(nextX, nextY) || 1;
            dot.dx = nextX / length;
            dot.dy = nextY / length;
          }
        }

        dot.x += dot.dx * dot.speed * dt;
        dot.y += dot.dy * dot.speed * dt;

        if (dot.x < 0) {
          dot.x = 0;
          dot.dx = -dot.dx;
        } else if (dot.x > width) {
          dot.x = width;
          dot.dx = -dot.dx;
        }
        if (dot.y < 0) {
          dot.y = 0;
          dot.dy = -dot.dy;
        } else if (dot.y > height) {
          dot.y = height;
          dot.dy = -dot.dy;
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      if (dots.length === 0 || linkDistance <= 0) return;

      for (const bucket of buckets) bucket.length = 0;

      // Grid spasial berukuran sel = linkDistance: tiap frame hanya
      // membandingkan titik dalam sel bertetangga, bukan O(n^2) ganda.
      const cell = linkDistance;
      const cols = Math.max(1, Math.ceil(width / cell));
      const rows = Math.max(1, Math.ceil(height / cell));
      const grid: Array<number[] | undefined> = new Array(cols * rows);

      for (let i = 0; i < dots.length; i += 1) {
        const dot = dots[i];
        const cx = Math.min(cols - 1, Math.max(0, Math.floor(dot.x / cell)));
        const cy = Math.min(rows - 1, Math.max(0, Math.floor(dot.y / cell)));
        const key = cy * cols + cx;
        const bucket = grid[key];
        if (bucket) bucket.push(i);
        else grid[key] = [i];
      }

      const limitSq = linkDistance * linkDistance;

      const consider = (a: number, b: number) => {
        const first = dots[a];
        const second = dots[b];
        const dx = first.x - second.x;
        const dy = first.y - second.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq >= limitSq) return;
        // Opasitas garis mengecil linear seiring jarak.
        const alpha = 1 - Math.sqrt(distanceSq) / linkDistance;
        const level = Math.min(ALPHA_STEPS - 1, Math.floor(alpha * ALPHA_STEPS));
        buckets[level].push(first.x, first.y, second.x, second.y);
      };

      for (let cy = 0; cy < rows; cy += 1) {
        for (let cx = 0; cx < cols; cx += 1) {
          const own = grid[cy * cols + cx];
          if (!own) continue;

          for (let i = 0; i < own.length; i += 1) {
            for (let j = i + 1; j < own.length; j += 1) {
              consider(own[i], own[j]);
            }
          }

          for (const [offsetX, offsetY] of NEIGHBOR_CELLS) {
            const nx = cx + offsetX;
            const ny = cy + offsetY;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            const other = grid[ny * cols + nx];
            if (!other) continue;
            for (const a of own) {
              for (const b of other) consider(a, b);
            }
          }
        }
      }

      // Satu stroke per kelompok alfa — jauh lebih murah daripada mengganti
      // strokeStyle untuk tiap segmen.
      ctx.lineWidth = 1;
      for (let level = 0; level < ALPHA_STEPS; level += 1) {
        const segments = buckets[level];
        if (segments.length === 0) continue;
        const alpha = ((level + 0.5) / ALPHA_STEPS) * MAX_LINK_ALPHA;
        ctx.strokeStyle = rgba(mutedRgb, alpha);
        ctx.beginPath();
        for (let i = 0; i < segments.length; i += 4) {
          ctx.moveTo(segments[i], segments[i + 1]);
          ctx.lineTo(segments[i + 2], segments[i + 3]);
        }
        ctx.stroke();
      }

      if (pointer.active) {
        ctx.strokeStyle = rgba(accentRgb, 0.22);
        ctx.beginPath();
        for (const dot of dots) {
          const dx = dot.x - pointer.x;
          const dy = dot.y - pointer.y;
          if (dx * dx + dy * dy >= CURSOR_RADIUS * CURSOR_RADIUS) continue;
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(dot.x, dot.y);
        }
        ctx.stroke();
      }

      // moveTo sebelum arc memutus subpath, jadi lingkaran tidak saling
      // tersambung garis walau digambar dalam satu path.
      ctx.fillStyle = rgba(mutedRgb, 0.55);
      ctx.beginPath();
      for (const dot of dots) {
        if (dot.accent) continue;
        ctx.moveTo(dot.x + 1.6, dot.y);
        ctx.arc(dot.x, dot.y, 1.6, 0, Math.PI * 2);
      }
      ctx.fill();

      ctx.fillStyle = rgba(accentRgb, 0.85);
      ctx.beginPath();
      for (const dot of dots) {
        if (!dot.accent) continue;
        ctx.moveTo(dot.x + 2.4, dot.y);
        ctx.arc(dot.x, dot.y, 2.4, 0, Math.PI * 2);
      }
      ctx.fill();
    };

    const loop = (now: number) => {
      const dt = Math.min(now - last, MAX_DT);
      last = now;
      update(dt);
      draw();
      frame = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (frame !== 0) return;
      last = performance.now();
      frame = window.requestAnimationFrame(loop);
    };

    const stop = () => {
      if (frame === 0) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const attachPointer = () => {
      if (pointerAttached || !canHover.matches) return;
      window.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      document.addEventListener("pointerleave", handlePointerLeave);
      pointerAttached = true;
    };

    const detachPointer = () => {
      if (!pointerAttached) return;
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      pointerAttached = false;
      pointer.active = false;
    };

    const applyMotionPreference = () => {
      if (reduceMotion.matches) {
        // Satu frame statis: tanpa rAF, tanpa interaksi kursor.
        stop();
        detachPointer();
        draw();
        return;
      }
      attachPointer();
      if (!document.hidden) start();
    };

    const handleHoverChange = () => {
      if (reduceMotion.matches) return;
      if (canHover.matches) attachPointer();
      else detachPointer();
    };

    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!applySize()) return;
        // Saat beranimasi, frame berikutnya sudah menggambar ulang sendiri.
        if (frame === 0) draw();
      }, RESIZE_DEBOUNCE);
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else if (!reduceMotion.matches) start();
    };

    applySize();
    applyMotionPreference();

    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibility);
    reduceMotion.addEventListener("change", applyMotionPreference);
    canHover.addEventListener("change", handleHoverChange);

    return () => {
      stop();
      window.clearTimeout(resizeTimer);
      detachPointer();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      reduceMotion.removeEventListener("change", applyMotionPreference);
      canHover.removeEventListener("change", handleHoverChange);
      dots = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
