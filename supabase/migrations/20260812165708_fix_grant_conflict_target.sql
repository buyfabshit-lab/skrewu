-- Same partial-index trap as the wallet insert: the unique index on
-- stripe_event ignores rows where it's null (spends and refunds have no
-- event), so ON CONFLICT must repeat that predicate to match the index.
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
  on conflict (stripe_event) where stripe_event is not null do nothing;

  return v_after;
end $$;

revoke execute on function public.ms_grant(uuid, int, text, text, text) from public, anon, authenticated;
