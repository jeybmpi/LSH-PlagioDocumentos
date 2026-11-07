import { useCallback, useEffect, useRef, useState } from "react";
import { analyze, extract, listDocs } from "./api";
import { DocBank } from "./components/DocBank";
import { EvalPanel } from "./components/EvalPanel";
import { Stepper } from "./components/Stepper";
import type { Analysis, DocBrief, Settings } from "./types";

export default function App() {
  const [docs, setDocs] = useState<DocBrief[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"bank" | "new">("bank");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("Documento nuevo");
  const [save, setSave] = useState(false);
  const [s, setS] = useState<Settings>({ k: 5, b: 20, r: 5, threshold: 0.5 });
  const [res, setRes] = useState<Analysis | null>(null);
  const [tab, setTab] = useState<"analysis" | "eval">("analysis");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const d = await listDocs();
    setDocs(d);
    setSelected((cur) => (cur && d.some((x) => x.id === cur) ? cur : d[0]?.id ?? null));
  }, []);
  useEffect(() => { refresh().catch((e) => setErr((e as Error).message)); }, [refresh]);

  const run = async () => {
    setBusy(true); setErr("");
    try {
      const body = mode === "bank" ? { ...s, doc_id: selected ?? undefined } : { ...s, text, title, save };
      const out = await analyze(body);
      setRes(out); setTab("analysis");
      if (out.saved) await refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const loadFile = async (f: File) => {
    try { const x = await extract(f); setText(x.content); setTitle(x.title); setMode("new"); setErr(""); }
    catch (e) { setErr((e as Error).message); }
  };
  const slider = (label: string, key: keyof Settings, min: number, max: number, step = 1) => (
    <label className="sl">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={s[key]} onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })} />
      <b>{s[key]}</b>
    </label>
  );
  const t = Math.pow(1 / s.b, 1 / s.r);
  const canRun = mode === "bank" ? !!selected : text.trim().length >= 10;

  return (
    <div className="app">
      <header className="top">
        <h1>Detector de plagio con LSH</h1>
        <p>Shingling · Minhash · Bandas · Verificación</p>
      </header>
      <div className="layout">
        <DocBank docs={docs} selected={selected} onSelect={(id) => { setSelected(id); setMode("bank"); }} onChange={refresh} />
        <main>
          <section className="panel form">
            <div className="seg" role="tablist">
              <button className={mode === "bank" ? "on" : ""} onClick={() => setMode("bank")}>Documento del banco</button>
              <button className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>Texto o archivo nuevo</button>
            </div>
            {mode === "bank" ? (
              <p className="note">Se compara «{docs.find((d) => d.id === selected)?.title ?? "—"}» contra el resto del banco.</p>
            ) : (
              <div className="new">
                <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título" />
                <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pega aquí el texto a revisar o carga un archivo .txt, .md o .pdf" />
                <div className="bank-actions">
                  <button onClick={() => file.current?.click()}>Cargar archivo</button>
                  <label className="chk"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Guardar en el banco</label>
                  <input ref={file} type="file" accept=".txt,.md,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }} />
                </div>
              </div>
            )}
            <div className="sliders">
              {slider("k (letras por shingle)", "k", 2, 12)}
              {slider("b (bandas)", "b", 1, 60)}
              {slider("r (filas por banda)", "r", 1, 12)}
              {slider("Similitud objetivo", "threshold", 0.1, 1, 0.05)}
            </div>
            <p className="note">Firma de n = b·r = <b>{s.b * s.r}</b> funciones hash · umbral de LSH t ≈ (1/b)^(1/r) = <b>{t.toFixed(2)}</b></p>
            <button className="primary big" onClick={run} disabled={busy || !canRun}>{busy ? "Analizando…" : "Analizar paso a paso"}</button>
            {err && <p className="error">{err}</p>}
          </section>
          <div className="tabs">
            <button className={tab === "analysis" ? "on" : ""} onClick={() => setTab("analysis")}>Análisis paso a paso</button>
            <button className={tab === "eval" ? "on" : ""} onClick={() => setTab("eval")}>Evaluación del banco</button>
          </div>
          {tab === "analysis" ? (res ? <Stepper analysis={res} /> : <p className="note">Elige un documento y pulsa «Analizar paso a paso».</p>) : <EvalPanel settings={s} docCount={docs.length} />}
        </main>
      </div>
    </div>
  );
}
