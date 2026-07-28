// Central environment configuration. Everything the server needs is read from
// process.env here so nothing is hardcoded elsewhere.
export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 3000),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseBucket: process.env.SUPABASE_BUCKET ?? "",
};
