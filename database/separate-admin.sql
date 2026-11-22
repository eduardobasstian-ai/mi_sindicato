
alter table private.site_admins add column rut text, add column full_name text, add column email text,
 add column active boolean not null default true, add column must_change_password boolean not null default true;
update private.site_admins a set rut=p.rut,full_name=p.full_name,email=p.email,must_change_password=p.must_change_password,active=p.active from public.profiles p where p.id=a.user_id;
delete from public.profiles p using private.site_admins a where p.id=a.user_id and not exists(select 1 from public.memberships m where m.user_id=p.id);
alter table public.profiles add column auth_email text;
update public.profiles p set auth_email=u.email from auth.users u where u.id=p.id;
alter table public.profiles alter column auth_email set not null;
create unique index site_admins_rut_idx on private.site_admins(rut) where rut is not null;
create function public.portal_admin_identity(identifier text) returns table(id uuid,rut text,full_name text,email text,active boolean,must_change_password boolean)
language sql security invoker set search_path='' as $$
 select a.user_id,a.rut,a.full_name,a.email,a.active,a.must_change_password from private.site_admins a
 where lower(a.email)=lower(identifier) or a.rut=identifier or left(a.rut,length(a.rut)-1)=identifier;
$$;
create function public.portal_admin_profile(target uuid) returns table(id uuid,rut text,full_name text,email text,active boolean,must_change_password boolean)
language sql security invoker set search_path='' as $$
 select a.user_id,a.rut,a.full_name,a.email,a.active,a.must_change_password from private.site_admins a where a.user_id=target;
$$;
create function public.portal_admin_password_changed(target uuid) returns void language sql security invoker set search_path='' as $$
 update private.site_admins set must_change_password=false where user_id=target;
$$;
revoke all on function public.portal_admin_identity(text),public.portal_admin_profile(uuid),public.portal_admin_password_changed(uuid) from public,anon,authenticated;
grant execute on function public.portal_admin_identity(text),public.portal_admin_profile(uuid),public.portal_admin_password_changed(uuid) to service_role;

