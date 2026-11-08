"""Guardado de textos en el banco: los textos largos se dividen en fragmentos dentro de un contenedor."""
from __future__ import annotations

import uuid

from . import chunker

PART_SEP = " · parte "


class TextTooLong(ValueError):
    """El texto genera más fragmentos de los permitidos."""


def brief(d: dict) -> dict:
    out = {k: d.get(k) for k in ("id", "title", "char_count", "created_at", "group_id", "group_name", "frag_index")}
    out["char_count"] = d.get("char_count") or len(d.get("content", ""))
    out["preview"] = d.get("content", "")[:180]
    return out


def save_text(store, name: str, content: str) -> dict:
    """Texto corto -> un documento (igual que antes). Texto largo -> N fragmentos con el mismo group_id.

    Devuelve un resumen: para un contenedor, `id` es el group_id y `fragments` el número de fragmentos.
    """
    if not chunker.is_long(content):
        return brief(store.add(name, content))
    frags = chunker.chunk_text(content)
    if len(frags) > chunker.MAX_FRAGMENTS:
        raise TextTooLong(
            f"El texto genera {len(frags)} fragmentos y el máximo es {chunker.MAX_FRAGMENTS} "
            f"(≈ {chunker.MAX_FRAGMENTS * chunker.TARGET_SIZE:,} caracteres). Divídelo en dos contenedores."
        )
    gid = str(uuid.uuid4())
    rows = [dict(title=f"{name}{PART_SEP}{f.index}", content=f.text, group_id=gid, group_name=name,
                 frag_index=f.index) for f in frags]
    saved = store.add_many(rows)
    return {"id": gid, "title": name, "char_count": len(content), "created_at": saved[0]["created_at"],
            "preview": content.strip()[:180], "group_id": gid, "group_name": name, "frag_index": None,
            "fragments": len(saved)}
