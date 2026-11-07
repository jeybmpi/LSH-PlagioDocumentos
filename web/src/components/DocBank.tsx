import { useRef, useState } from "react";
import { addDoc, deleteDoc, extract, seedDocs } from "../api";
import type { DocBrief } from "../types";

interface Props { docs: DocBrief[]; selected: string | null; onSelect: (id: string) => void; onChange: () => Promise<void> }

export function DocBank({ docs, selected, onSelect, onChange }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr("");
    try { await fn(); await onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const upload = (f: File) => wrap(async () => { const x = await extract(f); await addDoc(x.title, x.content); });
  return (
    <aside className="bank">
      <h2>Banco de documentos</h2>
      <div className="bank-actions">
        <button className="primary" disabled={busy} onClick={() => file.current?.click()}>Subir al banco</button>
        <button disabled={busy} onClick={() => wrap(seedDocs)}>Cargar ejemplos</button>
        <input ref={file} type="file" accept=".txt,.md,.pdf" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      </div>
      {err && <p className="error">{err}</p>}
      <ul>
        {docs.map((d) => (
          <li key={d.id} className={selected === d.id ? "on" : ""}>
            <button className="doc" onClick={() => onSelect(d.id)}>
              <span>{d.title}</span><small>{d.char_count.toLocaleString("es")} caracteres</small>
            </button>
            <button className="del" aria-label={`Eliminar ${d.title}`} disabled={busy} onClick={() => wrap(() => deleteDoc(d.id))}>✕</button>
          </li>
        ))}
        {!docs.length && <li className="empty">El banco está vacío. Carga los ejemplos o sube un .txt, .md o .pdf.</li>}
      </ul>
    </aside>
  );
}
