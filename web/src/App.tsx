import { useCallback, useEffect, useState } from "react";
import { analyze, health, listDocs } from "./api";
import { DocBank } from "./components/DocBank";
import { EvalPanel } from "./components/EvalPanel";
import { LONG_THRESHOLD, groupDocs } from "./groups";
import { MyTexts } from "./components/MyTexts";
import { Stepper } from "./components/Stepper";
import { TunePanel } from "./components/TunePanel";
import type { Analysis, DocBrief, Settings } from "./types";

const PRESETS: { id: string; label: string; hint: string; values: Settings }[] = [
  { id: "full", label: "Documento completo", values: { k: 5, b: 20, r: 5, threshold: 0.5 },
    hint: "Compara textos de tamaño parecido que casi coinciden. Umbral de LSH ≈ 0.55: solo marca pares muy similares." },
  { id: "passage", label: "Pasaje en texto largo", values: { k: 5, b: 40, r: 3, threshold: 0.3 },
    hint: "Un pasaje copiado dentro de un texto más grande da una similitud baja (a menudo 0.2–0.4). Umbral ≈ 0.29: más sensible, con algo más de ruido que se descarta al verificar." },
];

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
  const [notice, setNotice] = useState("");

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
      <input type="range" min={min} max={max} step={step} value={s[key]} onChange={(e) => { setS({ ...s, [key]: Number(e.target.value) }); setNotice(""); }} />
      <b>{s[key]}</b>
    </label>
  );
  const t = Math.pow(1 / s.b, 1 / s.r);
  const active = PRESETS.find((p) => p.values.k === s.k && p.values.b === s.b && p.values.r === s.r && p.values.threshold === s.threshold);
  const applyBR = (b: number, r: number) => {
    setS((prev) => ({ ...prev, b, r }));
    setNotice(`Se aplicó b = ${b}, r = ${r}. Pulsa «Analizar paso a paso» para ver el resultado.`);
  };
  const items = groupDocs(docs);
  const sel = docs.find((d) => d.id === selected);
  const longText = mode === "new" && text.trim().length > LONG_THRESHOLD;
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
            <div className="stat-card"><span>Textos guardados</span><strong>{items.length}</strong></div>
            {items.length !== docs.length && <div className="stat-card"><span>Documentos en el banco</span><strong>{docs.length}</strong></div>}
            <div className="stat-card"><span>Umbral</span><strong>{s.threshold.toFixed(2)}</strong></div>
          </div>
        </div>
        <nav className="view-nav" aria-label="Secciones">
          <button className={view === "compare" ? "on" : ""} onClick={() => setView("compare")}>Comparar</button>
          <button className={view === "texts" ? "on" : ""} onClick={() => setView("texts")}>Mis textos ({items.length})</button>
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
                    {longText && (
                      <p className="note long-note" role="status">
                        Texto largo ({text.trim().length.toLocaleString("es")} caracteres). Los textos del banco miden ~700 caracteres y Jaccard baja
                        cuando uno es mucho mayor que el otro: para detectar un pasaje sospechoso, pega solo el pasaje.
                        {save && " Al guardarlo se dividirá en fragmentos dentro de un contenedor."}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="note">Se compara «{docs.find((d) => d.id === selected)?.title ?? "—"}» contra el resto del banco{sel?.group_id ? ` (sin contar los demás fragmentos de «${sel.group_name}»)` : ""}. Elige otro en la lista de la izquierda.</p>
                )}
              </div>

              <div className="presets" role="group" aria-label="Modo de comparación">
                <span className="presets-label">Modo</span>
                {PRESETS.map((p) => (
                  <button key={p.id} className={active?.id === p.id ? "on" : ""} aria-pressed={active?.id === p.id}
                    onClick={() => { setS(p.values); setNotice(""); }}>{p.label}</button>
                ))}
                {!active && <span className="presets-custom">Personalizado</span>}
              </div>
              <p className="note">{active ? active.hint : "Valores personalizados: ajusta los controles o usa la calculadora de umbral."}</p>

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

              <details className="tune">
                <summary>Calculadora de umbral: ¿qué b y r necesito?</summary>
                <TunePanel initial={s.threshold} onApply={(b, r, th) => {
                  setS((prev) => ({ ...prev, b, r, threshold: Math.max(0.1, th) }));
                  setNotice(`Se aplicó b = ${b}, r = ${r} y similitud objetivo ${Math.max(0.1, th).toFixed(2)}. Pulsa «Analizar paso a paso».`);
                }} />
              </details>
              {notice && <p className="ok-msg" role="status">{notice}</p>}

              <button className="primary big" onClick={run} disabled={busy || !canRun}>{busy ? "Analizando…" : "Analizar paso a paso"}</button>
              {err && <p className="error">{err}</p>}
            </section>

            <div className="tabs" role="tablist" aria-label="Vista de resultados">
              <button className={tab === "analysis" ? "on" : ""} onClick={() => setTab("analysis")}>Análisis paso a paso</button>
              <button className={tab === "eval" ? "on" : ""} onClick={() => setTab("eval")}>Evaluación del banco</button>
            </div>

            {tab === "analysis" ? (res ? <Stepper analysis={res} onApply={applyBR} /> : <p className="note">Escribe o pega un texto y pulsa «Analizar paso a paso».</p>) : <EvalPanel settings={s} docCount={docs.length} />}
          </main>
        </div>
      )}
    </div>
  );
}
