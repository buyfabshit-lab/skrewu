-- The credit system already existed, designed around an email account. The
-- platform has no accounts — a link is the credential — so give the credit
-- account a way to belong to a tenant instead of inventing a second wallet.
-- Existing email users keep working; theirs is simply null.

alter table public.ms_users
  add column if not exists tenant_slug text references public.tenants(slug) on update cascade;

create unique index if not exists ms_users_tenant_slug_key
  on public.ms_users (tenant_slug) where tenant_slug is not null;

-- A purchase must never be able to land twice, however many times Stripe
-- redelivers the same event.
create unique index if not exists ms_credit_ledger_stripe_event_key
  on public.ms_credit_ledger (stripe_event) where stripe_event is not null;

create index if not exists ms_credit_ledger_user_idx
  on public.ms_credit_ledger (user_id, created_at desc);


/* The wallet for a tenant, made on first sight so nobody has to sign up. */
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
  on conflict (tenant_slug) do nothing
  returning id into v_id;

  if v_id is null then select id into v_id from ms_users where tenant_slug = p_slug; end if;
  return v_id;
end $$;


/* Spend. One statement decides it, so two tabs generating at the same moment
   cannot both pass a balance check and overdraw. Returns the new balance, or
   -1 when there wasn't enough — the caller refuses the work rather than doing
   it for free. */
create or replace function public.ms_spend(p_user uuid, p_amount int, p_why text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_after int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  update ms_users
     set credits_balance = credits_balance - p_amount,
         credits_used    = credits_used + p_amount,
         updated_at      = now()
   where id = p_user and credits_balance >= p_amount
   returning credits_balance into v_after;

  if v_after is null then return -1; end if;

  insert into ms_credit_ledger (user_id, amount, balance_after, type, description)
  values (p_user, -p_amount, v_after, 'spend', p_why);

  return v_after;
end $$;


/* Grant — a purchase, a refund, a monthly top-up. Idempotent on the Stripe
   event id: the same event delivered ten times adds credits once. */
create or replace function public.ms_grant(p_user uuid, p_amount int, p_type text,
                                           p_why text, p_event text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_after int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  if p_event is not null and exists (select 1 from ms_credit_ledger where stripe_event = p_event) then
    select credits_balance into v_after from ms_users where id = p_user;
    return v_after;               -- already counted; say the balance, add nothing
  end if;

  update ms_users
     set credits_balance = credits_balance + p_amount, updated_at = now()
   where id = p_user
   returning credits_balance into v_after;

  if v_after is null then raise exception 'no such wallet'; end if;

  insert into ms_credit_ledger (user_id, amount, balance_after, type, description, stripe_event)
  values (p_user, p_amount, v_after, coalesce(p_type,'purchase'), p_why, p_event)
  on conflict (stripe_event) do nothing;

  return v_after;
end $$;


/* Refund what a failed generation took. Same shape as a grant, different word
   in the ledger so the books tell the truth about what happened. */
create or replace function public.ms_refund(p_user uuid, p_amount int, p_why text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_after int;
begin
  update ms_users
     set credits_balance = credits_balance + p_amount,
         credits_used    = greatest(0, credits_used - p_amount),
         updated_at      = now()
   where id = p_user
   returning credits_balance into v_after;

  insert into ms_credit_ledger (user_id, amount, balance_after, type, description)
  values (p_user, p_amount, v_after, 'refund', p_why);

  return v_after;
end $$;


-- Only the server may move money. These are reachable with the service role
-- and by nobody else.
revoke execute on function public.ms_wallet_for_tenant(text) from public, anon, authenticated;
revoke execute on function public.ms_spend(uuid, int, text)   from public, anon, authenticated;
revoke execute on function public.ms_grant(uuid, int, text, text, text) from public, anon, authenticated;
revoke execute on function public.ms_refund(uuid, int, text)  from public, anon, authenticated;
