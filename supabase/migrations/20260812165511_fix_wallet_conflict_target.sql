-- The unique index on tenant_slug is partial (it ignores the email accounts,
-- whose tenant_slug is null), so ON CONFLICT has to repeat that predicate to
-- match it. Without this a second call raced against the first and threw.
create or replace function public.ms_wallet_for_tenant(p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from ms_users where tenant_slug = p_slug;
  if v_id is not null then return v_id; end if;

  insert into ms_users (tenant_slug, display_name, plan_id, credits_balance, credits_used)
  select p_slug, t.name, 'free', 0, 0 from tenants t where t.slug = p_slug
  on conflict (tenant_slug) where tenant_slug is not null do nothing
  returning id into v_id;

  if v_id is null then select id into v_id from ms_users where tenant_slug = p_slug; end if;
  return v_id;
end $$;

revoke execute on function public.ms_wallet_for_tenant(text) from public, anon, authenticated;
