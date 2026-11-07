"""Almacén de documentos: Supabase (PostgREST) o memoria si no hay credenciales."""
from __future__ import annotations

import base64
import json
import os
import uuid
from datetime import datetime, timezone

import httpx

from . import seed

TABLE = "documents"


class StoreError(Exception):
    """Error al hablar con la base de datos, con un mensaje accionable para la interfaz."""


def key_role(key: str) -> str:
    """Tipo de clave de Supabase, sin exponerla: service_role, secret, anon, publishable o desconocido."""
    key = key.strip()
    if key.startswith("sb_secret_"):
        return "secret"
    if key.startswith("sb_publishable_"):
        return "publishable"
    try:
        payload = key.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return str(json.loads(base64.urlsafe_b64decode(payload)).get("role", "desconocido"))
    except Exception:
        return "desconocido"


def _explain(status: int, body: str) -> str:
    try:
        j = httpx.Response(status, content=body).json()
        detail = " · ".join(str(j[k]) for k in ("message", "details", "hint") if j.get(k))
        code = str(j.get("code", ""))
    except Exception:
        detail, code = body[:300], ""
    tip = ""
    if "row-level security" in detail.lower():
        tip = (" → La clave configurada está sujeta a RLS (es la anon/publishable). "
               "Pon la service_role (o la secret key) en SUPABASE_SERVICE_KEY y redespliega.")
    elif status == 404 or code in ("PGRST205", "42P01"):
        tip = " → La tabla public.documents no existe: ejecuta supabase/schema.sql en el SQL Editor de Supabase."
    elif status in (401, 403) or "JWT" in detail or "apikey" in detail.lower():
        tip = " → Revisa SUPABASE_SERVICE_KEY: debe ser la clave service_role (o la secret key), no la anon/publishable."
    elif status == 400 and "column" in detail.lower():
        tip = " → Falta alguna columna: vuelve a ejecutar supabase/schema.sql."
    return f"Supabase respondió {status}: {detail or 'sin detalle'}{tip}"


class MemoryStore:
    def __init__(self) -> None:
        self.docs: dict[str, dict] = {}

    def list(self) -> list[dict]:
        return sorted(self.docs.values(), key=lambda d: d["created_at"], reverse=True)

    def get(self, doc_id: str) -> dict | None:
        return self.docs.get(doc_id)

    def add(self, title: str, content: str, group_id: str | None = None, group_name: str | None = None,
            frag_index: int | None = None) -> dict:
        d = {"id": str(uuid.uuid4()), "title": title, "content": content, "char_count": len(content),
             "created_at": datetime.now(timezone.utc).isoformat(),
             "group_id": group_id, "group_name": group_name, "frag_index": frag_index}
        self.docs[d["id"]] = d
        return d

    def add_many(self, rows: list[dict]) -> list[dict]:
        return [self.add(r["title"], r["content"], r.get("group_id"), r.get("group_name"), r.get("frag_index"))
                for r in rows]

    def delete_group(self, group_id: str) -> int:
        ids = [i for i, d in self.docs.items() if d.get("group_id") == group_id]
        for i in ids:
            del self.docs[i]
        return len(ids)

    def update(self, doc_id: str, title: str, content: str) -> dict | None:
        d = self.docs.get(doc_id)
        if d:
            d.update(title=title, content=content, char_count=len(content))
        return d

    def delete(self, doc_id: str) -> None:
        self.docs.pop(doc_id, None)


class SupabaseStore:
    def __init__(self, url: str, key: str) -> None:
        root = url.strip().split("/rest/v1")[0].rstrip("/")
        self.base = f"{root}/rest/v1/{TABLE}"
        key = key.strip()
        self.role = key_role(key)
        self.h = {"apikey": key, "Content-Type": "application/json"}
        if not key.startswith("sb_"):  # las claves nuevas (sb_secret_...) no son JWT: solo van en apikey
            self.h["Authorization"] = f"Bearer {key}"

    def _req(self, method: str, params: dict | None = None, json=None, prefer: str | None = None):
        headers = {**self.h, **({"Prefer": prefer} if prefer else {})}
        try:
            r = httpx.request(method, self.base, params=params, json=json, headers=headers, timeout=20)
        except httpx.HTTPError as e:
            raise StoreError(f"No se pudo conectar con Supabase ({type(e).__name__}). Revisa SUPABASE_URL.") from e
        if r.status_code >= 400:
            raise StoreError(_explain(r.status_code, r.text))
        return r.json() if r.content else None

    def list(self) -> list[dict]:
        # select=* para que funcione también si aún no se ejecutó la migración de los contenedores
        return self._req("GET", {"select": "*", "order": "created_at.desc"})

    def get(self, doc_id: str) -> dict | None:
        rows = self._req("GET", {"select": "*", "id": f"eq.{doc_id}"})
        return rows[0] if rows else None

    def add(self, title: str, content: str, group_id: str | None = None, group_name: str | None = None,
            frag_index: int | None = None) -> dict:
        row = {"title": title, "content": content, "char_count": len(content)}
        if group_id:  # solo se envían las columnas nuevas cuando hacen falta
            row.update(group_id=group_id, group_name=group_name, frag_index=frag_index)
        return self._req("POST", json=row, prefer="return=representation")[0]

    def add_many(self, rows: list[dict]) -> list[dict]:
        """Inserción masiva (una petición por cada 100 filas) para no hacer un viaje por fragmento."""
        out: list[dict] = []
        for i in range(0, len(rows), 100):
            batch = [{**r, "char_count": len(r["content"])} for r in rows[i : i + 100]]
            out += self._req("POST", json=batch, prefer="return=representation")
        return out

    def delete_group(self, group_id: str) -> int:
        rows = self._req("DELETE", {"group_id": f"eq.{group_id}", "select": "id"}, prefer="return=representation")
        return len(rows or [])

    def update(self, doc_id: str, title: str, content: str) -> dict | None:
        rows = self._req("PATCH", {"id": f"eq.{doc_id}"},
                         json={"title": title, "content": content, "char_count": len(content)},
                         prefer="return=representation")
        return rows[0] if rows else None

    def delete(self, doc_id: str) -> None:
        self._req("DELETE", {"id": f"eq.{doc_id}"})


_store = None


def get_store():
    global _store
    if _store is None:
        url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY")
        _store = SupabaseStore(url, key) if url and key else MemoryStore()
    return _store


def seed_if_empty() -> int:
    s = get_store()
    if s.list():
        return 0
    samples = seed.build_samples()
    for d in samples:
        s.add(d["title"], d["content"])
    return len(samples)
