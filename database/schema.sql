-- Estructura inicial de Mi Sindicato. Las cuentas se crean mediante Supabase Auth.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  rut text not null unique check (rut ~ '^[0-9]{7,8}[0-9K]$'),
  username text generated always as (left(rut, length(rut)-1)) stored unique,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  email text not null,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table private.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.site_admins enable row level security;
create table public.unions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug not in ('admin','api','panel','img')),
  rut text not null unique,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.memberships (
  union_id uuid not null references public.unions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'Socio conductor'
    check (role in ('Presidente','Secretario','Tesorero','Revisor de cuentas','Socio conductor')),
  active boolean not null default true,
  approved_by uuid references auth.users(id) on delete restrict,
  approval_reason text,
  created_at timestamptz not null default now(),
  primary key (union_id, user_id)
);
create unique index memberships_one_president on public.memberships(union_id) where role = 'Presidente';
create index memberships_user_idx on public.memberships(user_id, union_id);
create index memberships_approver_idx on public.memberships(approved_by);
create table public.driver_details (
  union_id uuid not null,
  user_id uuid not null,
  nationality_type text not null check (nationality_type in ('chilena','extranjera')),
  nationality text not null,
  address text not null,
  commune text not null,
  platforms text[] not null check (cardinality(platforms) > 0 and platforms <@ array['Uber','Didi','Indrive','GetGo','Cabify','Otras']::text[]),
  vehicle_model text not null,
  vehicle_year integer not null check (vehicle_year between 1900 and 2200),
  plate text not null,
  primary key (union_id, user_id),
  foreign key (union_id,user_id) references public.memberships(union_id,user_id) on delete cascade
);
create index driver_details_user_idx on public.driver_details(user_id);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  union_id uuid references public.unions(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_union_idx on public.audit_events(union_id,created_at desc);
create index audit_events_actor_idx on public.audit_events(actor_id);
create table public.media_objects (
  id uuid primary key default gen_random_uuid(),
  union_id uuid not null references public.unions(id) on delete cascade,
  owner_id uuid not null,
  bucket text not null default 'mi-sindicato-imagenes' check (bucket = 'mi-sindicato-imagenes'),
  object_key text not null unique,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  foreign key (union_id,owner_id) references public.memberships(union_id,user_id) on delete cascade,
  check (object_key like union_id::text || '/%')
);
create index media_objects_owner_idx on public.media_objects(owner_id,union_id);

-- Estas funciones internas evitan recursión en RLS y usan solo la identidad autenticada.
create function private.is_site_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
 select auth.uid() is not null and coalesce(auth.jwt()->>'aal' = 'aal2', false)
 and exists(select 1 from private.site_admins a where a.user_id = auth.uid());
$$;
create function private.union_role(target uuid) returns text
language sql stable security definer set search_path = ''
as $$
 select m.role from public.memberships m
 join public.unions u on u.id=m.union_id
 join public.profiles p on p.id=m.user_id
 where auth.uid() is not null and m.user_id=auth.uid() and m.union_id=target
 and m.active and u.active and p.active and not p.must_change_password;
$$;
create function private.can_read_person(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
 select auth.uid() is not null and exists(
 select 1 from public.memberships m where m.user_id=target
 and private.union_role(m.union_id)='Presidente');
$$;
revoke all on function private.is_site_admin(), private.union_role(uuid), private.can_read_person(uuid) from public, anon;
grant execute on function private.is_site_admin(), private.union_role(uuid), private.can_read_person(uuid) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.unions enable row level security;
alter table public.memberships enable row level security;
alter table public.driver_details enable row level security;
alter table public.audit_events enable row level security;
alter table public.media_objects enable row level security;
revoke all on public.profiles,public.unions,public.memberships,public.driver_details,public.audit_events,public.media_objects from anon,authenticated;
grant select on public.profiles,public.unions,public.memberships,public.driver_details,public.audit_events,public.media_objects to authenticated;
grant all on public.profiles,public.unions,public.memberships,public.driver_details,public.audit_events,public.media_objects to service_role;
grant all on private.site_admins to service_role;

create policy profiles_read on public.profiles for select to authenticated
 using (id=(select auth.uid()) or (select private.is_site_admin()) or private.can_read_person(id));
create policy unions_read on public.unions for select to authenticated
 using ((select private.is_site_admin()) or private.union_role(id) is not null);
create policy memberships_read on public.memberships for select to authenticated
 using ((select private.is_site_admin()) or
 (private.union_role(union_id) is not null and (user_id=(select auth.uid()) or private.union_role(union_id)='Presidente')));
create policy drivers_read on public.driver_details for select to authenticated
 using ((select private.is_site_admin()) or
 (private.union_role(union_id) is not null and (user_id=(select auth.uid()) or private.union_role(union_id)='Presidente')));
create policy audit_read on public.audit_events for select to authenticated
 using ((select private.is_site_admin()) or private.union_role(union_id)='Presidente');
create policy media_read on public.media_objects for select to authenticated
 using ((select private.is_site_admin()) or
 (private.union_role(union_id) is not null and (owner_id=(select auth.uid()) or private.union_role(union_id)='Presidente')));

-- Las altas, cambios de cargo y claves pasan por funciones de servidor.
-- Se limita también la doble afiliación en la base, con bloqueo por persona.
create function private.enforce_membership() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare total integer;
begin
 if tg_op='UPDATE' and (new.user_id<>old.user_id or new.union_id<>old.union_id) then
   raise exception 'La identidad de la afiliación no puede cambiar';
 end if;
 perform 1 from public.profiles where id=new.user_id for update;
 if tg_op='INSERT' then
   select count(*) into total from public.memberships where user_id=new.user_id;
   if total>=2 then raise exception 'Solo se permiten dos sindicatos por cuenta'; end if;
   if total=1 and (new.approved_by is null or nullif(trim(new.approval_reason),'') is null or
     not exists(select 1 from private.site_admins where user_id=new.approved_by)) then
     raise exception 'La segunda afiliación requiere autorización del administrador general';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function private.enforce_membership() from public,anon,authenticated;
create trigger enforce_membership before insert or update on public.memberships
 for each row execute function private.enforce_membership();
