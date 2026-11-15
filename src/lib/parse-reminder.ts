/** Small, deterministic demo grammar. This is not an AI or speech service. */
export function parseReminderRequest(request: string, now: Date) {
  const match = request
    .trim()
    .match(
      /^remind me to\s+(.+?)\s+in\s+(\d+)\s+(minutes?|hours?|days?)[.!]?$/i,
    );
  if (!match)
    throw new Error(
      "Try “Remind me to call Mom in 30 minutes.” Use a number and minutes, hours, or days.",
    );
  const title = match[1].trim();
  const amount = Number(match[2]);
  const unit = match[3].toLowerCase();
  const minutes =
    amount * (unit.startsWith("day") ? 1440 : unit.startsWith("hour") ? 60 : 1);
  if (!title || title.length > 160)
    throw new Error("Keep the reminder title between 1 and 160 characters.");
  if (!Number.isSafeInteger(amount) || minutes < 1 || minutes > 43200)
    throw new Error("Choose a time from 1 minute to 30 days from now.");
  if (!Number.isFinite(now.getTime()))
    throw new Error("Unable to read the current time.");
  return {
    title,
    dueAt: new Date(now.getTime() + minutes * 60000).toISOString(),
  };
}
