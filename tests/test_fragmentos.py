"""Pruebas de la fragmentación de textos largos en contenedores."""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lsh import bank, chunker, pipeline, seed, store


def libro(n_sent: int = 900, semilla: int = 3) -> str:
    """Texto largo con vocabulario amplio (si fuera pequeño, todos los fragmentos se parecerían)."""
    rnd = random.Random(semilla)
    vocab = ["".join(rnd.choice("abcdefghilmnoprstuvz") for _ in range(rnd.randint(3, 9))) for _ in range(1800)]
    lineas, par = [], []
    for _ in range(n_sent):
        par.append(" ".join(rnd.choice(vocab) for _ in range(rnd.randint(8, 18))).capitalize() + ".")
        if len(par) >= rnd.randint(3, 6):
            lineas.append(" ".join(par))
            par = []
    return "\n".join(lineas)


def banco_con_libro(**kw):
    st = store.MemoryStore()
    res = bank.save_text(st, "Libro 1", libro(**kw))
    return st, res


# ---------- fragmentador ----------
def test_texto_corto_no_es_largo():
    assert not chunker.is_long("hola " * 50)
    assert chunker.is_long("palabra " * 400)


def test_fragmentos_validos():
    fr = chunker.chunk_text(libro())
    textos = [f.text for f in fr]
    assert len(fr) > 50
    assert [f.index for f in fr] == list(range(1, len(fr) + 1))
    assert all(t.strip() for t in textos), "no debe haber fragmentos vacíos"
    assert len(set(textos)) == len(textos), "no debe haber fragmentos duplicados"
    assert all(len(t) <= chunker.MAX_SIZE + chunker.OVERLAP for t in textos)


def test_ninguna_oracion_se_pierde_ni_se_parte():
    t = libro()
    unido = " ".join(f.text for f in chunker.chunk_text(t))
    for oracion in chunker._units(t)[::13]:
        assert oracion in unido


def test_fragmentos_vecinos_se_solapan():
    fr = chunker.chunk_text(libro())
    solapados = sum(1 for a, b in zip(fr, fr[1:]) if b.text[:60] in a.text)
    assert solapados >= len(fr) * 0.8


def test_casos_borde_del_fragmentador():
    assert chunker.chunk_text("") == []
    # una sola línea enorme sin puntuación
    f = chunker.chunk_text("palabra " * 1000)
    assert len(f) > 3 and all(len(x.text) <= chunker.MAX_SIZE + chunker.OVERLAP for x in f)
    # unidad de exactamente MAX_SIZE: no debe producir un fragmento vacío
    f = chunker.chunk_text("a" * 900 + ". " + "b" * 50 + ". " + "c" * 40)
    assert all(x.text.strip() for x in f)
    # saltos de línea de Windows
    assert len(chunker.chunk_text(libro(200).replace("\n", "\r\n"))) > 3


# ---------- guardado en contenedores ----------
def test_texto_corto_se_guarda_igual_que_antes():
    st = store.MemoryStore()
    r = bank.save_text(st, "Nota", "Un texto corto y normal para el banco.")
    assert r["group_id"] is None and "fragments" not in r and len(st.list()) == 1


def test_texto_largo_crea_contenedor():
    st, r = banco_con_libro()
    docs = st.list()
    assert r["fragments"] == len(docs) > 50 and r["title"] == "Libro 1" and r["id"] == r["group_id"]
    assert {d["group_id"] for d in docs} == {r["group_id"]} and {d["group_name"] for d in docs} == {"Libro 1"}
    assert sorted(d["frag_index"] for d in docs) == list(range(1, len(docs) + 1))
    assert all(d["title"] == f"Libro 1 · parte {d['frag_index']}" for d in docs)


def test_texto_demasiado_largo_se_rechaza():
    st = store.MemoryStore()
    try:
        bank.save_text(st, "Enorme", libro(n_sent=4000))
    except bank.TextTooLong as e:
        assert "300" in str(e)
        assert st.list() == []  # no queda nada a medias
    else:
        raise AssertionError("debía rechazar el texto")


def test_eliminar_contenedor():
    st, r = banco_con_libro()
    otro = st.add("Suelto", "Un texto suelto que no pertenece a ningún contenedor.")
    assert st.delete_group(r["group_id"]) == r["fragments"]
    assert [d["id"] for d in st.list()] == [otro["id"]]
    assert st.delete_group("no-existe") == 0


# ---------- desempeño: el caso que motivó la función ----------
def test_pasaje_copiado_se_detecta_en_el_fragmento_y_no_contra_el_libro_entero():
    t = libro()
    mid = len(t) // 2
    pasaje = t[mid : mid + 560]
    st, _ = banco_con_libro()
    c = pipeline.analyze(pasaje, "q", st.list(), 5, 20, 5, 0.5)["candidates"][0]
    assert c["exact"] >= 0.5 and c["is_candidate"] and c["verdict"] == "TP"
    entero = store.MemoryStore()
    entero.add("Libro entero", t)
    c2 = pipeline.analyze(pasaje, "q", entero.list(), 5, 20, 5, 0.5)["candidates"][0]
    assert c2["exact"] < 0.05 and not c2["is_candidate"]  # el problema original: J ≈ 1 %


