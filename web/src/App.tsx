import { useCallback, useEffect, useState } from "react";
import { analyze, health, listDocs } from "./api";
import { DocBank } from "./components/DocBank";
import { EvalPanel } from "./components/EvalPanel";
import { MyTexts } from "./components/MyTexts";
import { Stepper } from "./components/Stepper";
import type { Analysis, DocBrief, Settings } from "./types";

export default function App() {
  const [view, setView] = useState<"compare" | "texts">("compare");
  const [docs, setDocs] = useState<DocBrief[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "saved">("new");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [save, setSave] = useState(false);
  const [s, setS] = useState<Settings>({ k: 5, b: 20, r: 5, threshold: 0.5 });
  const [res, setRes] = useState<Analysis | null>(null);
  const [tab, setTab] = useState<"analysis" | "eval">("analysis");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [memory, setMemory] = useState(false);

  const refresh = useCallback(async () => {
    const d = await listDocs();
    setDocs(d);
    setSelected((cur) => (cur && d.some((x) => x.id === cur) ? cur : d[0]?.id ?? null));
  }, []);
  useEffect(() => { refresh().catch((e) => setErr((e as Error).message)); }, [refresh]);
  useEffect(() => { health().then((h) => setMemory(h.store === "MemoryStore")).catch(() => undefined); }, []);

  const run = async () => {
    setBusy(true); setErr("");
    try {
      const body = mode === "saved" ? { ...s, doc_id: selected ?? undefined } : { ...s, text, title: title.trim(), save };
      const out = await analyze(body);
      setRes(out); setTab("analysis");
      if (out.saved) await refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const slider = (label: string, key: keyof Settings, min: number, max: number, step = 1) => (
    <label className="sl">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={s[key]} onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })} />
      <b>{s[key]}</b>
    </label>
  );
  const t = Math.pow(1 / s.b, 1 / s.r);
  const canRun = mode === "saved" ? !!selected : text.trim().length >= 10;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="eyebrow">LSH · análisis documental</div>
        <div className="title-row">
          <div>
            <h1>Detector de plagio con LSH</h1>
            <p>Shingling · Minhash · Bandas · Verificación</p>
          </div>
          <div className="mini-stats" aria-label="Resumen del sistema">
            <div className="stat-card"><span>Textos guardados</span><strong>{docs.length}</strong></div>
            <div className="stat-card"><span>Umbral</span><strong>{s.threshold.toFixed(2)}</strong></div>
          </div>
        </div>
        <nav className="view-nav" aria-label="Secciones">
          <button className={view === "compare" ? "on" : ""} onClick={() => setView("compare")}>Comparar</button>
          <button className={view === "texts" ? "on" : ""} onClick={() => setView("texts")}>Mis textos ({docs.length})</button>
        </nav>
      </header>

      {memory && (
        <p className="banner-warn" role="alert">
          La API no está conectada a Supabase: los textos se guardan solo en memoria y se pierden al reiniciar. Configura SUPABASE_URL y SUPABASE_SERVICE_KEY.
        </p>
      )}
      {err && view === "texts" && <p className="error">{err}</p>}

      {view === "texts" ? (
        <MyTexts docs={docs} onChange={refresh} />
      ) : (
        <div className="layout">
          <DocBank docs={docs} selected={selected} onSelect={(id) => { setSelected(id); setMode("saved"); }} onChange={refresh} />
          <main className="main-panel">
            <section className="panel form-panel">
              <div className="seg" role="tablist" aria-label="Texto a comparar">
                <button className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>Escribir o pegar texto</button>
                <button className={mode === "saved" ? "on" : ""} onClick={() => setMode("saved")}>Texto guardado</button>
              </div>

              <div className="mode-summary">
                {mode === "new" ? (
                  <div className="new">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título del texto a comparar" placeholder="Título (opcional)" maxLength={200} />
                    <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe o pega aquí el texto que quieres comparar contra el banco" />
                    <label className="chk"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Guardar también en «Mis textos»</label>
                  </div>
                ) : (
                  <p className="note">Se compara «{docs.find((d) => d.id === selected)?.title ?? "—"}» contra el resto del banco. Elige otro en la lista de la izquierda.</p>
                )}
              </div>

              <div className="sliders">
                {slider("k (letras por shingle)", "k", 2, 12)}
                {slider("b (bandas)", "b", 1, 60)}
                {slider("r (filas por banda)", "r", 1, 12)}
                {slider("Similitud objetivo", "threshold", 0.1, 1, 0.05)}
              </div>

              <div className="formula-bar" aria-label="Métrica de firma LSH">
                <span>Firma de n = <b>{s.b * s.r}</b> funciones hash</span>
                <span>umbral t ≈ <b>{t.toFixed(2)}</b></span>
              </div>

              <button className="primary big" onClick={run} disabled={busy || !canRun}>{busy ? "Analizando…" : "Analizar paso a paso"}</button>
              {err && <p className="error">{err}</p>}
            </section>

            <div className="tabs" role="tablist" aria-label="Vista de resultados">
              <button className={tab === "analysis" ? "on" : ""} onClick={() => setTab("analysis")}>Análisis paso a paso</button>
              <button className={tab === "eval" ? "on" : ""} onClick={() => setTab("eval")}>Evaluación del banco</button>
            </div>

            {tab === "analysis" ? (res ? <Stepper analysis={res} /> : <p className="note">Escribe o pega un texto y pulsa «Analizar paso a paso».</p>) : <EvalPanel settings={s} docCount={docs.length} />}
          </main>
        </div>
      )}
    </div>
  );
}
