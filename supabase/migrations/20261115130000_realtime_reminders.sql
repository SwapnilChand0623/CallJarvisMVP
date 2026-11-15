-- The Home and Reminders pages subscribe to reminder changes so a reminder made by voice appears at once.
-- Without this the pages only catch up on their 30-second poll. Row-level security still applies to each
-- subscriber, so a user only receives changes to their own rows.
alter publication supabase_realtime add table public.reminders;
