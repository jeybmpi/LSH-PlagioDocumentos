import { useState } from "react";
import { evaluate } from "../api";
import type { Evaluation, Settings } from "../types";
import { Chart, type Dot } from "./Chart";

export function EvalPanel({ settings, docCount }: { settings: Settings; docCount: number }) {
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    setBusy(true); setErr("");
    try { setEv(await evaluate(settings)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const col = { TP: "#1a9e72", FP: "#d23b3b", FN: "#e0952a", TN: "#8a928e" } as const;
  const dots: Dot[] = ev ? ev.pairs.slice(0, 400).map((p, i) => ({
    x: p.s, y: p.candidate ? 0.97 - (i % 5) * 0.015 : 0.03 + (i % 5) * 0.015, color: col[p.verdict],
    label: `${p.a} ↔ ${p.b}: s=${p.s} (${p.verdict})`,
  })) : [];
  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  return (
    <section className="panel">
      <header>
        <div><h3>Evaluación del banco completo</h3><small>Todos contra todos: LSH frente a fuerza bruta ({docCount} documentos)</small></div>
        <div className="ctl"><button className="primary" onClick={run} disabled={busy || docCount < 2}>{busy ? "Evaluando…" : "Evaluar banco"}</button></div>
      </header>
      {err && <p className="error">{err}</p>}
      {ev && (
        <div className="body">
          <div className="metrics row4">
            <div className="m"><b>{ev.total_pairs}</b><span>pares posibles</span></div>
            <div className="m"><b>{ev.candidate_pairs}</b><span>pares candidatos</span></div>
            <div className="m"><b>{pct(ev.precision)}</b><span>precisión</span></div>
            <div className="m"><b>{pct(ev.recall)}</b><span>recall</span></div>
            <div className="m"><b>{ev.fp}</b><span>falsos positivos</span></div>
            <div className="m"><b>{ev.fn}</b><span>falsos negativos</span></div>
            <div className="m"><b>{ev.ms_lsh} ms</b><span>LSH (índice y colisiones)</span></div>
            <div className="m"><b>{ev.ms_brute} ms</b><span>Jaccard exacto, todos los pares</span></div>
          </div>
          <div className="funnel">
            <div className="fbar all" style={{ width: "100%" }}>{ev.total_pairs} pares</div>
            <div className="fbar cand" style={{ width: `${Math.max((ev.candidate_pairs / Math.max(ev.total_pairs, 1)) * 100, 6)}%` }}>{ev.candidate_pairs}</div>
          </div>
          <Chart curve={ev.curve} target={ev.params.target} dots={dots} />
          <p className="legend">Arriba, pares que LSH marcó candidatos; abajo, los descartados. Su posición horizontal es el Jaccard real: la nube sigue la curva en S teórica.</p>
        </div>
      )}
    </section>
  );
}