def test_solape_protege_pasajes_en_un_corte():
    t = libro()

    def candidatos(overlap):
        st = store.MemoryStore()
        fr = chunker.chunk_text(t, overlap=overlap)
        st.add_many([dict(title=f"L{f.index}", content=f.text, group_id="g", group_name="L",
                          frag_index=f.index) for f in fr])
        docs = sorted(st.list(), key=lambda d: d["frag_index"])
        hits = 0
        for k in range(5, len(docs) - 5, 10):
            fin = t.find(docs[k]["content"][-40:]) + 40
            c = pipeline.analyze(t[fin - 280 : fin + 280], "q", docs, 5, 20, 5, 0.5)["candidates"][0]
            hits += c["is_candidate"]
        return hits

    assert candidatos(chunker.OVERLAP) > candidatos(0)


# ---------- hermanos del mismo contenedor ----------
def test_analizar_un_fragmento_ignora_a_sus_hermanos():
    st, r = banco_con_libro()
    docs = st.list()
    frag = sorted(docs, key=lambda d: d["frag_index"])[20]
    con = pipeline.analyze(frag["content"], "f", docs, 5, 20, 5, 0.5, frag["id"])
    sin = pipeline.analyze(frag["content"], "f", docs, 5, 20, 5, 0.5, frag["id"], frag["group_id"])
    assert any(c["exact"] > 0.1 for c in con["candidates"]), "sin excluir, el vecino solapado aparece"
    assert sin["candidates"] == []  # solo había hermanos


def test_evaluacion_no_compara_fragmentos_del_mismo_contenedor():
    st, r = banco_con_libro()
    n_frag = r["fragments"]
    for d in seed.build_samples():
        st.add(d["title"], d["content"])
    docs = st.list()
    ev = pipeline.evaluate(docs, 5, 20, 5, 0.5)
    n = len(docs)
    comb = lambda x: x * (x - 1) // 2
    assert ev["total_pairs"] == comb(n) - comb(n_frag) and ev["skipped_same_group"] == comb(n_frag)
    assert not any(p["a"].startswith("Libro 1") and p["b"].startswith("Libro 1") for p in ev["pairs"])
    assert ev["truncated"] is False and ev["docs_in_bank"] == n


def test_evaluacion_avisa_cuando_recorta():
    st, _ = banco_con_libro()
    ev = pipeline.evaluate(st.list(), 5, 20, 5, 0.5, cap=40)
    assert ev["docs"] == 40 and ev["truncated"] is True and ev["docs_in_bank"] > 40


def test_banco_sin_contenedores_no_cambia():
    st = store.MemoryStore()
    for d in seed.build_samples():
        st.add(d["title"], d["content"])
    ev = pipeline.evaluate(st.list(), 5, 20, 5, 0.5)
    assert ev["total_pairs"] == 120 and ev["skipped_same_group"] == 0


# ---------- API (requiere fastapi: se omiten si no está instalado) ----------
def _cliente(monkeypatch):
    try:
        from fastapi.testclient import TestClient
    except ImportError:
        return None
    from api.index import app

    monkeypatch.setattr(store, "_store", store.MemoryStore())
    return TestClient(app)


def test_api_contenedor_de_punta_a_punta(monkeypatch):
    c = _cliente(monkeypatch)
    if c is None:
        return
    r = c.post("/api/documents", json={"title": "Libro 1", "content": libro()}).json()
    assert r["fragments"] > 50 and r["title"] == "Libro 1"
    docs = c.get("/api/documents").json()
    assert len(docs) == r["fragments"] and all(d["group_id"] == r["group_id"] for d in docs)
    frag = next(d for d in docs if d["frag_index"] == 3)
    res = c.post("/api/analyze", json={"doc_id": frag["id"]}).json()
    assert all(x["id"] != frag["id"] for x in res["candidates"]) and res["candidates"] == []
    # un fragmento se puede borrar solo; el contenedor, de una vez
    assert c.delete(f"/api/documents/{frag['id']}").json()["ok"]
    assert len(c.get("/api/documents").json()) == r["fragments"] - 1
    assert c.delete(f"/api/groups/{r['group_id']}").json()["deleted"] == r["fragments"] - 1
    assert c.get("/api/documents").json() == []


def test_api_texto_demasiado_largo_da_422(monkeypatch):
    c = _cliente(monkeypatch)
    if c is None:
        return
    r = c.post("/api/documents", json={"title": "x", "content": libro(n_sent=4000)})
    assert r.status_code == 422 and "300" in r.json()["detail"]


def test_api_guardar_desde_comparar_fragmenta(monkeypatch):
    c = _cliente(monkeypatch)
    if c is None:
        return
    res = c.post("/api/analyze", json={"text": libro(300), "title": "", "save": True}).json()
    assert res["saved"]["fragments"] > 5 and res["saved"]["title"] == "Texto sin título"
    # un segundo texto largo sin título no reutiliza el nombre del contenedor
    res2 = c.post("/api/analyze", json={"text": libro(300, 9), "title": "", "save": True}).json()
    assert res2["saved"]["title"] == "Texto sin título 2"
