-- Pedidos pendientes y ajustes de inventario para inventario.html
-- Ejecutar una sola vez en el SQL Editor del proyecto Supabase del inventario.
--
-- Supuestos sobre el esquema existente (verificar antes de ejecutar):
--   * productos.id es uuid y productos.stock_actual es numérico.
--   * profiles(id = auth.uid(), rol = 'jefe' | ...).
--   * Insertar en compras ya sube productos.stock_actual (trigger existente);
--     inventario.html nunca actualiza el stock directamente en una compra.
--
-- Toda escritura pasa por funciones (RPC). Las tablas nuevas solo permiten
-- SELECT desde el cliente, así nadie puede alterar cantidades a mano.

-- ─── Verificación previa ───────────────────────────────────────
-- Si productos.id no es uuid, se detiene aquí con un mensaje claro
-- (antes de crear nada) en vez de fallar a medias.
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
    from pg_attribute a
   where a.attrelid = 'public.productos'::regclass and a.attname = 'id' and not a.attisdropped;
  if t is distinct from 'uuid' then
    raise exception 'productos.id es de tipo % (se esperaba uuid). Avisa antes de continuar.', coalesce(t, 'desconocido');
  end if;
end $$;

-- ─── Helper de rol ───────────────────────────────────────────────
create or replace function public.inv_es_jefe()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and rol = 'jefe');
$$;

create or replace function public.inv_email_actual()
returns text language sql stable security definer set search_path = public, auth as $$
  select coalesce((select email from auth.users where id = auth.uid()), auth.uid()::text);
$$;

-- ─── Pedidos (compras registradas, pendientes de recibir) ────────
create table if not exists public.pedidos (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references public.productos(id) on delete cascade,
  cantidad_pedida   numeric not null check (cantidad_pedida > 0),
  cantidad_recibida numeric not null default 0 check (cantidad_recibida >= 0),
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'parcial', 'completo', 'cancelado')),
  tipo_compra       text,
  usuario           text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  constraint pedidos_no_exceder check (cantidad_recibida <= cantidad_pedida)
);
create index if not exists pedidos_abiertos_idx on public.pedidos (producto_id)
  where estado in ('pendiente', 'parcial');

alter table public.pedidos enable row level security;
drop policy if exists pedidos_select on public.pedidos;
create policy pedidos_select on public.pedidos for select to authenticated using (true);

-- Trazabilidad: cada recepción queda en compras ligada a su pedido.
alter table public.compras add column if not exists pedido_id uuid references public.pedidos(id);

-- ─── Ajustes (conteos / correcciones, historial propio) ──────────
create table if not exists public.ajustes (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references public.productos(id) on delete cascade,
  zona           text,
  stock_anterior numeric not null,
  stock_nuevo    numeric not null check (stock_nuevo >= 0),
  diferencia     numeric not null,
  motivo         text not null,
  usuario        text,
  creado_en      timestamptz not null default now()
);
create index if not exists ajustes_creado_idx on public.ajustes (creado_en desc);

alter table public.ajustes enable row level security;
drop policy if exists ajustes_select on public.ajustes;
create policy ajustes_select on public.ajustes for select to authenticated using (true);

-- ─── RPC: registrar compra → queda pendiente (solo jefes) ────────
create or replace function public.registrar_pedido(p_producto uuid, p_cantidad numeric, p_tipo text default null)
returns public.pedidos language plpgsql security definer set search_path = public as $$
declare v public.pedidos;
begin
  if not public.inv_es_jefe() then raise exception 'Solo jefes pueden registrar compras'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'Cantidad inválida'; end if;
  insert into public.pedidos (producto_id, cantidad_pedida, tipo_compra, usuario)
  values (p_producto, p_cantidad, p_tipo, public.inv_email_actual())
  returning * into v;
  return v;
end $$;

