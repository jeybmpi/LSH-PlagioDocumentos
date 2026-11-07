"""Fragmentador de textos largos (preprocesamiento del banco; el pipeline LSH no cambia).

Por qué: Jaccard penaliza la diferencia de tamaño. Un pasaje de ~550 caracteres copiado de un
libro de 90 000 da J ≈ 1 %. Si el libro se guarda en fragmentos de ~700 caracteres, el pasaje
cae dentro de un fragmento de tamaño comparable y J sube a ≈ 0.7.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

LONG_THRESHOLD = 1500   # por encima de esto un texto se considera «largo» y se fragmenta
TARGET_SIZE = 700       # tamaño objetivo de cada fragmento (caracteres)
MAX_SIZE = 900          # tope de contenido nuevo por fragmento
OVERLAP = 300           # solape con el fragmento anterior (≈ medio pasaje típico): medido, 150 detecta 4/14 y 300 detecta 12/14 en el peor caso
MAX_FRAGMENTS = 300     # tope de fragmentos por texto (≈ 200 000 caracteres)


@dataclass
class Fragment:
    index: int
    text: str


def is_long(text: str) -> bool:
    return len(text.strip()) > LONG_THRESHOLD


def _units(text: str, max_size: int = MAX_SIZE) -> list[str]:
    """Oraciones (respetando saltos de línea); nunca devuelve una unidad mayor que MAX_SIZE."""
    text = re.sub(r"[ \t]+", " ", text.replace("\r\n", "\n").replace("\r", "\n"))
    out: list[str] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        for p in re.split(r"(?<=[.!?…»”\"])\s+", line):
            p = p.strip()
            while len(p) > max_size:  # oración gigante: se corta en un espacio
                cut = p.rfind(" ", 0, max_size)
                cut = cut if cut > 0 else max_size
                out.append(p[:cut].strip())
                p = p[cut:].strip()
            if p:
                out.append(p)
    return out


def _tail(cur: list[str], overlap: int = OVERLAP) -> list[str]:
    """Últimas oraciones de `cur` (≈ OVERLAP caracteres) que se repiten al inicio del siguiente."""
    tail: list[str] = []
    total = 0
    for s in reversed(cur):
        if tail and total + len(s) + 1 > overlap:
            break
        if not tail and len(s) > 2 * overlap:  # una oración larguísima no sirve de solape
            break
        tail.insert(0, s)
        total += len(s) + 1
    return tail


def chunk_text(text: str, target: int = TARGET_SIZE, max_size: int = MAX_SIZE,
               overlap: int = OVERLAP) -> list[Fragment]:
    chunks: list[str] = []
    cur: list[str] = []
    new_from = 0  # índice en `cur` donde empieza el contenido nuevo (antes va el solape)
    size = 0
    for u in _units(text, max_size):
        if cur and (size + len(u) + 1 > max_size or size >= target):
            chunks.append(" ".join(cur))
            tail = _tail(cur, overlap)
            t = sum(len(s) + 1 for s in tail)
            if t + len(u) + 1 > max_size:
                tail, t = [], 0
            cur, size, new_from = tail, t, len(tail)
        cur.append(u)
        size += len(u) + 1
    if cur:
        fresh = " ".join(cur[new_from:])
        # un último trozo diminuto se pega al anterior (solo su contenido nuevo, sin repetir el solape)
        if chunks and len(fresh) < target // 3 and len(chunks[-1]) + len(fresh) + 1 <= max_size + overlap:
            chunks[-1] += " " + fresh
        else:
            chunks.append(" ".join(cur))
    return [Fragment(i + 1, c) for i, c in enumerate(chunks)]
