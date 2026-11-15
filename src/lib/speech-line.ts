// Shared by the page and its tests. Kept apart from the server module so no server code is bundled for the browser.

/** What Jarvis says for a reminder: its title and when it is due. */
export function reminderLine(title: string, dueAt: string, locale?: string) {
  const due = new Date(dueAt);
  const when = Number.isNaN(due.getTime()) ? "" : `, due ${due.toLocaleString(locale, { weekday: "long", hour: "numeric", minute: "2-digit" })}`;
  return `${title.trim().slice(0, 200)}${when}.`;
}
