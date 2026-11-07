create extension if not exists "pgcrypto";

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  char_count integer not null default 0,
  created_at timestamptz not null default now(),
  -- Textos largos: se guardan en fragmentos que comparten group_id (el «contenedor»)
  group_id uuid,
  group_name text,
  frag_index integer
);

-- Si la tabla ya existía, estas líneas la actualizan sin perder datos:
alter table public.documents add column if not exists group_id uuid;
alter table public.documents add column if not exists group_name text;
alter table public.documents add column if not exists frag_index integer;
create index if not exists documents_group_id_idx on public.documents (group_id);

-- La API usa la service_role key desde el servidor. Con RLS activo y sin políticas,
-- el navegador (clave anónima) no puede leer ni escribir esta tabla.
alter table public.documents enable row level security;
