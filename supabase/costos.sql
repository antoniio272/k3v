-- Sección "Costos": catálogo de costos de insumos, aparte del inventario.
-- Pegar en Supabase → SQL Editor → Run. Se puede correr varias veces.
-- No modifica la tabla productos ni el inventario.

-- 1) Tabla de costos (una fila por insumo)
create table if not exists public.costos (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid references public.productos(id) on delete set null, -- producto del inventario ligado (opcional)
  nombre             text not null,
  medida             text,            -- ej. "1 bidón (20 L)", "3.52 kg"
  costo              numeric(12,2) not null default 0,
  piezas             numeric(12,3),   -- piezas / porciones que salen de esa medida
  piezas_media_orden numeric(12,3),
  piezas_orden       numeric(12,3),
  tienda             text,
  anotaciones        text,
  actualizado_por    text,
  actualizado_en     timestamptz not null default now(),
  creado_en          timestamptz not null default now()
);

-- 2) Historial: cada cambio a un costo (antes → después, quién y cuándo)
create table if not exists public.costos_historial (
  id            bigserial primary key,
  costo_id      uuid references public.costos(id) on delete cascade,
  nombre        text,
  campo         text,
  valor_antes   text,
  valor_despues text,
  usuario       text,
  creado_en     timestamptz not null default now()
);

-- 3) ¿El usuario actual es jefe?
create or replace function public.es_jefe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and rol = 'jefe');
$$;

-- 4) Registrar quién y cuándo, y guardar el historial automáticamente
create or replace function public.costos_antes_guardar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := coalesce(auth.jwt() ->> 'email', new.actualizado_por);
  return new;
end;
$$;

create or replace function public.costos_despues_guardar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  a text;
  d text;
begin
  if tg_op = 'INSERT' then
    insert into public.costos_historial (costo_id, nombre, campo, valor_antes, valor_despues, usuario)
    values (new.id, new.nombre, '(alta)', null, 'insumo creado', new.actualizado_por);
    return new;
  end if;
  foreach k in array array['nombre','medida','costo','piezas','piezas_media_orden','piezas_orden','tienda','anotaciones','producto_id'] loop
    a := to_jsonb(old) ->> k;
    d := to_jsonb(new) ->> k;
    if a is distinct from d then
      insert into public.costos_historial (costo_id, nombre, campo, valor_antes, valor_despues, usuario)
      values (new.id, new.nombre, k, a, d, new.actualizado_por);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists costos_antes_guardar on public.costos;
create trigger costos_antes_guardar
  before insert or update on public.costos
  for each row execute function public.costos_antes_guardar();

drop trigger if exists costos_despues_guardar on public.costos;
create trigger costos_despues_guardar
  after insert or update on public.costos
  for each row execute function public.costos_despues_guardar();

-- 5) Seguridad: solo los jefes pueden ver y editar costos
alter table public.costos enable row level security;
alter table public.costos_historial enable row level security;

drop policy if exists costos_jefes_leer on public.costos;
drop policy if exists costos_jefes_crear on public.costos;
drop policy if exists costos_jefes_editar on public.costos;
drop policy if exists costos_jefes_borrar on public.costos;
create policy costos_jefes_leer   on public.costos for select to authenticated using (public.es_jefe());
create policy costos_jefes_crear  on public.costos for insert to authenticated with check (public.es_jefe());
create policy costos_jefes_editar on public.costos for update to authenticated using (public.es_jefe()) with check (public.es_jefe());
create policy costos_jefes_borrar on public.costos for delete to authenticated using (public.es_jefe());

drop policy if exists costos_historial_jefes_leer on public.costos_historial;
create policy costos_historial_jefes_leer on public.costos_historial for select to authenticated using (public.es_jefe());
