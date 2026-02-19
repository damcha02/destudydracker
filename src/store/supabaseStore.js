import { supabase } from "../auth/supabaseClient.js";

export function createSupabaseStore(emitter) {
  async function requireUser() {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) throw new Error("Not authenticated");
    return data.user;
  }

  return {
    async getSessions() {
      const user = await requireUser();
      const { data, error } = await supabase
        .from("sessions")
        .select("date, minutes, is_exam")
        .eq("user_id", user.id)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(s => ({
        date: s.date,
        minutes: s.minutes,
        exam: !!s.is_exam,
      }));
    },

    async addSession({ date, minutes, isExam }) {
      const user = await requireUser();
      const { error } = await supabase.from("sessions").insert({
        user_id: user.id,
        date,
        minutes,
        is_exam: !!isExam,
      });
      if (error) throw error; 
    },

    async getProjects() {
      const user = await requireUser();
      const { data, error } = await supabase
        .from("user_data")
        .select("data_json")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.data_json?.projects ?? []; // store projects under {projects:[...]}
    },

    async setProjects(projects) {
      const user = await requireUser();

      // read existing json (so we don't overwrite username or other fields)
      const { data: existing, error: readErr } = await supabase
        .from("user_data")
        .select("data_json")
        .eq("user_id", user.id)
        .maybeSingle();

      if (readErr) throw readErr;

      const current = existing?.data_json && typeof existing.data_json === "object"
        ? existing.data_json
        : {};

      const nextJson = { ...current, projects: Array.isArray(projects) ? projects : [] };

      const { error: upsertErr } = await supabase.from("user_data").upsert({
        user_id: user.id,
        data_json: nextJson,
      });

      if (upsertErr) throw upsertErr;
      emitter.emit("projects:changed");
    },
  };
}
