import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from fastapi.testclient import TestClient

from api.index import app
from lsh import core, pipeline, seed


def test_libro_ejemplo_3_3():
    assert set(core.shingles("abcdabd", 2)) == {"ab", "bc", "cd", "da", "bd"}


def test_normalize():
    assert core.normalize("  ¡Hola,   MUNDO!\n Árbol ") == "hola mundo arbol"


def test_minhash_estima_jaccard():
    A = {f"s{i}" for i in range(0, 700)}
    B = {f"s{i}" for i in range(300, 1000)}  # J = 400/1000 = 0.4
    a, b = core.hash_params(400)
    sa = core.minhash(core.fingerprints(sorted(A)), a, b)
    sb = core.minhash(core.fingerprints(sorted(B)), a, b)
    assert abs(core.estimate(sa, sb) - core.jaccard(A, B)) < 0.08


def test_curva_s_del_libro():
    assert abs(core.p_candidate(0.8, 20, 5) - 0.99965) < 1e-4
    assert abs(core.p_candidate(0.5, 20, 5) - 0.470) < 1e-3
    assert abs(core.threshold(16, 4) - 0.5) < 1e-9


def test_lsh_encuentra_copias_y_poda_el_resto():
    docs = [dict(id=str(i), **d) for i, d in enumerate(seed.build_samples())]
    base = docs[0]
    r = pipeline.analyze(base["content"], "q", docs[1:], 5, 20, 5, 0.5)
    by_title = {x["title"]: x for x in r["candidates"]}
    assert by_title["Fotosíntesis (palabras cambiadas)"]["is_candidate"]
    unrelated = [x for x in r["candidates"] if x["title"].startswith("Ciclo")]
    assert not any(x["is_candidate"] for x in unrelated)
    assert r["evaluation"]["recall"] is None or r["evaluation"]["recall"] >= 0.5


def test_api_flujo():
    c = TestClient(app)
    assert c.post("/api/documents/seed").json()["inserted"] == 16
    docs = c.get("/api/documents").json()
    assert len(docs) == 16
    res = c.post("/api/analyze", json={"doc_id": docs[0]["id"]}).json()
    assert res["params"]["n"] == 100 and len(res["signature"]["values"]) == 100
    ev = c.post("/api/evaluate", json={}).json()
    assert ev["total_pairs"] == 120 and ev["candidate_pairs"] < ev["total_pairs"]


def test_editar_texto_actualiza_banco_y_cache():
    c = TestClient(app)
    c.post("/api/documents/seed")
    docs = c.get("/api/documents").json()
    target = docs[0]
    assert "preview" in target
    original = c.get(f"/api/documents/{target['id']}").json()["content"]
    # mismo largo, contenido distinto: la caché no debe devolver la firma vieja
    cambiado = original[::-1]
    r = c.put(f"/api/documents/{target['id']}", json={"title": "Editado", "content": cambiado})
    assert r.status_code == 200 and r.json()["title"] == "Editado"
    assert c.get(f"/api/documents/{target['id']}").json()["content"] == cambiado
    assert c.put("/api/documents/no-existe", json={"title": "x", "content": "y" * 20}).status_code == 404
    assert c.post("/api/extract").status_code == 404  # los PDF/archivos ya no se aceptan
