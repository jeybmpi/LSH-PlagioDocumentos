import type { Curve } from "../types";

export interface Dot { x: number; y: number; color: string; label: string }
const X = (v: number) => 64 + v * 540;
const Y = (v: number) => 330 - v * 290;

export function Chart({ curve, target, dots }: { curve: Curve; target: number; dots: Dot[] }) {
  const t = curve.threshold;
  const line = curve.points.map(([s, p], i) => `${i ? "L" : "M"}${X(s)} ${Y(p)}`).join("");
  const left = curve.points.filter(([s]) => s <= t);
  const right = curve.points.filter(([s]) => s >= t);
  const fp = `M${X(0)} ${Y(0)}` + left.map(([s, p]) => `L${X(s)} ${Y(p)}`).join("") + `L${X(t)} ${Y(0)}Z`;
  const fn = `M${X(t)} ${Y(1)}` + right.map(([s, p]) => `L${X(s)} ${Y(p)}`).join("") + `L${X(1)} ${Y(1)}Z`;
  return (
    <svg viewBox="0 0 640 400" className="chart" role="img" aria-label="Curva en S: probabilidad de ser candidato según la similitud">
      <path d={fp} className="zone-fp" />
      <path d={fn} className="zone-fn" />
      <path d={`M${X(0)} ${Y(0)}H${X(1)}M${X(0)} ${Y(0)}V${Y(1)}`} className="axis" />
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <text x={X(v)} y={356} textAnchor="middle" className="tick">{v}</text>
          <text x={52} y={Y(v) + 5} textAnchor="end" className="tick">{v}</text>
        </g>
      ))}
      <text x={X(0.5)} y={388} textAnchor="middle" className="tick">similitud de Jaccard (s)</text>
      <text x={14} y={Y(0.5)} className="tick" transform={`rotate(-90 14 ${Y(0.5)})`} textAnchor="middle">P(candidato)</text>
      <path d={line} className="curve" pathLength={1} />
      <line x1={X(t)} x2={X(t)} y1={Y(1)} y2={Y(0)} className="thr" />
      <text x={X(t)} y={32} textAnchor="middle" className="tick">t ≈ {t.toFixed(2)}</text>
      <line x1={X(target)} x2={X(target)} y1={Y(1)} y2={Y(0)} className="tgt" />
      <text x={X(target)} y={22} textAnchor="middle" className="tick tgt-t">objetivo {target}</text>
      <text x={X(t / 2)} y={Y(0) - 10} textAnchor="middle" className="zl-fp">FP</text>
      <text x={X((1 + t) / 2)} y={Y(1) + 28} textAnchor="middle" className="zl-fn">FN</text>
      {dots.map((d, i) => (
        <circle key={i} cx={X(d.x)} cy={Y(d.y)} r={7} fill={d.color} className="dot" style={{ animationDelay: `${i * 40}ms` }}>
          <title>{d.label}</title>
        </circle>
      ))}
    </svg>
  );
}
