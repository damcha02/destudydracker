import { useMemo } from "react";

const BLOSSOMS = [
  "/196-1963264_cherry-blossom-free-icon-flowey-i-am-not-cute.png",
  "/flower-flowers-sakura-cherryblossom-tumblr-kawaii-ftest-sakura-flower-png-kawaii-115628518804pkqn9p63w.png",
];

type ScatterDot = {
  src: string;
  left: number;
  top: number;
  size: number;
  opacity: number;
  rotate: number;
  blur: number;
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function SakuraScatter() {
  const dots = useMemo<ScatterDot[]>(() => {
    const rnd = mulberry32(0x534b5552);
    const out: ScatterDot[] = [];
    const count = 10;
    for (let i = 0; i < count; i += 1) {
      out.push({
        src: BLOSSOMS[i % BLOSSOMS.length],
        left: 4 + rnd() * 88,
        top: 6 + rnd() * 82,
        size: 18 + rnd() * 26,
        opacity: 0.09 + rnd() * 0.07,
        rotate: rnd() * 360,
        blur: rnd() > 0.6 ? 0.6 : 0,
      });
    }
    return out;
  }, []);

  return (
    <div
      aria-hidden="true"
      className="sakura-scatter"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {dots.map((d, idx) => (
        <img
          key={idx}
          src={d.src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity,
            transform: `rotate(${d.rotate}deg)`,
            filter: d.blur ? `blur(${d.blur}px)` : undefined,
            objectFit: "contain",
          }}
        />
      ))}
    </div>
  );
}
