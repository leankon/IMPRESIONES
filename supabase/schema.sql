-- =====================================================================
--  IMPRESIONES — Esquema de base de datos para Supabase
--  Pegá TODO este archivo en Supabase > SQL Editor > New query > Run.
--  Se puede volver a correr sin romper nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Perfiles: quién puede entrar al panel y con qué rol
--   admin = vos (ve y edita todo)
--   papa  = solo ve la pantalla de retiro en la imprenta
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre  text,
  rol     text not null check (rol in ('admin', 'papa'))
);

create or replace function public.es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where user_id = auth.uid());
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where user_id = auth.uid() and rol = 'admin');
$$;

-- ---------------------------------------------------------------------
-- Ajustes: precios y datos de pago (una sola fila)
-- ---------------------------------------------------------------------
create table if not exists public.ajustes (
  id                  int primary key default 1 check (id = 1),
  precio_byn_simple   numeric not null default 60,   -- por carilla, simple faz
  precio_byn_doble    numeric not null default 50,   -- por carilla, doble faz
  precio_color_simple numeric not null default 150,
  precio_color_doble  numeric not null default 130,
  precio_anillado     numeric not null default 1500, -- por copia anillada
  descuento_umbral    int     not null default 0,    -- carillas (de PDFs) a partir de las cuales hay descuento. 0 = sin descuento
  descuento_pct       numeric not null default 0,
  alias               text,
  cvu                 text,
  titular             text,
  whatsapp            text,                          -- tu número, ej 5491122334455
  aviso               text,                          -- mensaje que se muestra arriba de la tienda
  pedidos_abiertos    boolean not null default true,
  updated_at          timestamptz not null default now()
);
insert into public.ajustes (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Catálogo de apuntes / libros con precio fijo
-- ---------------------------------------------------------------------
create table if not exists public.catalogo (
  id          bigint generated always as identity primary key,
  titulo      text not null,
  categoria   text,
  descripcion text,
  paginas     int,
  color       boolean not null default false,
  precio      numeric not null,
  activo      boolean not null default true,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
create table if not exists public.pedidos (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  nombre            text not null,
  telefono          text not null,
  curso             text,
  notas             text,
  items             jsonb not null,
  subtotal          numeric not null,
  descuento         numeric not null default 0,
  total             numeric not null,
  metodo_pago       text not null check (metodo_pago in ('mercadopago', 'transferencia')),
  estado_pago       text not null default 'pendiente'
                    check (estado_pago in ('pendiente', 'en_revision', 'pagado', 'rechazado')),
  comprobante_path  text,
  mp_preference_id  text,
  mp_payment_id     text,
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo', 'en_imprenta', 'retirado', 'entregado', 'cancelado')),
  verificacion      jsonb,
  nota_interna      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  pagado_at         timestamptz,
  imprenta_at       timestamptz,
  retirado_at       timestamptz,
  entregado_at      timestamptz
);
create index if not exists pedidos_estado_idx on public.pedidos (estado, estado_pago);
create index if not exists pedidos_created_idx on public.pedidos (created_at desc);

create or replace function public.tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists pedidos_updated on public.pedidos;
create trigger pedidos_updated before update on public.pedidos
  for each row execute function public.tocar_updated_at();

drop trigger if exists ajustes_updated on public.ajustes;
create trigger ajustes_updated before update on public.ajustes
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- Seguridad (RLS)
--   Los clientes NO tocan la tabla pedidos directo: lo hace el servidor
--   (carpeta /api) con la service role key, que recalcula los precios.
-- ---------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.ajustes  enable row level security;
alter table public.catalogo enable row level security;
alter table public.pedidos  enable row level security;

drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated
  using (user_id = auth.uid() or public.es_admin());

drop policy if exists ajustes_select on public.ajustes;
create policy ajustes_select on public.ajustes for select to anon, authenticated using (true);
drop policy if exists ajustes_update on public.ajustes;
create policy ajustes_update on public.ajustes for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists catalogo_select on public.catalogo;
create policy catalogo_select on public.catalogo for select to anon, authenticated
  using (activo or public.es_staff());
drop policy if exists catalogo_admin on public.catalogo;
create policy catalogo_admin on public.catalogo for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists pedidos_select on public.pedidos;
create policy pedidos_select on public.pedidos for select to authenticated
  using (public.es_staff());
-- Admin edita todo. Papá solo puede tocar pedidos que están en la imprenta / retirados.
drop policy if exists pedidos_update on public.pedidos;
create policy pedidos_update on public.pedidos for update to authenticated
  using (public.es_admin() or (public.es_staff() and estado in ('en_imprenta', 'retirado')))
  with check (public.es_admin() or (public.es_staff() and estado in ('en_imprenta', 'retirado')));
drop policy if exists pedidos_delete on public.pedidos;
create policy pedidos_delete on public.pedidos for delete to authenticated
  using (public.es_admin());

-- ---------------------------------------------------------------------
-- Archivos (PDFs de clientes y comprobantes de transferencia)
-- Bucket privado: cualquiera puede SUBIR, solo el staff puede VER.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('archivos', 'archivos', false, 52428800,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists archivos_subir on storage.objects;
create policy archivos_subir on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'archivos' and (storage.foldername(name))[1] in ('pdfs', 'comprobantes'));

drop policy if exists archivos_ver on storage.objects;
create policy archivos_ver on storage.objects for select to authenticated
  using (bucket_id = 'archivos' and public.es_staff());

drop policy if exists archivos_borrar on storage.objects;
create policy archivos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'archivos' and public.es_admin());

-- ---------------------------------------------------------------------
-- Catálogo inicial (los apuntes que ya tenías). Solo se carga si está vacío.
-- ---------------------------------------------------------------------
insert into public.catalogo (titulo, categoria, color, precio, orden)
select * from (values
  ('Toldot 1', 'Toldot', false, 8000, 1),
  ('Toldot 1', 'Toldot', true, 15500, 2),
  ('Toldot 2', 'Toldot', false, 7300, 3),
  ('Toldot 2', 'Toldot', true, 13900, 4),
  ('Toldot 3', 'Toldot', false, 9000, 5),
  ('Toldot 3', 'Toldot', true, 17000, 6),
  ('Toldot 4', 'Toldot', false, 15030, 7),
  ('Toldot 4', 'Toldot', true, 30000, 8),
  ('Dr Jekyll y Mr Hyde', 'Literatura', false, 5000, 9),
  ('Apunte Biología 1°', 'Biología', false, 9200, 10),
  ('Apunte Biología 1°', 'Biología', true, 17000, 11),
  ('Apunte Biología 2° — 1ra parte', 'Biología', false, 4500, 12),
  ('Apunte Biología 2° — 1ra parte', 'Biología', true, 6800, 13),
  ('Apunte Biología 2° — 2da parte', 'Biología', false, 7200, 14),
  ('Apunte Biología 2° — 2da parte', 'Biología', true, 13500, 15)
) as v(titulo, categoria, color, precio, orden)
where not exists (select 1 from public.catalogo);

-- ---------------------------------------------------------------------
-- Tiempo real: el panel se actualiza solo cuando entra un pedido
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.pedidos;
exception when duplicate_object then null;
end $$;
