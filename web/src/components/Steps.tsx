import { useEffect, useState } from "react";
import type { Analysis } from "../types";
import { Chart, type Dot } from "./Chart";

const P = 4294967311;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const hue = (v: number) => Math.round((v / P) * 360);

function useTicker(max: number, ms: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % Math.max(max, 1)), ms);
    return () => clearInterval(id);
  }, [max, ms]);
  return i;
}
function useReady() {
  const [r, setR] = useState(false);
  useEffect(() => { const id = setTimeout(() => setR(true), 80); return () => clearTimeout(id); }, []);
  return r;
}

export function StepDocument({ a }: { a: Analysis }) {
  const n = a.normalize;
  return (
    <>
      <div className="two">
        <div className="box"><h4>Original · {n.original_chars} caracteres</h4><p className="txt">{n.original}</p></div>
        <div className="arrow">→</div>
        <div className="box"><h4>Normalizado · {n.normalized_chars} caracteres</h4><p className="txt mono">{n.normalized}</p></div>
      </div>
      <p className="note">Minúsculas, sin tildes, y toda secuencia de signos o espacios pasa a un solo espacio.</p>
    </>
  );
}

export function StepShingles({ a }: { a: Analysis }) {
  const k = a.params.k;
  const norm = a.normalize.normalized.slice(0, 56);
  const max = Math.max(norm.length - k + 1, 1);
  const i = useTicker(max, 450);
  return (
    <>
      <div className="window mono" aria-label="Ventana deslizante de k letras">
        {norm.split("").map((c, j) => (
          <span key={j} className={j >= i && j < i + k ? "win" : ""}>{c === " " ? "·" : c}</span>
        ))}
      </div>
      <p className="note">Ventana de k = {k} letras: <b className="mono">«{norm.slice(i, i + k)}»</b>. El documento tiene <b>{a.shingles.total}</b> shingles únicos.</p>
      <div className="chips">
        {a.shingles.sample.map((s, j) => (
          <span key={s.text} className={`chip pop ${s.shared ? "shared" : ""}`} style={{ animationDelay: `${j * 25}ms` }}>{s.text.replace(/ /g, "·")}</span>
        ))}
      </div>
      {a.best && <p className="legend"><span className="chip shared">verde</span> shingle que también aparece en «{a.best.title}»</p>}
    </>
  );
}

export function StepFingerprints({ a }: { a: Analysis }) {
  return (
    <>
      <div className="rows">
        {a.shingles.sample.slice(0, 10).map((s, j) => (
          <div key={s.text} className="row pop" style={{ animationDelay: `${j * 70}ms` }}>
            <span className={`chip ${s.shared ? "shared" : ""}`}>{s.text.replace(/ /g, "·")}</span>
            <span className="arrow">→</span>
            <span className="mono hex">0x{s.value.toString(16).padStart(8, "0")}</span>
            <span className="bits" aria-hidden>
              {s.value.toString(2).padStart(32, "0").split("").map((b, q) => <i key={q} className={b === "1" ? "on" : ""} />)}
            </span>
          </div>
        ))}
      </div>
      <p className="note">Cada shingle se hashea a un entero de 32 bits (0 … 2³²−1): 4 bytes sin importar el valor de k.</p>
    </>
  );
}

export function StepSignature({ a }: { a: Analysis }) {
  const sig = a.signature.values;
  return (
    <>
      <div className="cards">
        {a.signature.explain.map((e) => (
          <div key={e.index} className="card pop" style={{ animationDelay: `${e.index * 150}ms` }}>
            <h4>h<sub>{e.index + 1}</sub>(x) = ({e.a}·x + {e.b}) mod p</h4>
            <p>Mínimo entre todos los shingles: <b className="mono">«{e.min_text.replace(/ /g, "·")}»</b></p>
            <p className="mono">SIG[{e.index + 1}] = {e.value}</p>
          </div>
        ))}
      </div>
      <h4>Firma del documento · n = {a.params.n} valores</h4>
      <div className="strip">
        {sig.map((v, i) => <i key={i} title={`SIG[${i + 1}] = ${v}`} style={{ background: `hsl(${hue(v)} 65% 55%)`, animationDelay: `${i * 8}ms` }} className="pop" />)}
      </div>
      {a.best && (
        <>
          <h4>Firma de «{a.best.title}»</h4>
          <div className="strip">
            {a.best.signature.map((v, i) => (
              <i key={i} title={`SIG[${i + 1}] = ${v}`} className={`pop ${v === sig[i] ? "eq" : ""}`} style={{ background: `hsl(${hue(v)} 65% 55%)`, animationDelay: `${i * 8}ms` }} />
            ))}
          </div>
          <p className="note">Las celdas con borde coinciden: {pct(a.best.est)} de la firma ≈ Jaccard estimado ({pct(a.best.exact)} real).</p>
        </>
      )}
    </>
  );
}

export function StepBands({ a }: { a: Analysis }) {
  const eq = new Set(a.best?.bands_equal ?? []);
  return (
    <>
      <p className="note">La firma se corta en <b>b = {a.params.b}</b> bandas de <b>r = {a.params.r}</b> filas. Cada banda se hashea a su propio arreglo de cubos.</p>
      <div className="bands">
        {a.bands.map((b) => (
          <div key={b.index} className={`band pop ${eq.has(b.index) ? "hit" : ""}`} style={{ animationDelay: `${b.index * 60}ms` }}>
            <span className="bn">banda {b.index + 1}</span>
            <span className="mono br">{b.rows.map((v) => v.toString(16).slice(-3)).join(" ")}</span>
            <span className="mono bk">#{b.key.slice(0, 6)}</span>
            <span className="bd">{b.docs.length ? `${b.docs.length} doc.` : "—"}</span>
          </div>
        ))}
      </div>
      {a.best && <p className="legend"><span className="chip shared">verde</span> banda idéntica a la de «{a.best.title}» ({a.best.bands_equal.length} de {a.params.b}).</p>}
    </>
  );
}

