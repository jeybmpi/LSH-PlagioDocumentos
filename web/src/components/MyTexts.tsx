import { useRef, useState } from "react";
import { addDoc, deleteDoc, deleteGroup, getDoc, renameGroup, updateDoc } from "../api";
import { LONG_THRESHOLD, fragLabel, groupDocs } from "../groups";
import type { DocBrief, SavedText } from "../types";

type OpenId = string | "new" | null;
interface Props { docs: DocBrief[]; onChange: () => Promise<void> }

export function MyTexts({ docs, onChange }: Props) {
  const [openId, setOpenId] = useState<OpenId>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [fragOf, setFragOf] = useState<string | null>(null);  // si el texto abierto es un fragmento: su contenedor
  const [nameDraft, setNameDraft] = useState<{ id: string; value: string } | null>(null);  // nombre editado del contenedor abierto
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [orig, setOrig] = useState({ title: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const top = useRef<HTMLElement>(null);

  const dirty = title !== orig.title || text !== orig.text;
  const valid = text.trim().length >= 10;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const reveal = () => setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  const items = groupDocs(docs);
  const group = items.find((i) => i.kind === "group" && i.id === openGroup);
  // El nombre del contenedor se edita igual que el título de un texto: campo siempre visible + Guardar
  const groupObj = group?.kind === "group" ? group : null;
  const nameValue = groupObj ? (nameDraft?.id === groupObj.id ? nameDraft.value : groupObj.name) : "";
  const nameDirty = !!groupObj && nameValue.trim() !== groupObj.name;
  const nameValid = nameValue.trim().length > 0;
  const confirmLeaveName = () => !nameDirty || window.confirm("Cambiaste el nombre del contenedor y no lo has guardado. ¿Descartar el cambio?");
  const isNew = openId === "new";
  const willSplit = isNew && text.trim().length > LONG_THRESHOLD;
  const confirmLeave = () => !dirty || window.confirm("Tienes cambios sin guardar. ¿Descartarlos?");

  const open = async (id: string) => {
    if (id === openId || !confirmLeave()) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const d = await getDoc(id);
      setOpenId(id); setFragOf(d.group_id ?? null); setTitle(d.title); setText(d.content); setOrig({ title: d.title, text: d.content });
      reveal();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const startNew = () => {
    if (!confirmLeave()) return;
    setOpenId("new"); setFragOf(null); setTitle(""); setText(""); setOrig({ title: "", text: "" }); setErr(""); setMsg(""); reveal();
  };
  const close = () => { if (confirmLeave()) { setOpenId(null); setErr(""); setMsg(""); } };

  const save = async () => {
    if (!openId || !valid) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const saved: SavedText = isNew ? await addDoc(title.trim(), text) : await updateDoc(openId, title.trim(), text);
      if (saved.fragments) {  // texto largo: quedó dividido en un contenedor
        await onChange();
        setOpenId(null); setTitle(""); setText(""); setOrig({ title: "", text: "" });
        setOpenGroup(saved.group_id ?? null);
        setMsg(`Texto largo dividido en ${fragLabel(saved.fragments)} dentro del contenedor «${saved.title}».`);
        return;
      }
      setOpenId(saved.id); setTitle(saved.title); setOrig({ title: saved.title, text });
      await onChange();
      setMsg("Cambios guardados");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const saveName = async () => {
    if (!groupObj || !nameDirty || !nameValid) return;
    const name = nameValue.trim();
    setBusy(true); setErr(""); setMsg("");
    try {
      await renameGroup(groupObj.id, name);
      await onChange();
      setNameDraft(null);
      setMsg(`Nombre guardado. Sus fragmentos ahora se llaman «${name} · parte N».`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const removeGroup = async () => {
    if (!group || group.kind !== "group") return;
    if (!window.confirm(`¿Eliminar el contenedor «${group.name}» y sus ${fragLabel(group.docs.length)}? Esta acción no se puede deshacer.`)) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      await deleteGroup(group.id);
      if (openId && openId !== "new" && group.docs.some((d) => d.id === openId)) setOpenId(null);
      setOpenGroup(null); setNameDraft(null);
      await onChange();
      setMsg(`Contenedor «${group.name}» eliminado.`);
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
            <input value={title} onChange={(e) => { setTitle(e.target.value); setMsg(""); }} aria-label={willSplit ? "Nombre del contenedor" : "Título"} placeholder="Título (opcional): sin título se guarda como «Texto sin título»" maxLength={200} disabled={!!fragOf} title={fragOf ? "El título de un fragmento sale del nombre de su contenedor" : undefined} />
            {fragOf && <p className="note">Este texto es un fragmento: su título sale del nombre del contenedor. Para cambiarlo, renombra el contenedor.</p>}
            <textarea className="editor-text" value={text} onChange={(e) => { setText(e.target.value); setMsg(""); }} aria-label="Contenido" placeholder="Escribe o pega el texto aquí (mínimo 10 caracteres)" />
          </div>
          {willSplit && (
            <p className="note long-note" role="status">
              Texto largo ({text.trim().length.toLocaleString("es")} caracteres): se guardará dividido en fragmentos de ~700 caracteres dentro de un
              contenedor llamado «{title.trim() || "Texto sin título"}». Podrás ver, editar o eliminar cada fragmento.
            </p>
          )}
          {msg && <p className="ok-msg" role="status">{msg}</p>}
          {err && <p className="error" role="alert">{err}</p>}
        </section>
      )}

      {!openId && msg && <p className="ok-msg" role="status">{msg}</p>}
      {!openId && err && <p className="error" role="alert">{err}</p>}

      {group && group.kind === "group" && (
        <section className="panel group-panel" aria-label={`Contenedor ${group.name}`}>
          <header>
            <div>
              <h3>Contenedor</h3>
              <small>{fragLabel(group.docs.length)} · los fragmentos vecinos se solapan a propósito y no se comparan entre sí{nameDirty ? " · cambios sin guardar" : ""}</small>
            </div>
            <div className="ctl">
              <button className="danger" onClick={removeGroup} disabled={busy}>Eliminar contenedor</button>
              <button onClick={() => { if (confirmLeaveName()) { setOpenGroup(null); setNameDraft(null); } }} disabled={busy}>Cerrar</button>
              <button className="primary" onClick={saveName} disabled={busy || !nameDirty || !nameValid}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </header>
          <div className="new">
            <input value={nameValue} onChange={(e) => { setNameDraft({ id: group.id, value: e.target.value }); setMsg(""); }}
              onKeyDown={(e: { key: string }) => { if (e.key === "Enter") void saveName(); }}
              aria-label="Nombre del contenedor" placeholder="Nombre del contenedor" maxLength={200} />
          </div>
          <div className="text-grid">
            {group.docs.map((d) => (
              <button key={d.id} className={`text-card ${openId === d.id ? "on" : ""}`} onClick={() => open(d.id)} disabled={busy}>
                <strong>Parte {d.frag_index ?? "?"}</strong>
                <span className="preview">{d.preview}{d.char_count > 180 ? "…" : ""}</span>
                <small>{d.char_count.toLocaleString("es")} caracteres</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="texts-head">
        <p className="note">{docs.length ? `${items.length} texto(s)${items.length !== docs.length ? ` (${docs.length} documentos en el banco)` : ""}. Haz clic en uno para editarlo; los contenedores se abren para ver sus fragmentos.` : "Aún no hay textos. Crea el primero."}</p>
        <button className="primary" onClick={startNew} disabled={busy}>+ Nuevo texto</button>
      </div>
      <div className="text-grid">
        {items.map((it) => it.kind === "group" ? (
          <button key={it.id} className={`text-card group-card ${openGroup === it.id ? "on" : ""}`} onClick={() => { if (!confirmLeaveName()) return; setNameDraft(null); setOpenGroup(openGroup === it.id ? null : it.id); }} disabled={busy}>
            <strong>{it.name}</strong>
            <span className="preview">Contenedor de un texto largo. Ábrelo para ver, editar o eliminar cada fragmento.</span>
            <small>{fragLabel(it.docs.length)} · {new Date(it.created_at).toLocaleDateString("es")}</small>
          </button>
        ) : (
          <button key={it.doc.id} className={`text-card ${openId === it.doc.id ? "on" : ""}`} onClick={() => open(it.doc.id)} disabled={busy}>
            <strong>{it.doc.title}</strong>
            <span className="preview">{it.doc.preview}{it.doc.char_count > 180 ? "…" : ""}</span>
            <small>{it.doc.char_count.toLocaleString("es")} caracteres · {new Date(it.doc.created_at).toLocaleDateString("es")}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
