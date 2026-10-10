import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { RemoteRow, RemoteStore } from "../store/sync";
import type { StargateState } from "../store/types";

export type OAuthProvider = "github" | "google";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Sync is an optional feature: without these build-time settings the app stays local-only. */
export const syncConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!syncConfigured) throw new Error("Sync is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  client ??= createClient(url!, anonKey!, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  return client;
}

/** Where the OAuth provider sends the browser back: this page, without query or hash. */
function redirectUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export async function signIn(provider: OAuthProvider): Promise<void> {
  const { error } = await supabase().auth.signInWithOAuth({ provider, options: { redirectTo: redirectUrl() } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase().auth.signOut();
  if (error) throw error;
}

/** Calls back with the current session now and on every change; returns an unsubscribe function. */
export function watchSession(onSession: (session: Session | null) => void): () => void {
  const { data } = supabase().auth.onAuthStateChange((_event, session) => onSession(session));
  return () => data.subscription.unsubscribe();
}

const TABLE = "stargate_state";

/** The signed-in user's row in `stargate_state` (see supabase/schema.sql). */
export function supabaseRemote(userId: string): RemoteStore {
  const sb = supabase();
  return {
    async fetch(): Promise<RemoteRow | null> {
      const { data, error } = await sb.from(TABLE).select("data, revision").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data ? { data: data.data, revision: Number(data.revision) } : null;
    },

    async save(expectedRevision: number, state: StargateState): Promise<number | null> {
      const { data, error } = await sb.rpc("save_stargate_state", {
        expected_revision: expectedRevision,
        new_data: state,
      });
      if (error) throw error;
      return data === null ? null : Number(data);
    },

    subscribe(onChange: (revision: number) => void): () => void {
      const channel = sb
        .channel(`stargate-state-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: TABLE, filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as { revision?: unknown } | null;
            if (row && row.revision !== undefined) onChange(Number(row.revision));
          },
        )
        .subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}
