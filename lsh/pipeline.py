"""Pipeline completo: documento -> shingles -> huellas -> firma -> bandas -> candidatos -> verificación."""
from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np

from . import core

TEXT_CAP = 20000
_cache: dict[tuple, "Prepared"] = {}


@dataclass
class Prepared:
    norm: str
    shs: list[str]
    shset: set[str]
    fps: np.ndarray
    sig: np.ndarray


def prepare(text: str, k: int, a, b, key: str | None = None) -> Prepared:
    ck = (key, hash(text), k, len(a)) if key else None
    if ck and ck in _cache:
        return _cache[ck]
    norm = core.normalize(text)
    shs = core.shingles(norm, k)
    fps = core.fingerprints(shs)
    p = Prepared(norm, shs, set(shs), fps, core.minhash(fps, a, b))
    if ck:
        if len(_cache) > 2000:
            _cache.clear()
        _cache[ck] = p
    return p


def _verdict(is_cand: bool, similar: bool) -> str:
    return {(True, True): "TP", (True, False): "FP", (False, True): "FN", (False, False): "TN"}[(is_cand, similar)]


def analyze(text: str, title: str, docs: list[dict], k: int, b: int, r: int, t: float,
            exclude_id: str | None = None) -> dict:
    n = b * r
    a, bb = core.hash_params(n)
    q = prepare(text, k, a, bb)
    corpus = {d["id"]: (d, prepare(d["content"], k, a, bb, key=d["id"])) for d in docs if d["id"] != exclude_id}

    t0 = time.perf_counter()
    index = core.LSHIndex(b, r)
    for did, (_, p) in corpus.items():
        index.add(did, p.sig)
    ms_build = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter()
    cands = index.query(q.sig)
    ms_query = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    exact = {did: core.jaccard(q.shset, p.shset) for did, (_, p) in corpus.items()}
    ms_brute = (time.perf_counter() - t0) * 1000

    rows = []
    for did, (d, p) in corpus.items():
        s, is_cand = exact[did], did in cands
        rows.append({
            "id": did, "title": d["title"], "bands": cands.get(did, []), "is_candidate": is_cand,
            "est": round(core.estimate(q.sig, p.sig), 4), "exact": round(s, 4),
            "p_theory": round(core.p_candidate(s, b, r), 4), "similar": s >= t,
            "verdict": _verdict(is_cand, s >= t),
        })
    rows.sort(key=lambda x: -x["exact"])
    cnt = {v: sum(1 for x in rows if x["verdict"] == v) for v in ("TP", "FP", "FN", "TN")}
    tp, fp, fn = cnt["TP"], cnt["FP"], cnt["FN"]

    keys = core.band_keys(q.sig, b, r)
    best = None
    best_set: set[str] = set()
    if rows:
        top = rows[0]
        d, p = corpus[top["id"]]
        best_set = p.shset
        shared = q.shset & p.shset
        pk = core.band_keys(p.sig, b, r)
        best = {
            "id": top["id"], "title": top["title"], "exact": top["exact"], "est": top["est"],
            "signature": [int(x) for x in p.sig], "bands_equal": [i for i in range(b) if keys[i] == pk[i]],
            "shared_count": len(shared),
            "norm_query": q.norm[:TEXT_CAP], "norm_doc": p.norm[:TEXT_CAP],
            "ranges_query": [s for s in core.shared_ranges(q.norm, shared, k) if s[0] < TEXT_CAP],
            "ranges_doc": [s for s in core.shared_ranges(p.norm, shared, k) if s[0] < TEXT_CAP],
        }

    bands = []
    for i in range(b):
        ids = index.buckets[i].get(keys[i], [])
        bands.append({"index": i, "rows": [int(x) for x in q.sig[i * r:(i + 1) * r]], "key": keys[i],
                      "docs": [corpus[x][0]["title"] for x in ids]})

    explain = []
    for i in range(min(3, n)):
        if len(q.fps):
            h = (a[i] * q.fps + bb[i]) % np.uint64(core.PRIME)
            j = int(np.argmin(h))
            explain.append({"index": i, "a": int(a[i]), "b": int(bb[i]), "min_text": q.shs[j],
                            "min_fp": int(q.fps[j]), "value": int(h[j])})

    sample = [{"text": s, "value": int(f), "shared": s in best_set} for s, f in zip(q.shs[:48], q.fps[:48])]
    return {
        "params": {"k": k, "n": n, "b": b, "r": r, "threshold_theory": round(core.threshold(b, r), 4), "target": t},
        "query": {"title": title, "chars": len(text)},
        "normalize": {"original": text[:1500], "normalized": q.norm[:1500],
                      "original_chars": len(text), "normalized_chars": len(q.norm)},
        "shingles": {"total": len(q.shs), "sample": sample},
        "signature": {"values": [int(x) for x in q.sig], "explain": explain},
        "bands": bands,
        "candidates": rows,
        "best": best,
        "evaluation": {
            "total_docs": len(rows), "candidates": sum(1 for x in rows if x["is_candidate"]),
            "brute_comparisons": len(rows), **cnt,
            "precision": round(tp / (tp + fp), 4) if tp + fp else None,
            "recall": round(tp / (tp + fn), 4) if tp + fn else None,
            "ms_build": round(ms_build, 2), "ms_query": round(ms_query, 2), "ms_brute": round(ms_brute, 2),
        },
        "curve": {"points": core.s_curve(b, r), "threshold": round(core.threshold(b, r), 4)},
    }


