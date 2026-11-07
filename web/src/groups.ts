import type { DocBrief } from "./types";

/** Un texto con más caracteres que esto se guarda fragmentado. Mantener igual que LONG_THRESHOLD en lsh/chunker.py. */
export const LONG_THRESHOLD = 1500;

export interface Group { kind: "group"; id: string; name: string; docs: DocBrief[]; created_at: string }
export interface Single { kind: "doc"; doc: DocBrief }
export type Item = Group | Single;

/** Agrupa los fragmentos por contenedor; los textos sueltos quedan como están. Conserva el orden del banco. */
export function groupDocs(docs: DocBrief[]): Item[] {
  const items: Item[] = [];
  const byId = new Map<string, Group>();
  for (const d of docs) {
    if (!d.group_id) { items.push({ kind: "doc", doc: d }); continue; }
    let g = byId.get(d.group_id);
    if (!g) {
      g = { kind: "group", id: d.group_id, name: d.group_name ?? d.title, docs: [], created_at: d.created_at };
      byId.set(d.group_id, g);
      items.push(g);
    }
    g.docs.push(d);
  }
  for (const g of byId.values()) g.docs.sort((a, b) => (a.frag_index ?? 0) - (b.frag_index ?? 0));
  return items;
}

export const fragLabel = (n: number) => `${n} fragmento${n === 1 ? "" : "s"}`;
