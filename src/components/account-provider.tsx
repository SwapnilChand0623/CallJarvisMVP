"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

type Profile = {
  owner: string;
  phone: string;
  verified: boolean;
  callingEnabled: boolean;
  error: string;
};
type Account = {
  client: ReturnType<typeof getSupabaseClient>;
  user: User | null;
  loading: boolean;
  phone: string;
  verified: boolean;
  callingEnabled: boolean;
  error: string;
  refreshProfile: () => Promise<void>;
};
const Context = createContext<Account | null>(null);

async function readProfile(
  client: SupabaseClient,
  owner: string,
): Promise<Profile> {
  const [profileResult, ruleResult] = await Promise.all([
    client
      .from("profiles")
      .select("destination,verified_at,outreach_enabled,opted_in_channels")
      .eq("user_id", owner)
      .abortSignal(AbortSignal.timeout(12000))
      .maybeSingle(),
    client
      .from("communication_rules")
      .select("critical_channel")
      .eq("user_id", owner)
      .abortSignal(AbortSignal.timeout(12000))
      .maybeSingle(),
  ]);
  const { data, error } = profileResult;
  if (error || ruleResult.error || !data)
    throw new Error(
      "We couldn’t load your phone settings. Please reload to try again.",
    );
  return {
    owner,
    phone: data.destination ?? "",
    verified: !!data.verified_at,
    callingEnabled:
      !!data.verified_at &&
      !!data.destination &&
      data.outreach_enabled === true &&
      data.opted_in_channels?.includes("facetime") === true &&
      ruleResult.data?.critical_channel === "facetime",
    error: "",
  };
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(getSupabaseClient);
  const [user, setUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    if (!client) return;
    let alive = true;
    let changed = false;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      changed = true;
      // Defer downstream queries until Supabase releases its auth lock.
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
    void readProfile(client, owner)
      .then((value) => {
        if (alive) setProfile(value);
      })
      .catch(() => {
        if (alive)
          setProfile({
            owner,
            phone: "",
            verified: false,
            callingEnabled: false,
            error:
              "We couldn’t load your phone settings. Please reload to try again.",
          });
      });
    return () => {
      alive = false;
    };
  }, [client, owner]);
  const refreshProfile = useCallback(async () => {
    if (!client || !owner) throw new Error("Sign in to finish phone setup.");
    const value = await readProfile(client, owner);
    setProfile(value);
  }, [client, owner]);
  const current = profile?.owner === owner ? profile : null;
  return (
    <Context.Provider
      value={{
        client,
        user,
        loading: !!client && (!sessionReady || (!!user && !current)),
        phone: current?.phone ?? "",
        verified: current?.verified ?? false,
        callingEnabled: current?.callingEnabled ?? false,
        error: current?.error ?? "",
        refreshProfile,
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
