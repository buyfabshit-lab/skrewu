-- ms_users.id was always supplied by whatever created the account, so the
-- column has no default and a plain insert fails. A generated uuid makes the
-- table usable on its own — which is what a tenant wallet needs.
--
-- (The comment applied against the live database claimed nothing referenced
-- this column as a foreign key. That was wrong: it pointed at auth.users. The
-- statement below is unchanged; only the wrong sentence is corrected here, so
-- nobody reads it later and believes it. The constraint is dealt with three
-- migrations along, in wallet_not_bound_to_auth.)
alter table public.ms_users alter column id set default gen_random_uuid();
