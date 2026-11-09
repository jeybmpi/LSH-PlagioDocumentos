"""API FastAPI (Vercel Python Function). Toda la lógica vive en el paquete `lsh`."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, FastAPI, HTTPException, Query  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from lsh import core, bank, pipeline, store  # noqa: E402
from lsh.store import StoreError  # noqa: E402

app = FastAPI(title="LSH · Detección de plagio")
router = APIRouter()


@app.exception_handler(StoreError)
async def store_error(_request, exc: StoreError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(bank.TextTooLong)
async def text_too_long(_request, exc: bank.TextTooLong):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


class AnalyzeIn(BaseModel):
    text: str | None = None
    doc_id: str | None = None
    title: str = ""
    k: int = Field(5, ge=2, le=12)
    b: int = Field(20, ge=1, le=60)
    r: int = Field(5, ge=1, le=12)
    threshold: float = Field(0.5, gt=0, le=1)
    save: bool = False


class EvalIn(BaseModel):
    k: int = Field(5, ge=2, le=12)
    b: int = Field(20, ge=1, le=60)
    r: int = Field(5, ge=1, le=12)
    threshold: float = Field(0.5, gt=0, le=1)


GENERIC_TITLE = "Texto sin título"


class DocIn(BaseModel):
    title: str = Field("", max_length=200)  # opcional: si va vacío se asigna un título genérico
    content: str = Field(min_length=10)


def _title_or_generic(title: str, exclude_id: str | None = None) -> str:
    """Devuelve el título dado o uno genérico y único: «Texto sin título», «Texto sin título 2»…"""
    title = title.strip()
    if title:
        return title
    docs = store.get_store().list()
    used = {d["title"] for d in docs if d["id"] != exclude_id} | {d["group_name"] for d in docs if d.get("group_name")}
    if GENERIC_TITLE not in used:
        return GENERIC_TITLE
    n = 2
    while f"{GENERIC_TITLE} {n}" in used:
        n += 1
    return f"{GENERIC_TITLE} {n}"


def _check_n(b: int, r: int) -> None:
    if b * r > 400:
        raise HTTPException(422, "b·r no puede superar 400 funciones hash")


_brief = bank.brief


@router.get("/health")
def health():
    return {"ok": True, "store": type(store.get_store()).__name__}


@router.get("/health/db")
def health_db():
    """Prueba real de la conexión: lista la tabla y devuelve cuántos textos hay."""
    st = store.get_store()
    out = {"ok": True, "documents": len(st.list()), "key_role": getattr(st, "role", "n/a")}
    if out["key_role"] in ("anon", "publishable"):
        out["ok"] = False
        out["warning"] = ("La clave configurada es anon/publishable: puede leer pero no escribir por RLS. "
                          "Usa la service_role o la secret key en SUPABASE_SERVICE_KEY.")
    return out


@router.get("/documents")
def list_documents():
    return [_brief(d) for d in store.get_store().list()]


@router.get("/documents/{doc_id}")
def get_document(doc_id: str):
    d = store.get_store().get(doc_id)
    if not d:
        raise HTTPException(404, "Documento no encontrado")
    return d


@router.post("/documents")
def add_document(body: DocIn):
    """Un texto corto se guarda tal cual; uno largo se divide en fragmentos dentro de un contenedor."""
    return bank.save_text(store.get_store(), _title_or_generic(body.title), body.content)


@router.put("/documents/{doc_id}")
def update_document(doc_id: str, body: DocIn):
    s = store.get_store()
    cur = s.get(doc_id)
    # el título de un fragmento lo fija su contenedor: se cambia renombrando el contenedor
    title = cur["title"] if cur and cur.get("group_id") else _title_or_generic(body.title, doc_id)
    d = s.update(doc_id, title, body.content)
    if not d:
        raise HTTPException(404, "Documento no encontrado")
    return _brief(d)


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    store.get_store().delete(doc_id)
    return {"ok": True}


class GroupRename(BaseModel):
    name: str = Field(min_length=1, max_length=200)


@router.put("/groups/{group_id}")
def rename_group(group_id: str, body: GroupRename):
    """Cambia el nombre de un contenedor; los títulos de sus fragmentos («<nombre> · parte N») lo siguen."""
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "El nombre del contenedor no puede estar vacío")
    n = store.get_store().rename_group(group_id, name)
    if not n:
        raise HTTPException(404, "Contenedor no encontrado")
    return {"ok": True, "name": name, "updated": n}


@router.delete("/groups/{group_id}")
def delete_group(group_id: str):
    """Elimina un contenedor completo (todos sus fragmentos)."""
    return {"ok": True, "deleted": store.get_store().delete_group(group_id)}


@router.post("/documents/seed")
def seed_documents():
    return {"inserted": store.seed_if_empty()}


@router.get("/tune")
def tune(threshold: float = Query(0.3, ge=0.05, le=0.95), noise: float = Query(core.NOISE_DEFAULT, ge=0, le=0.5)):
    """Calculadora: dado el umbral de similitud que se quiere, propone combinaciones (b, r)."""
    return {"threshold": threshold, "noise": noise, "options": core.suggest_params(threshold, noise)}


@router.post("/analyze")
def analyze(body: AnalyzeIn):
    _check_n(body.b, body.r)
    s = store.get_store()
    exclude, exclude_group, text, title = None, None, body.text, body.title.strip() or "Texto a comparar"
    if body.doc_id:
        d = s.get(body.doc_id)
        if not d:
            raise HTTPException(404, "Documento no encontrado")
        exclude, exclude_group, text, title = d["id"], d.get("group_id"), d["content"], d["title"]
    if not text or len(text.strip()) < 10:
        raise HTTPException(422, "Falta el texto a analizar")
    result = pipeline.analyze(text, title, s.list(), body.k, body.b, body.r, body.threshold, exclude, exclude_group)
    if body.save and not body.doc_id:
        result["saved"] = bank.save_text(s, _title_or_generic(body.title), text)
    return result


@router.post("/evaluate")
def evaluate(body: EvalIn):
    _check_n(body.b, body.r)
    docs = store.get_store().list()
    if len(docs) < 2:
        raise HTTPException(422, "Se necesitan al menos 2 documentos en el banco")
    return pipeline.evaluate(docs, body.k, body.b, body.r, body.threshold)


app.include_router(router, prefix="/api")
app.include_router(router)  # por si la plataforma entrega la ruta sin el prefijo /api
