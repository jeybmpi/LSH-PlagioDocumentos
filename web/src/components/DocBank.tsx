import { useState } from "react";
import { deleteDoc, seedDocs } from "../api";
import type { DocBrief } from "../types";

interface Props { docs: DocBrief[]; selected: string | null; onSelect: (id: string) => void; onChange: () => Promise<void> }

export function DocBank({ docs, selected, onSelect, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr("");
    try { await fn(); await onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <aside className="bank">
      <h2>Banco de textos</h2>
      <div className="bank-actions">
        <button disabled={busy} onClick={() => wrap(seedDocs)}>Cargar ejemplos</button>
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
        {!docs.length && <li className="empty">El banco está vacío. Guarda un texto desde «Comparar» o créalo en «Mis textos».</li>}
      </ul>
    </aside>
  );
}
