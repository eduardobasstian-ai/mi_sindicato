
create table public.union_updates(
 id uuid primary key default gen_random_uuid(),
 union_id uuid not null references public.unions(id) on delete cascade,
 author_id uuid references public.profiles(id) on delete set null,
 author_name text not null,
 author_role text not null check(author_role in ('Presidente','Tesorero','Secretario','Revisor de cuentas')),
 title text not null check(length(trim(title)) between 1 and 160),
 body text not null check(length(trim(body)) between 1 and 10000),
 created_at timestamptz not null default now()
);
create index union_updates_union_date_idx on public.union_updates(union_id,created_at desc);
create index union_updates_author_idx on public.union_updates(author_id);
alter table public.union_updates enable row level security;
revoke all on public.union_updates from anon,authenticated;
grant select on public.union_updates to authenticated;
grant all on public.union_updates to service_role;
create policy union_updates_read on public.union_updates for select to authenticated
 using ((select private.is_site_admin()) or private.union_role(union_id) is not null);
create function public.portal_assign_office(target_union uuid,target_user uuid,new_role text,actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare prior_role text;
begin
 perform 1 from public.unions where id=target_union and active for update;
 if not found then raise exception 'Sindicato inactivo'; end if;
 if not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id where m.union_id=target_union and m.user_id=actor and m.role='Presidente' and m.active and p.active and not p.must_change_password) then raise exception 'Solo el presidente puede asignar cargos'; end if;
 if new_role not in ('Tesorero','Secretario','Revisor de cuentas','Socio conductor') then raise exception 'Cargo inválido'; end if;
 select role into prior_role from public.memberships where union_id=target_union and user_id=target_user and active;
 if prior_role is null or prior_role='Presidente' then raise exception 'Selecciona un socio activo distinto del presidente'; end if;
 update public.memberships set role=new_role where union_id=target_union and user_id=target_user;
 insert into public.audit_events(union_id,actor_id,action,details) values(target_union,actor,'Asignación de cargo',jsonb_build_object('previousRole',prior_role,'newRole',new_role,'person',target_user));
end;$$;
revoke all on function public.portal_assign_office(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.portal_assign_office(uuid,uuid,text,uuid) to service_role;

