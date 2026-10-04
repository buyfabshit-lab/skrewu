-- Review only: this file has not been applied to the live store.
-- Verify on staging, run advisors, then generate the migration with Supabase CLI.
-- Existing table grants and RLS continue to apply to these additional columns.
begin;
alter table public.retail_products add column if not exists artwork_path text not null default '';
alter table public.retail_products add column if not exists design_spec jsonb;
commit;
