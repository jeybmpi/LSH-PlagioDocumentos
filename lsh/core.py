"""Primitivas de LSH para detección de plagio.

Referencia: Leskovec, Rajaraman, Ullman. Mining of Massive Datasets, cap. 3.
  - normalize / shingles / fingerprint ..... secciones 3.2.1 a 3.2.3
  - minhash ................................. secciones 3.3.2 a 3.3.5
  - LSHIndex, p_candidate, threshold ........ secciones 3.4.1 y 3.4.2
"""
from __future__ import annotations

import hashlib
import re
import unicodedata

import numpy as np

PRIME = 4294967311  # primo mayor que 2**32: h(x) = (a*x + b) mod p
_P = np.uint64(PRIME)


# ---------- 1. Preprocesamiento ----------
def normalize(text: str) -> str:
    """Minúsculas, sin tildes, y toda secuencia no alfanumérica pasa a un solo espacio."""
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def shingles(norm: str, k: int) -> list[str]:
    """k-shingles únicos, en orden de primera aparición (conjunto, no bolsa)."""
    if len(norm) < k:
        return [norm] if norm else []
    seen: set[str] = set()
    out: list[str] = []
    for i in range(len(norm) - k + 1):
        s = norm[i : i + k]
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def shingle_trace(norm: str, k: int, limit: int = 60) -> list[dict]:
    """Recorrido de la ventana de k letras sobre el texto, ventana por ventana.

    Cada paso dice si el shingle es nuevo (entra al conjunto) o repetido (ya estaba, no se agrega) y
    cuántos elementos tiene el conjunto después. Sirve para dibujar cómo el texto pasa a ser un conjunto.
    """
    if not norm:
        return []
    if len(norm) < k:
        return [{"i": 0, "text": norm, "new": True, "size": 1}]
    seen: set[str] = set()
    out: list[dict] = []
    for i in range(min(len(norm) - k + 1, limit)):
        s = norm[i : i + k]
        is_new = s not in seen
        seen.add(s)
        out.append({"i": i, "text": s, "new": is_new, "size": len(seen)})
    return out


def fingerprint(s: str) -> int:
    """Huella de 32 bits de un shingle (0 .. 2**32 - 1)."""
    return int.from_bytes(hashlib.blake2b(s.encode(), digest_size=4).digest(), "big")


def fingerprints(shs: list[str]) -> np.ndarray:
    return np.array([fingerprint(s) for s in shs], dtype=np.uint64)


# ---------- 2. Firmas minhash ----------
def hash_params(n: int, seed: int = 7) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    a = rng.integers(1, PRIME, size=n, dtype=np.uint64)
    b = rng.integers(0, PRIME, size=n, dtype=np.uint64)
    return a, b


