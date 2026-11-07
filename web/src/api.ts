import type { Analysis, DocBrief, Evaluation, Settings } from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, init);
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const j = await r.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}
const json = (body: unknown): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export const listDocs = () => req<DocBrief[]>("/documents");
export const seedDocs = () => req<{ inserted: number }>("/documents/seed", { method: "POST" });
export const addDoc = (title: string, content: string) => req<DocBrief>("/documents", json({ title, content }));
export const deleteDoc = (id: string) => req<{ ok: boolean }>(`/documents/${id}`, { method: "DELETE" });
export const extract = (file: File) => {
  const f = new FormData();
  f.append("file", file);
  return req<{ title: string; content: string }>("/extract", { method: "POST", body: f });
};
export const analyze = (p: Settings & { text?: string; doc_id?: string; title?: string; save?: boolean }) =>
  req<Analysis>("/analyze", json(p));
export const evaluate = (s: Settings) => req<Evaluation>("/evaluate", json(s));
