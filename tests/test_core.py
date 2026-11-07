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


def test_rutas_con_y_sin_prefijo_api():
    c = TestClient(app)
    assert c.get("/api/health").json()["ok"] is True
    assert c.get("/health").json()["ok"] is True
    assert c.get("/documents").status_code == 200


def test_errores_de_supabase_son_accionables(monkeypatch):
    import httpx
    from lsh import store as st

    def fake(*a, **k):
        return httpx.Response(404, json={"code": "PGRST205", "message": "Could not find the table 'public.documents'"})

    monkeypatch.setattr(st.httpx, "request", fake)
    monkeypatch.setattr(st, "_store", st.SupabaseStore("https://x.supabase.co/rest/v1/", "sb_secret_abc"))
    assert "Authorization" not in st._store.h and st._store.base == "https://x.supabase.co/rest/v1/documents"
    r = TestClient(app).get("/api/documents")
    assert r.status_code == 502 and "schema.sql" in r.json()["detail"]
    monkeypatch.setattr(st, "_store", None)


def test_key_role_sin_exponer_la_clave():
    import base64, json
    from lsh.store import key_role

    def jwt(role):
        enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
        return f"{enc({'alg': 'HS256'})}.{enc({'role': role})}.firma"

    assert key_role(jwt("anon")) == "anon"
    assert key_role(jwt("service_role")) == "service_role"
    assert key_role("sb_secret_abc") == "secret" and key_role("sb_publishable_abc") == "publishable"
    assert key_role("basura") == "desconocido"


def test_titulo_generico_al_guardar_sin_titulo():
    c = TestClient(app)
    texto = "Un texto cualquiera para guardar sin título alguno."
    a = c.post("/api/documents", json={"title": "", "content": texto}).json()
    b = c.post("/api/documents", json={"title": "   ", "content": texto + " más"}).json()
    assert a["title"] == "Texto sin título" and b["title"] == "Texto sin título 2"
    # al editar y dejar el título vacío, conserva su propio genérico sin renumerarse
    r = c.put(f"/api/documents/{a['id']}", json={"title": "", "content": texto + " editado"}).json()
    assert r["title"] == "Texto sin título"
    # con título explícito se respeta
    assert c.post("/api/documents", json={"title": "Mi ensayo", "content": texto}).json()["title"] == "Mi ensayo"
    # guardar desde Comparar sin título también usa el genérico
    res = c.post("/api/analyze", json={"text": texto + " otro", "title": "", "save": True}).json()
    assert res["query"]["title"] == "Texto a comparar" and res["saved"]["title"].startswith("Texto sin título")