def minhash(fps: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """SIG[i] = min_x h_i(x). Las n funciones hash simulan n permutaciones."""
    sig = np.full(len(a), PRIME, dtype=np.uint64)
    for i in range(0, len(fps), 4096):
        chunk = fps[i : i + 4096]
        h = (a[:, None] * chunk[None, :] + b[:, None]) % _P
        sig = np.minimum(sig, h.min(axis=1))
    return sig


def jaccard(A: set, B: set) -> float:
    if not A and not B:
        return 1.0
    return len(A & B) / len(A | B)


def estimate(sa: np.ndarray, sb: np.ndarray) -> float:
    """Fracción de filas de la firma que coinciden = estimación de Jaccard."""
    return float(np.mean(sa == sb))


# ---------- 3. LSH por bandas ----------
def band_keys(sig: np.ndarray, b: int, r: int) -> list[str]:
    return [
        hashlib.blake2b(sig[i * r : (i + 1) * r].tobytes(), digest_size=6).hexdigest()
        for i in range(b)
    ]


def p_candidate(s: float, b: int, r: int) -> float:
    return 1.0 - (1.0 - s**r) ** b


def threshold(b: int, r: int) -> float:
    return (1.0 / b) ** (1.0 / r)


def s_curve(b: int, r: int, points: int = 101) -> list[list[float]]:
    return [[i / (points - 1), p_candidate(i / (points - 1), b, r)] for i in range(points)]


class LSHIndex:
    """Un arreglo de cubos por banda; dos columnas colisionan si una banda es idéntica."""

    def __init__(self, b: int, r: int):
        self.b, self.r = b, r
        self.buckets: list[dict[str, list[str]]] = [{} for _ in range(b)]

    def add(self, doc_id: str, sig: np.ndarray) -> None:
        for i, key in enumerate(band_keys(sig, self.b, self.r)):
            self.buckets[i].setdefault(key, []).append(doc_id)

    def query(self, sig: np.ndarray) -> dict[str, list[int]]:
        found: dict[str, list[int]] = {}
        for i, key in enumerate(band_keys(sig, self.b, self.r)):
            for doc_id in self.buckets[i].get(key, []):
                found.setdefault(doc_id, []).append(i)
        return found


# ---------- Resaltado ----------
def shared_ranges(norm: str, shared: set[str], k: int) -> list[list[int]]:
    """Intervalos [inicio, fin) del texto normalizado cubiertos por shingles compartidos."""
    spans: list[list[int]] = []
    for i in range(max(len(norm) - k + 1, 0)):
        if norm[i : i + k] in shared:
            if spans and i <= spans[-1][1]:
                spans[-1][1] = i + k
            else:
                spans.append([i, i + k])
    return spans


# ---------- Ajuste guiado de b y r ----------
NOISE_DEFAULT = 0.08  # estimación del parecido casual entre textos sin relación (depende de k y del tamaño)


def suggest_params(t: float, noise: float = NOISE_DEFAULT, max_b: int = 60, max_r: int = 12,
                   max_n: int = 400, tol: float = 0.08) -> list[dict]:
    """Combinaciones (b, r) cuyo umbral (1/b)^(1/r) queda cerca de t.

    Como t = (1/b)^(1/r), para cada r se toma b = t^(-r). Con r mayor la curva en S es más
    empinada (separa mejor), pero exige más bandas; por eso se limita b y n = b·r.
    """
    hi = min(0.99, t + 0.2)
    opts: list[dict] = []
    for r in range(1, max_r + 1):
        b = max(1, round(t ** -r))
        if b > max_b or b * r > max_n:
            continue
        tr = threshold(b, r)
        if abs(tr - t) > tol:
            continue
        opts.append({
            "b": b, "r": r, "n": b * r, "t": round(tr, 3),
            "p_noise": round(p_candidate(noise, b, r), 4),
            "p_threshold": round(p_candidate(t, b, r), 4),
            "high": round(hi, 2), "p_high": round(p_candidate(hi, b, r), 4),
        })
    opts.sort(key=lambda o: (round(abs(o["t"] - t), 2), -o["r"]))
    if opts:
        opts[0]["recommended"] = True
    return opts


def params_for_detection(s: float, target_p: float = 0.9, noise: float = NOISE_DEFAULT,
                         max_b: int = 60, max_r: int = 12, max_n: int = 400) -> dict | None:
    """(b, r) que detecta pares de similitud s con probabilidad >= target_p y menos ruido.

    Para cada r, el menor b que cumple minimiza el ruido (P crece con b). Devuelve None si con
    los límites de b y r no se puede alcanzar target_p.
    """
    best = None
    for r in range(1, max_r + 1):
        for b in range(1, max_b + 1):
            if b * r > max_n:
                break
            if p_candidate(s, b, r) >= target_p:
                key = (p_candidate(noise, b, r), b * r)
                if best is None or key < best[0]:
                    best = (key, b, r)
                break
    if best is None:
        return None
    _, b, r = best
    return {"b": b, "r": r, "n": b * r, "p_detect": round(p_candidate(s, b, r), 4),
            "p_noise": round(p_candidate(noise, b, r), 4)}
