"use client";

import { useEffect, useRef } from "react";

// Labeled knowledge-graph canvas — ported from the prototype. A house-icon
// hub with 7 labeled risk/cost nodes orbiting in the right half, thin spokes,
// inward pulses, glow halos, and light/dark-aware colors.

type GraphNode = {
  id: string;
  label: string;
  sub: string;
  color: string;
  r: number;
  rx: number;
  ry: number;
  amp: number;
  period: number;
  px?: number;
  py?: number;
};

const C = { accent: "#5266EB", green: "#34D399", amber: "#FBBF24", red: "#F87171" };

const NODES: GraphNode[] = [
  { id: "center", label: "", sub: "", color: C.accent, r: 16, rx: 0.73, ry: 0.3, amp: 0, period: 12 },
  { id: "heritage", label: "Heritage", sub: "Part IV", color: C.red, r: 8, rx: 0.56, ry: 0.12, amp: 22, period: 11 },
  { id: "ltt", label: "Land Transfer", sub: "$28,950", color: C.green, r: 8, rx: 0.63, ry: 0.52, amp: 20, period: 14 },
  { id: "tax", label: "Property Tax", sub: "$53,820", color: C.amber, r: 8, rx: 0.9, ry: 0.44, amp: 22, period: 12 },
  { id: "flood", label: "Flood Zone", sub: "Elevated", color: C.amber, r: 8, rx: 0.93, ry: 0.17, amp: 18, period: 9 },
  { id: "permits", label: "Active Permits", sub: "3 structural", color: C.red, r: 8, rx: 0.83, ry: 0.62, amp: 24, period: 13 },
  { id: "dev", label: "Dev Pressure", sub: "12 nearby", color: C.amber, r: 8, rx: 0.57, ry: 0.38, amp: 20, period: 10 },
  { id: "mortgage", label: "Mortgage", sub: "$547,000", color: C.green, r: 8, rx: 0.96, ry: 0.3, amp: 16, period: 16 },
];
NODES.forEach((n, i) => {
  n.px = i * 0.83;
  n.py = i * 0.83 + 1.3 + i * 0.37;
});

const SPEED = 0.00022;

function rgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pulses = NODES.slice(1).map((_, i) => [
      { t: (i * 0.18) % 1 },
      { t: (i * 0.18 + 0.5) % 1 },
    ]);

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

    function nodePos(n: GraphNode, t: number) {
      if (n.id === "center") return { x: n.rx * W, y: n.ry * H };
      const s = t / 1000;
      const TAU = 2 * Math.PI;
      return {
        x: n.rx * W + Math.sin((s * TAU) / n.period + (n.px ?? 0)) * n.amp,
        y: n.ry * H + Math.cos((s * TAU) / n.period + (n.py ?? 0)) * n.amp * 0.6,
      };
    }

    function drawEdge(ax: number, ay: number, bx: number, by: number, isLight: boolean) {
      ctx!.save();
      ctx!.beginPath();
      ctx!.moveTo(ax, ay);
      ctx!.lineTo(bx, by);
      ctx!.strokeStyle = isLight ? "rgba(100,80,55,0.13)" : "rgba(175,178,206,0.09)";
      ctx!.lineWidth = 0.8;
      ctx!.stroke();
      ctx!.restore();
    }

    function drawPulse(ax: number, ay: number, bx: number, by: number, t: number, color: string) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx!.fillStyle = rgba(color, 0.65 * Math.sin(t * Math.PI));
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

    function drawNode(n: GraphNode, p: { x: number; y: number }, isLight: boolean) {
      const { r, color, label, sub, id } = n;
      const isCenter = id === "center";

      const hR = r * (isCenter ? 5.0 : 3.8);
      const gr = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, hR);
      gr.addColorStop(0, rgba(color, isCenter ? 0.14 : 0.09));
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
        ctx!.fillStyle = isLight ? "rgba(253,250,246,0.94)" : "rgba(30,30,42,0.93)";
        ctx!.strokeStyle = rgba(color, 0.72);
        ctx!.lineWidth = 1.5;
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

      const tx = isCenter ? p.x : p.x - r - 8;
      const align = isCenter ? "center" : "right";
      const ly1 = isCenter ? p.y - r - 20 : p.y - 2;
      const ly2 = isCenter ? p.y - r - 7 : p.y + 13;
      const tCol = isLight ? "rgba(26,31,46,0.78)" : "rgba(195,195,204,0.62)";

      ctx!.save();
      ctx!.textAlign = align as CanvasTextAlign;
      ctx!.font = `500 11px 'DM Sans', system-ui, sans-serif`;
      ctx!.fillStyle = tCol;
      ctx!.fillText(label, tx, ly1);
      if (sub) {
        ctx!.font = `500 10px 'Geist Mono', 'Courier New', monospace`;
        ctx!.fillStyle = rgba(color, isLight ? 0.85 : 0.72);
        ctx!.fillText(sub, tx, ly2);
      }
      ctx!.restore();
    }

    function frame(ts: number) {
      const t = REDUCED ? 0 : ts;
      const isLight = document.documentElement.classList.contains("light-mode");
      if (W !== canvas!.offsetWidth || H !== canvas!.offsetHeight) resize();
      ctx!.clearRect(0, 0, W, H);

      const positions = NODES.map((n) => nodePos(n, t));
      const cp = positions[0];

      for (let i = 1; i < NODES.length; i++)
        drawEdge(positions[i].x, positions[i].y, cp.x, cp.y, isLight);

      if (!REDUCED)
        for (let i = 1; i < NODES.length; i++)
          for (const p of pulses[i - 1]) {
            p.t = (p.t + SPEED) % 1;
            drawPulse(positions[i].x, positions[i].y, cp.x, cp.y, p.t, NODES[i].color);
          }

      for (let i = 1; i < NODES.length; i++) drawNode(NODES[i], positions[i], isLight);
      drawNode(NODES[0], cp, isLight);

      if (!REDUCED) raf = requestAnimationFrame(frame);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    // Start once fonts are ready so labels render in the right typeface.
    const start = () => {
      if (REDUCED) frame(0);
      else raf = requestAnimationFrame(frame);
    };
    if (document.fonts?.ready) document.fonts.ready.then(start);
    else start();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.82]"
    />
  );
}