-- ─── RPC: recibir (total o parcial) — cualquier usuario ──────────
-- Único punto donde una compra sube stock: inserta en compras solo lo que llegó.
create or replace function public.recibir_pedido(p_pedido uuid, p_cantidad numeric)
returns public.pedidos language plpgsql security definer set search_path = public as $$
declare v public.pedidos; v_falta numeric; v_antes numeric; v_despues numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'Cantidad inválida'; end if;
  select * into v from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if v.estado not in ('pendiente', 'parcial') then raise exception 'El pedido ya está cerrado'; end if;
  v_falta := v.cantidad_pedida - v.cantidad_recibida;
  if p_cantidad > v_falta then raise exception 'Solo faltan % por recibir', v_falta; end if;

  update public.pedidos
     set cantidad_recibida = cantidad_recibida + p_cantidad,
         estado = case when cantidad_recibida + p_cantidad >= cantidad_pedida then 'completo' else 'parcial' end,
         actualizado_en = now()
   where id = p_pedido
  returning * into v;

  select coalesce(stock_actual, 0) into v_antes from public.productos where id = v.producto_id for update;
  insert into public.compras (producto_id, cantidad_comprada, usuario, pedido_id)
  values (v.producto_id, p_cantidad, public.inv_email_actual(), v.id);
  -- Normalmente el trigger existente de compras ya subió el stock. Si no existe
  -- ese trigger, se sube aquí; nunca se suma dos veces.
  select coalesce(stock_actual, 0) into v_despues from public.productos where id = v.producto_id;
  if v_despues = v_antes then
    update public.productos set stock_actual = v_antes + p_cantidad where id = v.producto_id;
  end if;
  return v;
end $$;

-- ─── RPC: cancelar lo que falta de un pedido (solo jefes) ────────
-- Lo ya recibido se queda en stock; solo deja de contarse "en camino".
create or replace function public.cancelar_pedido(p_pedido uuid)
returns public.pedidos language plpgsql security definer set search_path = public as $$
declare v public.pedidos;
begin
  if not public.inv_es_jefe() then raise exception 'Solo jefes pueden cancelar pedidos'; end if;
  update public.pedidos set estado = 'cancelado', actualizado_en = now()
   where id = p_pedido and estado in ('pendiente', 'parcial')
  returning * into v;
  if not found then raise exception 'El pedido no existe o ya está cerrado'; end if;
  return v;
end $$;

-- ─── RPC: ajuste de inventario — cualquier usuario ───────────────
-- Fija el stock al valor contado. No toca compras ni movimientos_salida.
create or replace function public.registrar_ajuste(p_producto uuid, p_stock_nuevo numeric, p_motivo text)
returns public.ajustes language plpgsql security definer set search_path = public as $$
declare v_prev numeric; v_zona text; v public.ajustes;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_stock_nuevo is null or p_stock_nuevo < 0 then raise exception 'Stock inválido'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'El motivo es obligatorio'; end if;
  select coalesce(stock_actual, 0), zona into v_prev, v_zona
    from public.productos where id = p_producto for update;
  if not found then raise exception 'El producto no existe'; end if;
  if p_stock_nuevo = v_prev then raise exception 'Sin cambios'; end if;

  update public.productos set stock_actual = p_stock_nuevo where id = p_producto;
  insert into public.ajustes (producto_id, zona, stock_anterior, stock_nuevo, diferencia, motivo, usuario)
  values (p_producto, v_zona, v_prev, p_stock_nuevo, p_stock_nuevo - v_prev, trim(p_motivo), public.inv_email_actual())
  returning * into v;
  return v;
end $$;

revoke all on function public.registrar_pedido(uuid, numeric, text) from public, anon;
revoke all on function public.recibir_pedido(uuid, numeric)         from public, anon;
revoke all on function public.cancelar_pedido(uuid)                 from public, anon;
revoke all on function public.registrar_ajuste(uuid, numeric, text) from public, anon;
grant execute on function public.registrar_pedido(uuid, numeric, text) to authenticated;
grant execute on function public.recibir_pedido(uuid, numeric)         to authenticated;
grant execute on function public.cancelar_pedido(uuid)                 to authenticated;
grant execute on function public.registrar_ajuste(uuid, numeric, text) to authenticated;

-- Que la API (PostgREST) vea las tablas y funciones nuevas de inmediato.
notify pgrst, 'reload schema';

-- ─── OPCIONAL (recomendado): cerrar la vía directa de compras ─────
-- La app ya no inserta en compras directamente; solo recibir_pedido lo hace.
-- Mientras este permiso siga abierto, alguien con la consola del navegador
-- podría insertar en compras y subir stock sin pedido. Quita los "--" para
-- aplicarlo. Ojo: cualquier copia VIEJA de la app que siga abierta en un
-- celular dejará de poder "Registrar compra" (lo cual es lo que se busca).
-- revoke insert, update, delete on public.compras from anon, authenticated;
