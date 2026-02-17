import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  import.meta.env?.VITE_SUPABASE_URL ?? window.SUPABASE_URL,
  import.meta.env?.VITE_SUPABASE_ANON_KEY ?? window.SUPABASE_ANON_KEY
);