def evaluate(docs: list[dict], k: int, b: int, r: int, t: float, cap: int = 150) -> dict:
    """Todos contra todos en el banco: LSH frente a fuerza bruta."""
    docs = docs[:cap]
    n = b * r
    a, bb = core.hash_params(n)
    prep = {d["id"]: prepare(d["content"], k, a, bb, key=d["id"]) for d in docs}
    ids = list(prep)

    t0 = time.perf_counter()
    index = core.LSHIndex(b, r)
    for i in ids:
        index.add(i, prep[i].sig)
    cand: set[tuple[str, str]] = set()
    for bucket in index.buckets:
        for members in bucket.values():
            for x in range(len(members)):
                for y in range(x + 1, len(members)):
                    cand.add(tuple(sorted((members[x], members[y]))))  # type: ignore[arg-type]
    ms_lsh = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    pairs, tp, fp, fn, tn = [], 0, 0, 0, 0
    title = {d["id"]: d["title"] for d in docs}
    for x in range(len(ids)):
        for y in range(x + 1, len(ids)):
            s = core.jaccard(prep[ids[x]].shset, prep[ids[y]].shset)
            is_c = tuple(sorted((ids[x], ids[y]))) in cand
            v = _verdict(is_c, s >= t)
            tp, fp, fn, tn = tp + (v == "TP"), fp + (v == "FP"), fn + (v == "FN"), tn + (v == "TN")
            if is_c or s >= 0.05:
                pairs.append({"a": title[ids[x]], "b": title[ids[y]], "s": round(s, 4), "candidate": is_c, "verdict": v})
    ms_brute = (time.perf_counter() - t0) * 1000
    total = len(ids) * (len(ids) - 1) // 2
    return {
        "params": {"k": k, "n": n, "b": b, "r": r, "threshold_theory": round(core.threshold(b, r), 4), "target": t},
        "docs": len(ids), "total_pairs": total, "candidate_pairs": len(cand),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": round(tp / (tp + fp), 4) if tp + fp else None,
        "recall": round(tp / (tp + fn), 4) if tp + fn else None,
        "ms_lsh": round(ms_lsh, 2), "ms_brute": round(ms_brute, 2),
        "pairs": pairs[:3000], "curve": {"points": core.s_curve(b, r), "threshold": round(core.threshold(b, r), 4)},
    }
