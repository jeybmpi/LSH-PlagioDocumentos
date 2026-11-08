import { useState } from "react";
import { deleteDoc, deleteGroup, seedDocs } from "../api";
import { fragLabel, groupDocs, type Group } from "../groups";
import type { DocBrief } from "../types";

interface Props { docs: DocBrief[]; selected: string | null; onSelect: (id: string) => void; onChange: () => Promise<void> }

export function DocBank({ docs, selected, onSelect, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr("");
    try { await fn(); await onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const removeGroup = (g: Group) => {
    if (!window.confirm(`¿Eliminar el contenedor «${g.name}» y sus ${fragLabel(g.docs.length)}? Esta acción no se puede deshacer.`)) return;
    void wrap(() => deleteGroup(g.id));
  };
  const row = (d: DocBrief, label: string) => (
    <li key={d.id} className={selected === d.id ? "on" : ""}>
      <button className="doc" onClick={() => onSelect(d.id)}>
        <span>{label}</span><small>{d.char_count.toLocaleString("es")} caracteres</small>
      </button>
      <button className="del" aria-label={`Eliminar ${d.title}`} disabled={busy} onClick={() => wrap(() => deleteDoc(d.id))}>✕</button>
    </li>
  );
  const items = groupDocs(docs);
  return (
    <aside className="bank">
      <h2>Banco de textos</h2>
      <div className="bank-actions">
        <button disabled={busy} onClick={() => wrap(seedDocs)}>Cargar ejemplos</button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <ul>
        {items.map((it) => it.kind === "doc" ? row(it.doc, it.doc.title) : (
          <li key={it.id} className="group">
            <details open={it.docs.some((d) => d.id === selected) || undefined}>
              <summary>
                <span>{it.name}</span>
                <small>Contenedor · {fragLabel(it.docs.length)}</small>
              </summary>
              <ul className="frags">
                {it.docs.map((d) => row(d, `Parte ${d.frag_index ?? "?"}`))}
              </ul>
            </details>
            <button className="del" aria-label={`Eliminar el contenedor ${it.name}`} disabled={busy} onClick={() => removeGroup(it)}>✕</button>
          </li>
        ))}
        {!docs.length && <li className="empty">El banco está vacío. Guarda un texto desde «Comparar» o créalo en «Mis textos».</li>}
      </ul>
    </aside>
  );
}
