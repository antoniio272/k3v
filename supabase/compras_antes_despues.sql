-- Guarda en cada compra cuánto había antes y cuánto quedó (ej. 6 → 8).
-- Pegar en Supabase → SQL Editor → Run. Se puede correr varias veces.
-- Las compras anteriores quedan sin este dato (no se puede reconstruir).

alter table public.compras add column if not exists stock_anterior numeric;
alter table public.compras add column if not exists stock_nuevo numeric;

create or replace function public.compras_antes_despues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock numeric;
begin
  select coalesce(stock_actual, 0) into v_stock
  from public.productos
  where id = new.producto_id
  for update;

  new.stock_anterior := v_stock;
  new.stock_nuevo := v_stock + coalesce(new.cantidad_comprada, 0);
  return new;
end;
$$;

-- El nombre empieza con "a00_" para que corra antes que cualquier otro trigger BEFORE de compras.
drop trigger if exists a00_compras_antes_despues on public.compras;
create trigger a00_compras_antes_despues
  before insert on public.compras
  for each row execute function public.compras_antes_despues();
