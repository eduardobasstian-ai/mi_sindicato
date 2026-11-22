create index media_objects_union_owner_idx on public.media_objects(union_id,owner_id);
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
create policy site_admins_server_only on private.site_admins for all to service_role using (true) with check (true);
