# Detector de plagio con LSH

Aplicación web que aplica, paso a paso y de forma visual, lo visto en el capítulo 3 de
*Mining of Massive Datasets*: shingling, fingerprints, minhash, LSH por bandas y manejo de
falsos positivos y negativos.

- **Lógica:** Python (`lsh/`), expuesta con FastAPI (`api/index.py`).
- **Interfaz:** React + TypeScript + Vite (`web/`).
- **Datos:** banco de documentos en Supabase (si no hay credenciales usa memoria y se pierde al reiniciar).
- **Despliegue:** Vercel (frontend estático + función Python).

## Qué se ve en pantalla

| Paso | Qué muestra | Módulo Python |
|---|---|---|
| 1. Documento | Texto original y normalizado | `core.normalize` |
| 2. Shingles | Ventana de k letras recorriendo el texto; shingles únicos | `core.shingles` |
| 3. Fingerprints | Cada shingle como entero de 32 bits (con sus bits) | `core.fingerprint` |
| 4. Firma minhash | Las 3 primeras funciones hash y la firma completa comparada con la del documento más parecido | `core.minhash` |
| 5. Bandas | b bandas de r filas; en verde las idénticas a las del mejor candidato | `core.band_keys` |
| 6. Cubos y candidatos | Embudo del banco hacia los candidatos | `core.LSHIndex` |
| 7. Verificación | Jaccard real frente a estimado, y TP, FP, FN, TN | `pipeline.analyze` |
| 8. Curva en S | Curva 1 − (1 − sʳ)ᵇ con cada documento sobre ella; precisión y recall | `core.s_curve` |
| 9. Plagio detectado | Pasajes compartidos resaltados en ambos textos | `core.shared_ranges` |

La sección **Mis textos** lista los textos guardados como tarjetas; al hacer clic en una se abre el editor para cambiar el título y el contenido, con botón **Guardar** (`PUT /api/documents/{id}`). También permite crear textos nuevos y eliminarlos.

En **Comparar** se escribe o pega el texto a revisar y se ajustan k, b, r y la similitud objetivo.

La pestaña **Evaluación del banco** compara todos contra todos: LSH frente a fuerza bruta
(pares, tiempo, precisión, recall y nube de pares sobre la curva teórica).

## 1. Supabase

1. Crea un proyecto en supabase.com.
2. En *SQL Editor* ejecuta `supabase/schema.sql`.
3. En *Project Settings > API* copia la **URL** y la **service_role key**.

La clave `service_role` solo la usa la función Python en el servidor. La tabla tiene RLS activo
sin políticas, así que el navegador no accede directamente.

## 2. Ejecutar en local

```bash
pip install -r requirements-dev.txt
cp .env.example .env            # opcional: sin él usa memoria
export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...   # opcional
uvicorn api.index:app --reload --port 8000

cd web && npm install && npm run dev                # http://localhost:5173
```

Pruebas: `python -m pytest -q`.

## 3. Desplegar en Vercel

1. Sube la carpeta a un repositorio de GitHub.
2. En Vercel: *Add New > Project* e importa el repositorio (raíz del proyecto, sin cambiar el directorio).
3. En *Environment Variables* agrega `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`.
4. Despliega. `vercel.json` compila `web/` y enruta `/api/*` a la función Python.
5. Entra al sitio y pulsa **Cargar ejemplos**.

## Límites y notas

- Solo se aceptan textos escritos o pegados: no hay subida de archivos ni de PDF.
- Las firmas se recalculan en cada petición (con caché en memoria): pensado para bancos de decenas o pocos cientos de documentos.
- La evaluación del banco usa como máximo 150 documentos (11 175 pares).
- b·r no puede superar 400 funciones hash.
- No hay autenticación: cualquiera con el enlace puede subir y borrar documentos. Antes de compartirlo, añade Supabase Auth o protege la API.
- Los shingles son de caracteres. Los de palabras (con stop words, sección 3.2.4) quedan como extensión.

## Diagnóstico si la API da 404 en Vercel

Abre `https://TU-SITIO.vercel.app/api/health`:

| Respuesta | Qué significa | Qué hacer |
|---|---|---|
| `{"ok":true,"store":"SupabaseStore"}` | La API y Supabase funcionan | Nada |
| `{"ok":true,"store":"MemoryStore"}` | La API funciona pero sin Supabase | Agrega `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` en *Settings > Environment Variables* y redespliega |
| Página de Vercel «NOT_FOUND» | La función Python no se desplegó | En *Settings > General* deja **Root Directory** vacío (raíz del repositorio); en *Deployments > Functions* debe aparecer `api/index.py`; revisa el log de build |
| `{"detail":"Not Found"}` | La función responde pero no reconoce la ruta | Ya cubierto: la API atiende rutas con y sin `/api` |
| Error 500 | Falla al importar o consultar | Mira *Logs* de la función en Vercel |
| 401 o página de login | *Deployment Protection* activa | Desactívala para este despliegue o usa el dominio de producción |

Tras cambiar variables de entorno hay que redesplegar.

## Si `/api/documents` da error 500 o 502

Abre `https://TU-SITIO.vercel.app/api/health/db`. Hace una consulta real a Supabase y muestra el motivo exacto:

- «La tabla public.documents no existe»: ejecuta `supabase/schema.sql` en *SQL Editor*.
- «Revisa SUPABASE_SERVICE_KEY»: usa la clave `service_role` (o la *secret key*) de *Project Settings > API*, no la `anon` ni la `publishable`.
- «No se pudo conectar»: `SUPABASE_URL` debe ser solo `https://xxxx.supabase.co`.
