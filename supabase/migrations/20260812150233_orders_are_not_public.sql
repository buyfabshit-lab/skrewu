-- These three policies granted the public role SELECT, INSERT and UPDATE on
-- every order, with no condition at all. The console reached the table from
-- the browser using the publishable key, and a publishable key is printed
-- inside the page, so in practice anyone at all could read every customer
-- name, email and street address in the system, and write orders into it.
--
-- Orders now travel through /api/orders, which authenticates the shop and
-- filters to that shop's rows, and through the signed Shopify webhook. Both
-- use the service role, which bypasses RLS, so removing these policies costs
-- the application nothing and closes the door to everyone else.
--
-- Every other table here already works this way: RLS on, no policies, reachable
-- only through a guarded function.

drop policy if exists "omniflow read"   on public.omniflow_orders;
drop policy if exists "omniflow insert" on public.omniflow_orders;
drop policy if exists "omniflow update" on public.omniflow_orders;
