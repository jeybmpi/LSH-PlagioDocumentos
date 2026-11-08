import { useEffect, useState } from "react";
import { tune } from "../api";
import type { Tune } from "../types";

const pc = (x: number) => (x >= 0.9995 ? "100%" : x < 0.0005 ? "0%" : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);

interface Props { initial: number; onApply: (b: number, r: number, threshold: number) => void }

export function TunePanel({ initial, onApply }: Props) {
  const [t, setT] = useState(Math.min(0.95, Math.max(0.05, initial)));
  const [data, setData] = useState<Tune | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      tune(t).then((d) => { if (live) { setData(d); setErr(""); } })
        .catch((e) => { if (live) setErr((e as Error).message); });
    }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [t]);

  return (
    <div className="tune-body">
      <label className="sl">
        <span>Umbral de similitud que quieres detectar</span>
        <input type="range" min={0.05} max={0.95} step={0.05} value={t} onChange={(e) => setT(Number(e.target.value))} />
        <b>{t.toFixed(2)}</b>
      </label>
      <p className="note">
        El umbral de LSH es t = (1/b)^(1/r). Para cada r se calcula el b que lo aproxima. Un r mayor separa mejor (curva más empinada), pero pide más bandas.
        «Ruido» es la probabilidad de que dos textos sin relación (similitud ≈ {data?.noise ?? 0.08}) lleguen a candidatos.
      </p>
      {err && <p className="error">{err}</p>}
      {data && !data.options.length && <p className="note">Con b ≤ 60 no hay una combinación que se acerque a ese umbral. Sube el umbral.</p>}
      {data && data.options.length > 0 && (
        <div className="tune-scroll">
          <table className="tbl">
            <thead>
              <tr><th>b</th><th>r</th><th>n</th><th>Umbral real</th><th>Ruido</th><th>Con s = {data.threshold.toFixed(2)}</th><th>Con s = {data.options[0].high}</th><th /></tr>
            </thead>
            <tbody>
              {data.options.map((o) => (
                <tr key={`${o.b}-${o.r}`} className={o.recommended ? "rec" : ""}>
                  <td>{o.b}</td><td>{o.r}</td><td>{o.n}</td><td>{o.t.toFixed(2)}</td>
                  <td>{pc(o.p_noise)}</td><td>{pc(o.p_threshold)}</td><td>{pc(o.p_high)}</td>
                  <td>
                    {o.recommended && <span className="badge TP">Recomendado</span>}{" "}
                    <button onClick={() => onApply(o.b, o.r, t)}>Usar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
