-- A tenant wallet has no email — the platform deliberately has no signup, and
-- inventing an address that looks real is worse than having none: something
-- would eventually try to send mail to it.
--
-- So email becomes optional, and a constraint keeps the table honest: a wallet
-- belongs to an email account or to a tenant, and never to neither.
alter table public.ms_users alter column email drop not null;

alter table public.ms_users
  add constraint ms_users_has_an_owner
  check (email is not null or tenant_slug is not null);
