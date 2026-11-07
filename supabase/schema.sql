create extension if not exists "pgcrypto";

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  char_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- La API usa la service_role key desde el servidor. Con RLS activo y sin políticas,
-- el navegador (clave anónima) no puede leer ni escribir esta tabla.
alter table public.documents enable row level security;
