-- ms_users.id pointed at auth.users, so every wallet required a Supabase Auth
-- account. This platform has no signup at all — a link is the credential — so
-- that constraint makes a tenant wallet impossible without inventing accounts
-- nobody asked for.
--
-- Dropping it changes no existing row and no existing flow: the email site
-- still creates an auth user and a matching wallet. It only stops the database
-- insisting that every wallet come from auth.
--
-- It also drops an ON DELETE CASCADE, and that is the better outcome here: a
-- credit balance is money somebody paid for. Deleting an auth record should
-- not silently destroy a paid balance and its ledger with no trace. An orphan
-- wallet is a bookkeeping question; a vanished one is a refund request.
alter table public.ms_users drop constraint ms_users_id_fkey;

comment on column public.ms_users.tenant_slug is
  'The tenant this wallet belongs to. Null for the older email accounts.';
