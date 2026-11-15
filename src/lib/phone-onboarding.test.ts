import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  enableReminderCalls,
  normalizePhone,
  sendPhoneCode,
  verifyPhoneCode,
} from "./supabase/phone";
const owner = "11111111-1111-4111-8111-111111111111";
const phone = "+15555550100";
function fixture() {
  const calls: { method: string; args: unknown }[] = [];
  let user = {
    id: owner,
    phone: "",
    user_metadata: { contact_phone: phone, phone_verified: true },
  } as unknown as User;
  let failSave = false;
  const client = {
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
      async updateUser(args: unknown) {
        calls.push({ method: "send", args });
        return { data: { user }, error: null };
      },
      async verifyOtp(args: { phone: string; token: string; type: string }) {
        calls.push({ method: "verify", args });
        if (args.token !== "123456")
          return {
            data: { user: null },
            error: { message: "Code expired or invalid" },
          };
        user = {
          ...user,
          phone: args.phone.slice(1),
          phone_confirmed_at: new Date().toISOString(),
        };
        return { data: { user }, error: null };
      },
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ method: name, args });
      if (failSave)
        return { data: null, error: { message: "Database unavailable" } };
      if (!user.phone_confirmed_at)
        return {
          data: null,
          error: { message: "Verify this phone number before enabling calls" },
        };
      return {
        data: {
          destination: args.p_phone,
          verified_at: user.phone_confirmed_at,
          outreach_enabled: true,
          opted_in_channels: ["facetime"],
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  return {
    client,
    calls,
    setUser(value: User) {
      user = value;
    },
    failSave(value: boolean) {
      failSave = value;
    },
  };
}
test("phone setup normalizes international formatting and rejects incomplete numbers", () => {
  assert.equal(normalizePhone("+1 (555) 555-0100"), phone);
  for (const invalid of ["5550100", "+05555550100", "+1abc5550100", ""])
    assert.throws(() => normalizePhone(invalid));
});
test("editable sign-in metadata cannot substitute for confirmed phone ownership", async () => {
  const f = fixture();
  assert.deepEqual(await sendPhoneCode(f.client, owner, phone), {
    needsCode: true,
  });
  assert.deepEqual(f.calls[0], { method: "send", args: { phone } });
  await assert.rejects(
    enableReminderCalls(f.client, owner, phone, "UTC", true),
    /Verify this phone/,
  );
});
test("verified setup enables the scheduler RPC with explicit consent and no caller-selected user id", async () => {
  const f = fixture();
  await sendPhoneCode(f.client, owner, phone);
  await verifyPhoneCode(f.client, owner, phone, "123456");
  await enableReminderCalls(f.client, owner, phone, "America/Chicago", true);
  assert.deepEqual(f.calls.at(-1), {
    method: "complete_phone_onboarding",
    args: { p_phone: phone, p_timezone: "America/Chicago", p_consent: true },
  });
  assert.deepEqual(f.calls[1].args, {
    phone,
    token: "123456",
    type: "phone_change",
  });
});
test("invalid codes report failure without enabling calls", async () => {
  const f = fixture();
  await assert.rejects(
    verifyPhoneCode(f.client, owner, phone, "000000"),
    /Code expired/,
  );
  assert.equal(
    f.calls.some((c) => c.method === "complete_phone_onboarding"),
    false,
  );
});
test("calling consent is required before activation", async () => {
  const f = fixture();
  await assert.rejects(
    enableReminderCalls(f.client, owner, phone, "UTC", false),
    /allow reminder calls/,
  );
  assert.equal(f.calls.length, 0);
});
test("a changed account cannot activate the original account's setup", async () => {
  const f = fixture();
  f.setUser({ id: "another-account" } as User);
  await assert.rejects(
    enableReminderCalls(f.client, owner, phone, "UTC", true),
    /account changed/,
  );
  assert.equal(f.calls.length, 0);
});
test("activation can retry after a database error without a second verification code", async () => {
  const f = fixture();
  await verifyPhoneCode(f.client, owner, phone, "123456");
  f.failSave(true);
  await assert.rejects(
    enableReminderCalls(f.client, owner, phone, "UTC", true),
    /Database unavailable/,
  );
  f.failSave(false);
  await enableReminderCalls(f.client, owner, phone, "UTC", true);
  assert.equal(f.calls.filter((c) => c.method === "verify").length, 1);
  assert.deepEqual(await sendPhoneCode(f.client, owner, phone), {
    needsCode: false,
  });
  assert.equal(f.calls.filter((c) => c.method === "send").length, 0);
});
