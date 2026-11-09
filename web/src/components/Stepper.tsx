import { useEffect, useState, type ReactNode } from "react";
import type { Analysis } from "../types";
import * as S from "./Steps";

type Apply = (b: number, r: number) => void;
interface Def { title: string; book: string; render: (a: Analysis, apply?: Apply) => ReactNode }
const STEPS: Def[] = [
  { title: "Normalización", book: "3.2 · normalize()", render: (a) => <S.StepDocument a={a} /> },
  { title: "Shingles", book: "3.2 · k-shingles", render: (a) => <S.StepShingles a={a} /> },
  { title: "Fingerprints", book: "3.2.3 · Hash a 32 bits", render: (a) => <S.StepFingerprints a={a} /> },
  { title: "Firma minhash", book: "3.3 · Minhashing", render: (a) => <S.StepSignature a={a} /> },
  { title: "Bandas", book: "3.4.1 · b bandas de r filas", render: (a) => <S.StepBands a={a} /> },
  { title: "Cubos y candidatos", book: "3.4.1 · Colisiones", render: (a) => <S.StepBuckets a={a} /> },
  { title: "Verificación", book: "3.4.3 · Jaccard real y estimado", render: (a, apply) => <S.StepVerify a={a} onApply={apply} /> },
  { title: "Curva en S y errores", book: "3.4.2 · FP y FN", render: (a, apply) => <S.StepCurve a={a} onApply={apply} /> },
  { title: "Plagio detectado", book: "Pasajes compartidos", render: (a) => <S.StepHighlight a={a} /> },
];

export function Stepper({ analysis, onApply }: { analysis: Analysis; onApply?: Apply }) {
  const [i, setI] = useState(0);
  const [play, setPlay] = useState(false);
  useEffect(() => { setI(0); setPlay(false); }, [analysis]);
  useEffect(() => {
    if (!play) return;
    const id = setTimeout(() => (i === STEPS.length - 1 ? setPlay(false) : setI(i + 1)), 5500);
    return () => clearTimeout(id);
  }, [play, i]);
  const cur = STEPS[i];
  return (
    <div className="stepper">
      <nav className="rail" aria-label="Pasos del algoritmo">
        {STEPS.map((s, j) => (
          <button key={s.title} className={`${j === i ? "on" : ""} ${j < i ? "done" : ""}`} onClick={() => { setI(j); setPlay(false); }}>
            <b>{j + 1}</b><span>{s.title}</span>
          </button>
        ))}
      </nav>
      <section className="panel" key={i}>
        <header>
          <div><h3>{i + 1}. {cur.title}</h3><small>{cur.book}</small></div>
          <div className="ctl">
            <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} aria-label="Paso anterior">◀</button>
            <button onClick={() => setPlay(!play)}>{play ? "❚❚ Pausar" : "▶ Reproducir"}</button>
            <button onClick={() => setI(Math.min(STEPS.length - 1, i + 1))} disabled={i === STEPS.length - 1} aria-label="Paso siguiente">▶</button>
          </div>
        </header>
        <div className="body">{cur.render(analysis, onApply)}</div>
      </section>
    </div>
  );
}
