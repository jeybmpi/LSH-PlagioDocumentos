"""Almacén de documentos: Supabase (PostgREST) o memoria si no hay credenciales."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import httpx

from . import seed

TABLE = "documents"


class MemoryStore:
    def __init__(self) -> None:
        self.docs: dict[str, dict] = {}

    def list(self) -> list[dict]:
        return sorted(self.docs.values(), key=lambda d: d["created_at"], reverse=True)

    def get(self, doc_id: str) -> dict | None:
        return self.docs.get(doc_id)

    def add(self, title: str, content: str) -> dict:
        d = {"id": str(uuid.uuid4()), "title": title, "content": content, "char_count": len(content),
             "created_at": datetime.now(timezone.utc).isoformat()}
        self.docs[d["id"]] = d
        return d

    def update(self, doc_id: str, title: str, content: str) -> dict | None:
        d = self.docs.get(doc_id)
        if d:
            d.update(title=title, content=content, char_count=len(content))
        return d

    def delete(self, doc_id: str) -> None:
        self.docs.pop(doc_id, None)


class SupabaseStore:
    def __init__(self, url: str, key: str) -> None:
        self.base = f"{url.rstrip('/')}/rest/v1/{TABLE}"
        self.h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def _req(self, method: str, params: dict | None = None, json=None, prefer: str | None = None):
        headers = {**self.h, **({"Prefer": prefer} if prefer else {})}
        r = httpx.request(method, self.base, params=params, json=json, headers=headers, timeout=20)
        r.raise_for_status()
        return r.json() if r.content else None

    def list(self) -> list[dict]:
        return self._req("GET", {"select": "id,title,content,char_count,created_at", "order": "created_at.desc"})

    def get(self, doc_id: str) -> dict | None:
        rows = self._req("GET", {"select": "*", "id": f"eq.{doc_id}"})
        return rows[0] if rows else None

    def add(self, title: str, content: str) -> dict:
        return self._req("POST", json={"title": title, "content": content, "char_count": len(content)},
                         prefer="return=representation")[0]

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
