# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing application stack, confirmed by repository structure and config:

- Frontend: React + TypeScript + Vite in `web/`
- Backend/API: FastAPI in `api/`
- Core logic: Python in `lsh/`
- Data layer: Supabase with schema in `supabase/schema.sql`
- Deployment model: Vercel static frontend plus Python serverless/API route

## Users

Primary users are students, teachers, and researchers who need to understand and demonstrate how Locality-Sensitive Hashing (LSH) can detect plagiarism in text corpora. They work in a learning or evaluation context and need a tool that makes the algorithm visible step by step, not just a black-box result.

Secondary users include developers or technical evaluators checking the behavior of the LSH pipeline against brute-force similarity analysis.

## Product Purpose

This product makes plagiarism detection understandable by visualizing the pipeline from raw text to shingles, fingerprints, minhash signatures, banding, candidate selection, and final similarity verification. The system helps users inspect how LSH approximates Jaccard similarity and how candidate collisions, false positives, and false negatives arise.

Success means a user can paste or write text to compare, adjust LSH parameters (k, b, r, threshold), follow the algorithm step by step, and interpret the resulting evidence with clear visual summaries.

## Positioning

The product is a teaching and analysis tool rather than a production plagiarism enforcement system. Its distinctive mechanism is that it exposes the algorithmic steps of LSH and compares them directly with exact brute-force verification, making model behavior legible and explainable.

## Operating Context

The product is used in a local developer environment and browser-based workflow. Users may:

- write or paste texts into a bank of saved texts, and edit them later,
- paste new text directly into the app,
- compare a document against the stored corpus,
- inspect the step-by-step algorithm breakdown,
- evaluate the complete bank against brute-force matching,
- adjust parameters to understand their effect on recall, precision, and candidate counts.

The app includes a documented learning workflow around the chapter on shingling, minhash, and LSH from Mining of Massive Datasets.

## Capabilities and Constraints

Confirmed capabilities:

- compare a selected bank document against other documents,
- analyze new written or pasted text,
- save documents to the bank when enabled,
- visualize the LSH process step by step,
- show exact and approximate similarity results,
- evaluate all-vs-all document pairs in the bank,
- highlight shared passages in detected candidate text.

Confirmed constraints and technical facts:

- documents are limited to roughly 2 MB in the app notes,
- only written or pasted text is accepted; file and PDF uploads are not supported,
- signatures are recalculated per request with in-memory caching,
- the bank evaluation is capped to about 150 documents,
- `b * r` cannot exceed 400 hash functions,
- the app is not protected by authentication and is intended for local or low-risk sharing contexts.

## Brand Commitments

The product identity is rooted in the project name and educational framing:

- Name: `LSH-PlagioDocumentos`
- Product framing: plagiarism detection with LSH
- Tone: technical, educational, analytical, and transparent

No additional binding visual or branding assets were identified in the repository beyond the project name and the app’s instructional purpose.

## Evidence on Hand

The following repository artifacts confirm the current product record:

- `README.md`
- `web/src/App.tsx`
- `web/src/styles.css`
- `web/src/components/Stepper.tsx`
- `web/src/components/EvalPanel.tsx`
- `web/src/components/DocBank.tsx`
- `api/index.py` and supporting Python logic in `lsh/`
- `supabase/schema.sql`
- `web/package.json`

The project does not contain a separate design world or brand system yet; future work should treat the current implementation as the incumbent visual state, not as a final brand definition.

## Product Principles

1. Make algorithmic behavior legible, not opaque.
2. Let exact and approximate methods be compared directly.
3. Prioritize educational clarity and parameter understanding over hidden automation.
4. Keep the workflow practical for local learning, experimentation, and review.
5. Preserve the technical correctness of the LSH model while making its decisions traceable.

## Accessibility & Inclusion

No product-specific accessibility or inclusion requirements were identified in the repository beyond the general need for readable browser UI and clear technical labels. Future design work should preserve legibility, contrast, and clear interaction states in the web interface.