export function StepBuckets({ a }: { a: Analysis }) {
  const e = a.evaluation;
  const ready = useReady();
  const rows = [...a.candidates].sort((x, y) => Number(y.is_candidate) - Number(x.is_candidate) || y.bands.length - x.bands.length);
  return (
    <>
      <div className="funnel">
        <div className="fbar all" style={{ width: "100%" }}>{e.total_docs} documentos del banco</div>
        <div className="fbar cand" style={{ width: ready ? `${Math.max((e.candidates / Math.max(e.total_docs, 1)) * 100, 6)}%` : "0%" }}>{e.candidates} candidatos</div>
      </div>
      <div className="rows">
        {rows.map((c, j) => (
          <div key={c.id} className={`row pop ${c.is_candidate ? "cand" : "dim"}`} style={{ animationDelay: `${Math.min(j, 12) * 50}ms` }}>
            <span className="rt">{c.title}</span>
            <span className="dots">{Array.from({ length: a.params.b }, (_, q) => <i key={q} className={c.bands.includes(q) ? "on" : ""} />)}</span>
            <span className="tag">{c.is_candidate ? `${c.bands.length} banda(s)` : "nunca se compara"}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function StepVerify({ a }: { a: Analysis }) {
  const ready = useReady();
  const t = a.params.target;
  const rows = a.candidates.slice(0, 12);
  const bar = (v: number, cls: string) => (
    <span className="bar"><i className={cls} style={{ width: ready ? pct(v) : "0%" }} /><b className="tline" style={{ left: pct(t) }} /></span>
  );
  return (
    <>
      <table className="tbl">
        <thead><tr><th>Documento</th><th>Jaccard real</th><th>Estimado (firma)</th><th>P(cand.)</th><th>Resultado</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className={c.is_candidate ? "" : "dim"}>
              <td>{c.title}</td>
              <td>{bar(c.exact, "ex")}<span className="mono">{c.exact.toFixed(2)}</span></td>
              <td>{bar(c.est, "es")}<span className="mono">{c.est.toFixed(2)}</span></td>
              <td className="mono">{pct(c.p_theory)}</td>
              <td><span className={`badge ${c.verdict}`}>{c.verdict}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend">La línea vertical marca el objetivo ({t}). <b>TP</b> candidato similar · <b>FP</b> candidato no similar · <b>FN</b> similar que LSH no vio · <b>TN</b> descartado correctamente.</p>
    </>
  );
}

export function StepCurve({ a }: { a: Analysis }) {
  const e = a.evaluation;
  const col = { TP: "#1a9e72", FP: "#d23b3b", FN: "#e0952a", TN: "#8a928e" } as const;
  const dots: Dot[] = a.candidates.map((c) => ({
    x: c.exact, y: c.p_theory, color: col[c.verdict], label: `${c.title}: s=${c.exact}, P=${c.p_theory} (${c.verdict})`,
  }));
  return (
    <div className="two">
      <Chart curve={a.curve} target={a.params.target} dots={dots} />
      <div className="metrics">
        <div className="m"><b>{e.precision === null ? "—" : pct(e.precision)}</b><span>precisión</span></div>
        <div className="m"><b>{e.recall === null ? "—" : pct(e.recall)}</b><span>recall</span></div>
        <div className="m"><b>{e.FP}</b><span>falsos positivos</span></div>
        <div className="m"><b>{e.FN}</b><span>falsos negativos</span></div>
        <div className="m wide"><b>{e.brute_comparisons} → {e.candidates}</b><span>comparaciones exactas: fuerza bruta frente a candidatos</span></div>
        <p className="legend">Cada punto es un documento del banco sobre la curva teórica 1 − (1 − sʳ)ᵇ.</p>
      </div>
    </div>
  );
}

function Marked({ text, ranges }: { text: string; ranges: number[][] }) {
  const parts: JSX.Element[] = [];
  let pos = 0;
  ranges.forEach(([s, e], i) => {
    if (s > pos) parts.push(<span key={`t${i}`}>{text.slice(pos, s)}</span>);
    parts.push(<mark key={`m${i}`}>{text.slice(Math.max(s, pos), e)}</mark>);
    pos = Math.max(pos, e);
  });
  if (pos < text.length) parts.push(<span key="end">{text.slice(pos)}</span>);
  return <p className="txt mono">{parts}</p>;
}

export function StepHighlight({ a }: { a: Analysis }) {
  const b = a.best;
  if (!b) return <p className="note">El banco está vacío: sube o carga documentos para comparar.</p>;
  return (
    <>
      <p className="note"><b>{pct(b.exact)}</b> de similitud con «{b.title}» · {b.shared_count} shingles compartidos.</p>
      <div className="two">
        <div className="box"><h4>{a.query.title}</h4><Marked text={b.norm_query} ranges={b.ranges_query} /></div>
        <div className="box"><h4>{b.title}</h4><Marked text={b.norm_doc} ranges={b.ranges_doc} /></div>
      </div>
    </>
  );
}
