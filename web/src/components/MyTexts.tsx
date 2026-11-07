import { useRef, useState } from "react";
import { addDoc, deleteDoc, getDoc, updateDoc } from "../api";
import type { DocBrief } from "../types";

type OpenId = string | "new" | null;
interface Props { docs: DocBrief[]; onChange: () => Promise<void> }

export function MyTexts({ docs, onChange }: Props) {
  const [openId, setOpenId] = useState<OpenId>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [orig, setOrig] = useState({ title: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const top = useRef<HTMLElement>(null);

  const dirty = title !== orig.title || text !== orig.text;
  const valid = title.trim().length > 0 && text.trim().length >= 10;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const reveal = () => setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  const confirmLeave = () => !dirty || window.confirm("Tienes cambios sin guardar. ¿Descartarlos?");

  const open = async (id: string) => {
    if (id === openId || !confirmLeave()) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const d = await getDoc(id);
      setOpenId(id); setTitle(d.title); setText(d.content); setOrig({ title: d.title, text: d.content });
      reveal();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const startNew = () => {
    if (!confirmLeave()) return;
    setOpenId("new"); setTitle(""); setText(""); setOrig({ title: "", text: "" }); setErr(""); setMsg(""); reveal();
  };
  const close = () => { if (confirmLeave()) { setOpenId(null); setErr(""); setMsg(""); } };

  const save = async () => {
    if (!openId || !valid) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const saved = openId === "new" ? await addDoc(title.trim(), text) : await updateDoc(openId, title.trim(), text);
      setOpenId(saved.id); setTitle(title.trim()); setOrig({ title: title.trim(), text });
      await onChange();
      setMsg("Cambios guardados");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!openId || openId === "new" || !window.confirm(`¿Eliminar «${orig.title}»? Esta acción no se puede deshacer.`)) return;
    setBusy(true); setErr("");
    try { await deleteDoc(openId); setOpenId(null); await onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="texts-view">
      {openId && (
        <section className="panel editor" ref={top} aria-label="Editor de texto">
          <header>
            <div>
              <h3>{openId === "new" ? "Nuevo texto" : "Editar texto"}</h3>
              <small>{words.toLocaleString("es")} palabras · {text.length.toLocaleString("es")} caracteres{dirty ? " · cambios sin guardar" : ""}</small>
            </div>
            <div className="ctl">
              {openId !== "new" && <button className="danger" onClick={remove} disabled={busy}>Eliminar</button>}
              <button onClick={close} disabled={busy}>Cerrar</button>
              <button className="primary" onClick={save} disabled={busy || !dirty || !valid}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </header>
          <div className="new">
            <input value={title} onChange={(e) => { setTitle(e.target.value); setMsg(""); }} aria-label="Título" placeholder="Título del texto" maxLength={200} />
            <textarea className="editor-text" value={text} onChange={(e) => { setText(e.target.value); setMsg(""); }} aria-label="Contenido" placeholder="Escribe o pega el texto aquí (mínimo 10 caracteres)" />
          </div>
          {msg && <p className="ok-msg" role="status">{msg}</p>}
          {err && <p className="error">{err}</p>}
        </section>
      )}

      <div className="texts-head">
        <p className="note">{docs.length ? `${docs.length} texto(s). Haz clic en uno para editar su título y contenido.` : "Aún no hay textos. Crea el primero."}</p>
        <button className="primary" onClick={startNew} disabled={busy}>+ Nuevo texto</button>
      </div>
      <div className="text-grid">
        {docs.map((d) => (
          <button key={d.id} className={`text-card ${openId === d.id ? "on" : ""}`} onClick={() => open(d.id)} disabled={busy}>
            <strong>{d.title}</strong>
            <span className="preview">{d.preview}{d.char_count > 180 ? "…" : ""}</span>
            <small>{d.char_count.toLocaleString("es")} caracteres · {new Date(d.created_at).toLocaleDateString("es")}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
