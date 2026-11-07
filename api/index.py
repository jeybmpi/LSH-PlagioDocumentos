"""API FastAPI (Vercel Python Function). Toda la lógica vive en el paquete `lsh`."""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from lsh import pipeline, store  # noqa: E402

app = FastAPI(title="LSH · Detección de plagio")
MAX_BYTES = 2_000_000


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
    return {k: d[k] for k in ("id", "title", "char_count", "created_at")}


@app.get("/api/health")
def health():
    return {"ok": True, "store": type(store.get_store()).__name__}


@app.get("/api/documents")
def list_documents():
    return [_brief(d) for d in store.get_store().list()]


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str):
    d = store.get_store().get(doc_id)
    if not d:
        raise HTTPException(404, "Documento no encontrado")
    return d


@app.post("/api/documents")
def add_document(body: DocIn):
    return _brief(store.get_store().add(body.title.strip(), body.content))


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str):
    store.get_store().delete(doc_id)
    return {"ok": True}


@app.post("/api/documents/seed")
def seed_documents():
    return {"inserted": store.seed_if_empty()}


@app.post("/api/extract")
async def extract(file: UploadFile = File(...)):
    """Devuelve el texto de un .txt, .md o .pdf sin guardarlo."""
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "El archivo supera 2 MB")
    name = (file.filename or "documento").strip()
    if name.lower().endswith(".pdf"):
        from pypdf import PdfReader

        text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(raw)).pages)
    else:
        text = raw.decode("utf-8", errors="ignore")
    if len(text.strip()) < 10:
        raise HTTPException(422, "No se pudo extraer texto del archivo")
    return {"title": name.rsplit(".", 1)[0], "content": text}


@app.post("/api/analyze")
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


@app.post("/api/evaluate")
def evaluate(body: EvalIn):
    _check_n(body.b, body.r)
    docs = store.get_store().list()
    if len(docs) < 2:
        raise HTTPException(422, "Se necesitan al menos 2 documentos en el banco")
    return pipeline.evaluate(docs, body.k, body.b, body.r, body.threshold)
