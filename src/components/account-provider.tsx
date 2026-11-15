"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
type Account = {
  client: ReturnType<typeof getSupabaseClient>;
  user: User | null;
  loading: boolean;
  phone: string;
  verified: boolean;
  error: string;
};
const Context = createContext<Account | null>(null);
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(getSupabaseClient);
  const [user, setUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<{
    owner: string;
    phone: string;
    verified: boolean;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!client) return;
    let alive = true;
    let changed = false;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      changed = true;
      // Defer downstream profile queries until Supabase releases its auth lock.
      setTimeout(() => {
        if (alive) {
          setUser(session?.user ?? null);
          setSessionReady(true);
        }
      }, 0);
    });
    void client.auth.getSession().then(({ data }) => {
      if (alive && !changed) {
        setUser(data.session?.user ?? null);
        setSessionReady(true);
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  const owner = user?.id;
  useEffect(() => {
    if (!client || !owner) return;
    let alive = true;
    void Promise.resolve(client
      .from("profiles")
      .select("destination,verified_at")
      .eq("user_id", owner)
      .abortSignal(AbortSignal.timeout(12000))
      .maybeSingle())
      .then(({ data, error }) => {
        if (alive)
          setProfile({
            owner,
            phone: data?.destination ?? "",
            verified: !!data?.verified_at,
            error: error
              ? "We couldn’t load your phone settings. Please reload to try again."
              : "",
          });
      })
      .catch(() => {
        if (alive)
          setProfile({
            owner,
            phone: "",
            verified: false,
            error:
              "We couldn’t load your phone settings. Please reload to try again.",
          });
      });
    return () => {
      alive = false;
    };
  }, [client, owner]);
  const current = profile?.owner === owner ? profile : null;
  // Editable metadata is a contact request, never evidence of ownership or send authorization.
  const requested =
    typeof user?.user_metadata?.contact_phone === "string"
      ? user.user_metadata.contact_phone
      : "";
  return (
    <Context.Provider
      value={{
        client,
        user,
        loading: !!client && (!sessionReady || (!!user && !current)),
        phone: requested || current?.phone || "",
        verified:
          !!current?.verified && (!requested || requested === current.phone),
        error: current?.error ?? "",
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("AccountProvider is required.");
  return value;
}
