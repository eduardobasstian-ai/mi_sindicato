
create function public.portal_transfer(target_union uuid,old_user uuid,new_user uuid,target_role text,actor uuid,reason text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.unions where id=target_union for update;
 if not exists(select 1 from private.site_admins where user_id=actor) then raise exception 'Acceso denegado'; end if;
 if nullif(trim(reason),'') is null then raise exception 'Indica el motivo'; end if;
 if not exists(select 1 from public.memberships where union_id=target_union and user_id=new_user and role='Socio conductor' and active) then raise exception 'Socio de destino inválido'; end if;
 update public.memberships set role='Socio conductor' where union_id=target_union and user_id=old_user and role=target_role and role<>'Socio conductor';
 if not found then raise exception 'El titular del cargo cambió'; end if;
 update public.memberships set role=target_role where union_id=target_union and user_id=new_user;
 insert into public.audit_events(union_id,actor_id,action,details) values(target_union,actor,'Traspaso de cargo',jsonb_build_object('role',target_role,'reason',reason,'previousHolder',old_user,'newHolder',new_user));
end;$$;
revoke all on function public.portal_transfer(uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.portal_transfer(uuid,uuid,uuid,text,uuid,text) to service_role;

