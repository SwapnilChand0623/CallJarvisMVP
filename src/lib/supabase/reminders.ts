import { z } from "zod";
import { type SupabaseClient } from "@supabase/supabase-js";
import { priorities, type Reminder } from "@/lib/mockData";
export const reminderRecordSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().min(1).max(160),
  due_at: z.string().datetime({ offset: true }),
  priority: z.enum(priorities),
  status: z.enum(["pending", "snoozed", "completed", "canceled"]),
  acknowledged_at: z.string().datetime({ offset: true }).nullable(),
});
const fields = "id,user_id,title,due_at,priority,status,acknowledged_at";
export function mapReminderRecord(record: unknown, owner: string): Reminder {
  const row = reminderRecordSchema.parse(record);
  if (row.user_id !== owner)
    throw new Error("Received a reminder owned by another account.");
  return {
    id: row.id,
    title: row.title,
    dueAt: row.due_at,
    priority: row.priority,
    status: row.status,
    acknowledgedAt: row.acknowledged_at,
    channel: "iMessage",
  };
}
export function reminderWrite(r: Reminder, owner: string) {
  return reminderRecordSchema.parse({
    id: r.id,
    user_id: owner,
    title: r.title,
    due_at: r.dueAt,
    priority: r.priority,
    status: r.status,
    acknowledged_at: r.acknowledgedAt,
  });
}
export async function reminderOwner(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to manage your reminders.");
  return data.user.id;
}
export async function loadReminders(client: SupabaseClient) {
  const owner = await reminderOwner(client);
  const { data, error } = await client
    .from("reminders")
    .select(fields)
    .eq("user_id", owner)
    .order("due_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapReminderRecord(r, owner));
}
export async function saveReminder(
  client: SupabaseClient,
  r: Reminder,
  existing: boolean,
) {
  const owner = await reminderOwner(client);
  const row = reminderWrite(r, owner);
  const query = existing
    ? client
        .from("reminders")
        .update({
          title: row.title,
          due_at: row.due_at,
          priority: row.priority,
          status: row.status,
          acknowledged_at: row.acknowledged_at,
        })
        .eq("id", row.id)
        .eq("user_id", owner)
    : client.from("reminders").insert(row);
  const { data, error } = await query.select(fields).single();
  if (error) throw new Error(error.message);
  return mapReminderRecord(data, owner);
}
export async function deleteReminder(client: SupabaseClient, id: string) {
  const owner = await reminderOwner(client);
  const { data, error } = await client
    .from("reminders")
    .delete()
    .eq("id", id)
    .eq("user_id", owner)
    .select("id")
    .single();
  if (error || !data)
    throw new Error(
      error?.message ?? "Reminder not found or not owned by this account.",
    );
}
