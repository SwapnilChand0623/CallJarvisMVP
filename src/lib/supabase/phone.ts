import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizePhone(input: string) {
  const phone = input.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("Include your country code, for example +1 555 123 4567.");
  }
  return phone;
}

async function currentOwner(client: SupabaseClient, owner: string) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.id !== owner) {
    throw new Error("Your account changed. Please sign in again.");
  }
  return data.user;
}

export async function sendPhoneCode(
  client: SupabaseClient,
  owner: string,
  phone: string,
) {
  const normalized = normalizePhone(phone);
  const user = await currentOwner(client, owner);
  const confirmed = user.phone ? `+${user.phone.replace(/^\+/, "")}` : "";
  if (user.phone_confirmed_at && confirmed === normalized)
    return { needsCode: false };
  const { error } = await client.auth.updateUser({ phone: normalized });
  if (error) throw new Error(error.message);
  return { needsCode: true };
}

export async function verifyPhoneCode(
  client: SupabaseClient,
  owner: string,
  phone: string,
  code: string,
) {
  await currentOwner(client, owner);
  const { data, error } = await client.auth.verifyOtp({
    phone: normalizePhone(phone),
    token: code.trim(),
    type: "phone_change",
  });
  if (error) throw new Error(error.message);
  if (data.user?.id !== owner)
    throw new Error("Your account changed. Please sign in again.");
}

export async function enableReminderCalls(
  client: SupabaseClient,
  owner: string,
  phone: string,
  timezone: string,
  consent: boolean,
) {
  if (!consent) throw new Error("Please allow reminder calls to continue.");
  await currentOwner(client, owner);
  // The RPC independently checks auth.uid() and auth.users.phone_confirmed_at.
  const { data, error } = await client.rpc("complete_phone_onboarding", {
    p_phone: normalizePhone(phone),
    p_timezone: timezone,
    p_consent: consent,
  });
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Calling setup is being updated. Please try again shortly."
        : error.message,
    );
  if (
    data?.destination !== normalizePhone(phone) ||
    !data?.verified_at ||
    data?.outreach_enabled !== true ||
    !data?.opted_in_channels?.includes("facetime")
  ) {
    throw new Error("Calling setup wasn’t confirmed. Please try again.");
  }
}
