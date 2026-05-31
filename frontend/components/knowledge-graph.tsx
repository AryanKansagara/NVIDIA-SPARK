"use client";

import { useEffect, useRef } from "react";

/**
 * Animated knowledge-graph constellation for the landing hero.
 * Ported from the self-contained canvas script in meridian-prototype.html and
 * adapted to a React ref + useEffect lifecycle. Purely decorative.
 */
export function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rgba = (hex: string, a: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    };

    const C = { accent: "#5266EB", green: "#34D399", amber: "#FBBF24", red: "#F87171" };

    type Node = {
      id: string;
      label: string;
      sub: string;
      color: string;
      r: number;
      rx: number;
      ry: number;
      amp: number;
      period: number;
      px: number;
      py: number;
    };

    const NODES: Node[] = [
      { id: "center", label: "", sub: "", color: C.accent, r: 16, rx: 0.82, ry: 0.5, amp: 0, period: 12, px: 0, py: 0 },
      { id: "heritage", label: "Heritage", sub: "Part IV", color: C.red, r: 8, rx: 0.69, ry: 0.28, amp: 22, period: 11, px: 0, py: 0 },
      { id: "ltt", label: "Land Transfer", sub: "LTT", color: C.green, r: 8, rx: 0.74, ry: 0.72, amp: 20, period: 14, px: 0, py: 0 },
      { id: "tax", label: "Property Tax", sub: "10yr", color: C.amber, r: 8, rx: 0.93, ry: 0.68, amp: 22, period: 12, px: 0, py: 0 },
      { id: "flood", label: "Flood Zone", sub: "TRCA", color: C.amber, r: 8, rx: 0.95, ry: 0.24, amp: 18, period: 9, px: 0, py: 0 },
      { id: "permits", label: "Active Permits", sub: "structural", color: C.red, r: 8, rx: 0.88, ry: 0.8, amp: 24, period: 13, px: 0, py: 0 },
      { id: "dev", label: "Dev Pressure", sub: "nearby", color: C.amber, r: 8, rx: 0.70, ry: 0.5, amp: 20, period: 10, px: 0, py: 0 },
      { id: "mortgage", label: "Mortgage", sub: "renewal", color: C.green, r: 8, rx: 0.96, ry: 0.44, amp: 16, period: 16, px: 0, py: 0 },
    ];
    NODES.forEach((n, i) => {
      n.px = i * 0.83;
      n.py = i * 0.83 + 1.3 + i * 0.37;
    });

    const PULSES = NODES.slice(1).map((_, i) => [
      { t: (i * 0.18) % 1 },
      { t: ((i * 0.18) + 0.5) % 1 },
    ]);
    const SPEED = 0.00022;

    let T0 = 0;
    const CENTER_IN = 420;
    const EDGE_DUR = 420;
    const NODE_POP = 340;
    const STAGGER = 150;
    const introStart = (i: number) => CENTER_IN * 0.6 + (i - 1) * STAGGER;

    const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeOutBack = (t: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };

    const mouse: { x: number | null; y: number | null; tx: number | null; ty: number | null } = {
      x: null, y: null, tx: null, ty: null,
    };
    let pvx = 0;
    let pvy = 0;
    let W = 0;
    let H = 0;
    let raf = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas!.offsetWidth;
      H = canvas!.offsetHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function isLight() {
      return document.documentElement.classList.contains("light-mode");
    }

    function nodePos(n: Node, t: number, now: number, i: number) {
      if (n.id === "center") return { x: n.rx * W + pvx, y: n.ry * H + pvy };
      const s = t / 1000;
      const TAU = 2 * Math.PI;
      const settle = clamp01((now - (T0 + introStart(i) + NODE_POP)) / 1200);
      const amp = n.amp * settle;
      const depth = n.r / 16 + 0.35;
      return {
        x: n.rx * W + Math.sin(s * TAU / n.period + n.px) * amp + pvx * depth,
        y: n.ry * H + Math.cos(s * TAU / n.period + n.py) * amp * 0.6 + pvy * depth,
      };
    }

    function nodeIntro(i: number, now: number) {
      if (REDUCED || !T0) return { scale: 1, edge: 1, sub: 1 };
      if (i === 0) {
        const p = clamp01((now - T0) / CENTER_IN);
        return { scale: easeOutBack(p), edge: 1, sub: 1 };
      }
      const start = T0 + introStart(i);
      const edge = easeOutCubic(clamp01((now - start) / EDGE_DUR));
      const popT = clamp01((now - (start + EDGE_DUR * 0.6)) / NODE_POP);
      const scale = popT <= 0 ? 0 : easeOutBack(popT);
      const sub = clamp01((now - (start + EDGE_DUR * 0.6 + NODE_POP)) / 320);
      return { scale, edge, sub };
    }

    function drawEdge(ax: number, ay: number, bx: number, by: number, light: boolean, progress: number, glow: number) {
      const ex = bx + (ax - bx) * progress;
      const ey = by + (ay - by) * progress;
      ctx!.save();
      ctx!.beginPath();
      ctx!.moveTo(bx, by);
      ctx!.lineTo(ex, ey);
      const base = light ? 0.13 : 0.09;
      ctx!.strokeStyle = light
        ? `rgba(100,80,55,${base + glow * 0.22})`
        : `rgba(175,178,206,${base + glow * 0.18})`;
      ctx!.lineWidth = 0.8 + glow * 1.0;
      ctx!.stroke();
      ctx!.restore();
    }

    function drawPulse(ax: number, ay: number, bx: number, by: number, t: number, color: string) {
      const te = t * t * (3 - 2 * t);
      const x = ax + (bx - ax) * te;
      const y = ay + (by - ay) * te;
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx!.fillStyle = rgba(color, 0.7 * Math.sin(t * Math.PI));
      ctx!.fill();
      ctx!.restore();
    }

    function drawHouseIcon(cx: number, cy: number, r: number, color: string) {
      const hw = r * 0.6;
      const bh = r * 0.42;
      const rh = r * 0.58;
      const bodyBottom = bh;
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.beginPath();
      ctx!.moveTo(0, -bh - rh);
      ctx!.lineTo(hw + r * 0.12, -bh);
      ctx!.lineTo(-hw - r * 0.12, -bh);
      ctx!.closePath();
      ctx!.fillStyle = "rgba(255,255,255,0.90)";
      ctx!.fill();
      ctx!.beginPath();
      ctx!.rect(-hw, -bh, hw * 2, bodyBottom + bh);
      ctx!.fillStyle = "rgba(255,255,255,0.72)";
      ctx!.fill();
      const dw = hw * 0.38;
      const dh = (bodyBottom + bh) * 0.44;
      ctx!.beginPath();
      ctx!.rect(-dw / 2, bodyBottom + bh - dh, dw, dh);
      ctx!.fillStyle = rgba(color, 0.88);
      ctx!.fill();
      ctx!.restore();
    }

    function drawNode(n: Node, p: { x: number; y: number }, light: boolean, intro: { scale: number; sub: number }, glow: number) {
      const { color, label, sub, id } = n;
      const isCenter = id === "center";
      const scale = intro ? intro.scale : 1;
      if (scale <= 0.01) return;
      const r = n.r * scale;
      glow = glow || 0;

      const hR = r * (isCenter ? 5.0 : 3.8) * (1 + glow * 0.25);
      const haloBase = isCenter ? 0.14 : 0.09;
      const gr = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, hR);
      gr.addColorStop(0, rgba(color, haloBase * (1 + glow * 1.6)));
      gr.addColorStop(1, rgba(color, 0));
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, hR, 0, Math.PI * 2);
      ctx!.fillStyle = gr;
      ctx!.fill();
      ctx!.restore();

      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (isCenter) {
        ctx!.fillStyle = rgba(color, 0.88);
      } else {
        ctx!.fillStyle = light ? "rgba(253,250,246,0.94)" : "rgba(30,30,42,0.93)";
        ctx!.strokeStyle = rgba(color, 0.72 + glow * 0.28);
        ctx!.lineWidth = 1.5 + glow * 0.8;
      }
      ctx!.fill();
      if (!isCenter) ctx!.stroke();
      ctx!.restore();

      if (isCenter) {
        drawHouseIcon(p.x, p.y, r, color);
      } else {
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, r * 0.32, 0, Math.PI * 2);
        ctx!.fillStyle = rgba(color, 0.85);
        ctx!.fill();
        ctx!.restore();
      }

      const tx = isCenter ? p.x : p.x - n.r - 12;
      const align = isCenter ? "center" : "right";
      const ly1 = isCenter ? p.y - n.r - 24 : p.y - 3;
      const ly2 = isCenter ? p.y - n.r - 7 : p.y + 16;
      const tCol = light ? "rgba(10,15,30,0.95)" : "rgba(230,230,240,0.95)";
      const labelA = intro ? intro.scale : 1;
      const subA = intro ? intro.sub : 1;

      ctx!.save();
      ctx!.textAlign = align as CanvasTextAlign;
      ctx!.globalAlpha = clamp01(labelA);
      ctx!.font = `600 14px var(--font-dm-sans), system-ui, sans-serif`;
      ctx!.fillStyle = tCol;
      ctx!.fillText(label, tx, ly1);
      if (sub) {
        ctx!.globalAlpha = clamp01(subA);
        ctx!.font = `500 12px var(--font-geist-mono), monospace`;
        ctx!.fillStyle = rgba(color, light ? 0.95 : 0.90);
        ctx!.fillText(sub, tx, ly2);
      }
      ctx!.restore();
    }

    function frame(now: number) {
      if (!T0) T0 = now;
      const t = REDUCED ? 0 : now;
      const light = isLight();
      if (W !== canvas!.offsetWidth || H !== canvas!.offsetHeight) resize();

      if (!REDUCED && mouse.tx != null) {
        if (mouse.x == null) {
          mouse.x = mouse.tx;
          mouse.y = mouse.ty;
        }
        mouse.x += (mouse.tx - mouse.x!) * 0.08;
        mouse.y! += (mouse.ty! - mouse.y!) * 0.08;
      }
      pvx = !REDUCED && mouse.x != null ? (mouse.x - W * 0.82) * 0.045 : pvx * 0.9;
      pvy = !REDUCED && mouse.y != null ? (mouse.y - H * 0.3) * 0.045 : pvy * 0.9;

      ctx!.clearRect(0, 0, W, H);

      const positions = NODES.map((n, i) => nodePos(n, t, now, i));
      const cp = positions[0];
      const intros = NODES.map((_, i) => nodeIntro(i, now));

      const glows = positions.map((p) => {
        if (REDUCED || mouse.x == null) return 0;
        return clamp01(1 - Math.hypot(p.x - mouse.x!, p.y - mouse.y!) / 150);
      });

      for (let i = 1; i < NODES.length; i++) {
        if (intros[i].edge <= 0) continue;
        drawEdge(positions[i].x, positions[i].y, cp.x, cp.y, light, intros[i].edge, glows[i]);
      }

      if (!REDUCED) {
        for (let i = 1; i < NODES.length; i++) {
          if (intros[i].edge < 1) continue;
          for (const p of PULSES[i - 1]) {
            p.t = (p.t + SPEED) % 1;
            drawPulse(positions[i].x, positions[i].y, cp.x, cp.y, p.t, NODES[i].color);
          }
        }
      }

      for (let i = 1; i < NODES.length; i++) drawNode(NODES[i], positions[i], light, intros[i], glows[i]);
      drawNode(NODES[0], cp, light, intros[0], glows[0]);

      raf = requestAnimationFrame(frame);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.tx = e.clientX - rect.left;
      mouse.ty = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.tx = mouse.ty = mouse.x = mouse.y = null;
    };
    if (!REDUCED) {
      canvas.parentElement?.addEventListener("pointermove", onMove);
      canvas.parentElement?.addEventListener("pointerleave", onLeave);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
      canvas.parentElement?.removeEventListener("pointermove", onMove);
      canvas.parentElement?.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
    />
  );
}
