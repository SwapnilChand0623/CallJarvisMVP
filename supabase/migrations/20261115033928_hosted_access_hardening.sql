-- The dashboard's optional automatic-RLS helper must not be callable through RPC.
-- It remains usable by its event trigger. Absent in local projects without that option.
do $$
begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
 end if;
end $$;
-- ALL already includes the identical owner SELECT predicate.
drop policy owner_read on public.check_ins;
drop policy owner_read on public.communication_rules;
drop policy owner_read on public.home_assistant_integrations;
drop policy owner_read on public.reminders;
drop policy owner_read on public.structured_memory;
drop index public.attempts_reminder;
create index attempts_reminder on public.notification_attempts(reminder_id,user_id,revision);
drop index public.attempts_event;
create index attempts_event on public.notification_attempts(home_event_id,user_id,revision);
drop index public.attempts_check_in;
create index attempts_check_in on public.notification_attempts(check_in_id,user_id,revision);
