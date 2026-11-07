"""API FastAPI (Vercel Python Function). Toda la lógica vive en el paquete `lsh`."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, FastAPI, HTTPException  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from lsh import pipeline, store  # noqa: E402
from lsh.store import StoreError  # noqa: E402

app = FastAPI(title="LSH · Detección de plagio")
router = APIRouter()


@app.exception_handler(StoreError)
async def store_error(_request, exc: StoreError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


class AnalyzeIn(BaseModel):
    text: str | None = None
    doc_id: str | None = None
    title: str = "Documento sin título"
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


class DocIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=10)


def _check_n(b: int, r: int) -> None:
    if b * r > 400:
        raise HTTPException(422, "b·r no puede superar 400 funciones hash")


def _brief(d: dict) -> dict:
    out = {k: d.get(k) for k in ("id", "title", "char_count", "created_at")}
    out["char_count"] = d.get("char_count") or len(d.get("content", ""))
    out["preview"] = d.get("content", "")[:180]
    return out


@router.get("/health")
def health():
    return {"ok": True, "store": type(store.get_store()).__name__}


@router.get("/health/db")
def health_db():
    """Prueba real de la conexión: lista la tabla y devuelve cuántos textos hay."""
    return {"ok": True, "documents": len(store.get_store().list())}


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
    return _brief(store.get_store().add(body.title.strip(), body.content))


@router.put("/documents/{doc_id}")
def update_document(doc_id: str, body: DocIn):
    d = store.get_store().update(doc_id, body.title.strip(), body.content)
    if not d:
        raise HTTPException(404, "Documento no encontrado")
    return _brief(d)


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    store.get_store().delete(doc_id)
    return {"ok": True}


@router.post("/documents/seed")
def seed_documents():
    return {"inserted": store.seed_if_empty()}


@router.post("/analyze")
def analyze(body: AnalyzeIn):
    _check_n(body.b, body.r)
    s = store.get_store()
    exclude, text, title = None, body.text, body.title
    if body.doc_id:
        d = s.get(body.doc_id)
        if not d:
            raise HTTPException(404, "Documento no encontrado")
        exclude, text, title = d["id"], d["content"], d["title"]
    if not text or len(text.strip()) < 10:
        raise HTTPException(422, "Falta el texto a analizar")
    result = pipeline.analyze(text, title, s.list(), body.k, body.b, body.r, body.threshold, exclude)
    if body.save and not body.doc_id:
        result["saved"] = _brief(s.add(title, text))
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
