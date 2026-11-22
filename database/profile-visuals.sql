
create table public.member_visuals (
 union_id uuid not null, user_id uuid not null, avatar_key text, vehicle_photo_key text,
 primary key(union_id,user_id),
 foreign key(union_id,user_id) references public.memberships(union_id,user_id) on delete cascade
);
create table public.member_vehicles (
 union_id uuid not null,user_id uuid not null,model text not null,year integer not null check(year between 1900 and 2200),plate text not null,
 primary key(union_id,user_id),
 foreign key(union_id,user_id) references public.memberships(union_id,user_id) on delete cascade
);
create table public.vehicle_requests (
 id uuid primary key default gen_random_uuid(),union_id uuid not null,user_id uuid not null,
 model text not null check(length(trim(model)) between 1 and 120),year integer not null check(year between 1900 and 2200),
 plate text not null check(length(trim(plate)) between 4 and 20),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references public.profiles(id),created_at timestamptz not null default now(),reviewed_at timestamptz,
 foreign key(union_id,user_id) references public.memberships(union_id,user_id) on delete cascade
);
create unique index vehicle_requests_pending on public.vehicle_requests(union_id,user_id) where status='pending';
create index vehicle_requests_user_idx on public.vehicle_requests(user_id);
create index vehicle_requests_reviewer_idx on public.vehicle_requests(reviewed_by);
create index member_visuals_user_idx on public.member_visuals(user_id);
create index member_vehicles_user_idx on public.member_vehicles(user_id);
alter table public.member_visuals enable row level security;
alter table public.member_vehicles enable row level security;
alter table public.vehicle_requests enable row level security;
revoke all on public.member_visuals,public.member_vehicles,public.vehicle_requests from anon,authenticated;
grant select on public.member_visuals,public.member_vehicles,public.vehicle_requests to authenticated;
grant all on public.member_visuals,public.member_vehicles,public.vehicle_requests to service_role;
create policy visuals_read on public.member_visuals for select to authenticated using(
 (select private.is_site_admin()) or (private.union_role(union_id) is not null and (user_id=(select auth.uid()) or private.union_role(union_id) in ('Presidente','Tesorero','Secretario'))));
create policy vehicles_read on public.member_vehicles for select to authenticated using(
 (select private.is_site_admin()) or (private.union_role(union_id) is not null and (user_id=(select auth.uid()) or private.union_role(union_id) in ('Presidente','Tesorero','Secretario'))));
create policy vehicle_requests_read on public.vehicle_requests for select to authenticated using(
 (select private.is_site_admin()) or (private.union_role(union_id) is not null and (user_id=(select auth.uid()) or private.union_role(union_id) in ('Presidente','Tesorero','Secretario'))));
create function public.portal_review_vehicle(request_id uuid,actor uuid,approve boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.vehicle_requests; reviewer text;
begin
 select * into r from public.vehicle_requests where id=request_id for update;
 if not found or r.status<>'pending' then raise exception 'La solicitud ya fue revisada o no existe';end if;
 select m.role into reviewer from public.memberships m join public.profiles p on p.id=m.user_id join public.unions u on u.id=m.union_id
 where m.union_id=r.union_id and m.user_id=actor and m.active and p.active and not p.must_change_password and u.active;
 if reviewer is null or reviewer not in ('Presidente','Tesorero','Secretario') then raise exception 'Acceso denegado';end if;
 if not exists(select 1 from public.memberships where union_id=r.union_id and user_id=r.user_id and active) then raise exception 'Afiliación inactiva';end if;
 if approve then
 insert into public.member_vehicles(union_id,user_id,model,year,plate) values(r.union_id,r.user_id,r.model,r.year,r.plate)
 on conflict(union_id,user_id) do update set model=excluded.model,year=excluded.year,plate=excluded.plate;
 update public.driver_details set vehicle_model=r.model,vehicle_year=r.year,plate=r.plate where union_id=r.union_id and user_id=r.user_id;
 update public.member_visuals set vehicle_photo_key=null where union_id=r.union_id and user_id=r.user_id;
 end if;
 update public.vehicle_requests set status=case when approve then 'approved' else 'rejected' end,reviewed_by=actor,reviewed_at=now() where id=r.id;
 insert into public.audit_events(union_id,actor_id,action,details) values(r.union_id,actor,'Revisión de vehículo',jsonb_build_object('request',r.id,'approved',approve));
end;$$;
revoke all on function public.portal_review_vehicle(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.portal_review_vehicle(uuid,uuid,boolean) to service_role;

