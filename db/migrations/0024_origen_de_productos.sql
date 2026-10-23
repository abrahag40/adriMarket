-- 0024 · De dónde viene cada producto cargado solo
--
-- El sitio de cada cliente carga sus tours desde las fichas que el cliente llena
-- en zahardev-intake (src/modules/catalog/intake-sync.ts). Esta tabla recuerda qué
-- ficha produjo qué producto y en qué versión, para que una ficha corregida
-- ACTUALICE su tour en lugar de crear otro, y una ficha sin cambios no toque nada.
--
-- Un producto creado a mano en el panel no tiene fila aquí y la sincronización no
-- lo toca nunca.

create table product_sources (
  product_id   uuid primary key references products (id) on delete cascade,
  source       text not null check (source in ('zahardev-intake')),
  external_id  text not null,
  external_rev integer not null,
  synced_at    timestamptz not null default now(),
  unique (source, external_id)
);
