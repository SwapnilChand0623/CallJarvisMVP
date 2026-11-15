-- CallJarvis shared database contract. No provider credentials belong here.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create type public.priority as enum ('low','medium','high','critical');
create type public.reminder_status as enum ('pending','snoozed','completed','canceled');
create type public.channel as enum ('imessage','facetime');
create type public.notification_stage as enum ('initial','follow_up','escalation','fallback');
create type public.delivery_status as enum ('pending','sending','unknown','accepted','answered','completed','unanswered','failed','simulated','canceled');
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 timezone text not null default 'UTC', destination text check(destination is null or length(trim(destination))>0), verified_at timestamptz,
 check(verified_at is null or destination is not null),
 opted_in_channels public.channel[] not null default '{}', outreach_enabled boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.communication_rules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles on delete cascade,
 quiet_start time, quiet_end time, max_calls_per_day integer not null default 3 check(max_calls_per_day between 0 and 100),
 grace_seconds integer not null default 60 check(grace_seconds>=0), low_message boolean not null default false,
 medium_follow_up_seconds integer check(medium_follow_up_seconds>=0), high_call_seconds integer not null default 300 check(high_call_seconds>=0),
 critical_channel public.channel not null default 'imessage', critical_fallback_channel public.channel,
 critical_fallback_seconds integer check(critical_fallback_seconds>=0),
 check((quiet_start is null)=(quiet_end is null)),
 check((critical_fallback_channel is null)=(critical_fallback_seconds is null))
);
create table public.reminders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 title text not null check(length(trim(title)) between 1 and 500), due_at timestamptz not null,
 priority public.priority not null default 'medium', status public.reminder_status not null default 'pending',
 acknowledged_at timestamptz, snoozed_until timestamptz, revision bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id), check((status='snoozed')=(snoozed_until is not null))
);
create table public.home_assistant_integrations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 name text not null, base_url text, enabled boolean not null default false,
 source text not null default 'simulated' check(source in ('real','simulated')), unique(id,user_id)
);
create table public.devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 integration_id uuid, name text not null, entity_id text not null, kind text not null default 'light' check(kind='light'),
 permitted boolean not null default false, is_on boolean not null default false,
 source text not null default 'simulated' check(source in ('real','simulated')), unique(id,user_id),
 foreign key(integration_id,user_id) references public.home_assistant_integrations(id,user_id) on delete cascade
);
create table public.home_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 type text not null, severity public.priority not null default 'low', description text not null,
 occurred_at timestamptz not null default now(), source text not null check(source in ('real','simulated')),
 outreach_eligible boolean not null default false, acknowledged_at timestamptz, revision bigint not null default 1,
 unique(id,user_id)
);
create table public.check_ins (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 due_at timestamptz not null, consented_at timestamptz, enabled boolean not null default false,
 priority public.priority not null default 'low', acknowledged_at timestamptz, revision bigint not null default 1,
 unique(id,user_id)
);
create table public.notification_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 reminder_id uuid, home_event_id uuid, check_in_id uuid, revision bigint not null,
 channel public.channel not null, stage public.notification_stage not null, idempotency_key text not null unique,
 provider_id text, status public.delivery_status not null default 'pending', error_code text,
 last_claimed_at timestamptz not null default now(),
 simulated boolean not null default true, created_at timestamptz not null default now(), outcome_at timestamptz,
 foreign key(reminder_id,user_id) references public.reminders(id,user_id) on delete cascade,
 foreign key(home_event_id,user_id) references public.home_events(id,user_id) on delete cascade,
 foreign key(check_in_id,user_id) references public.check_ins(id,user_id) on delete cascade,
 check(num_nonnulls(reminder_id,home_event_id,check_in_id)=1), unique(id,user_id)
);
create table public.reminder_history (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 reminder_id uuid not null, revision bigint not null, before_state jsonb, after_state jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(reminder_id,user_id) references public.reminders(id,user_id) on delete cascade
);
create table public.communication_metadata (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 attempt_id uuid, channel public.channel not null, provider_id text, event text not null,
 occurred_at timestamptz not null default now(), metadata jsonb not null default '{}',
 foreign key(attempt_id,user_id) references public.notification_attempts(id,user_id) on delete cascade
);
create table public.device_action_logs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 device_id uuid not null, requested_on boolean not null, confirmed_at timestamptz,
 status text not null check(status in ('requested','succeeded','failed','simulated')),
 created_at timestamptz not null default now(),
 foreign key(device_id,user_id) references public.devices(id,user_id) on delete cascade
);
create table public.structured_memory (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 key text not null, value jsonb not null, approved_at timestamptz not null, expires_at timestamptz,
 created_at timestamptz not null default now(), unique(user_id,key)
);
create index reminders_due on public.reminders(due_at) where status in ('pending','snoozed') and acknowledged_at is null;
create index events_due on public.home_events(occurred_at) where outreach_eligible and acknowledged_at is null;
create index check_ins_due on public.check_ins(due_at) where enabled and consented_at is not null;
create index attempts_reminder on public.notification_attempts(reminder_id,revision);
create index attempts_event on public.notification_attempts(home_event_id,revision);
create index attempts_check_in on public.notification_attempts(check_in_id,revision);
create index attempts_calls on public.notification_attempts(user_id,created_at) where channel='facetime';
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant all on public.profiles to service_role;
grant select on public.profiles to authenticated;
create policy owner_read on public.profiles for select to authenticated using ((select auth.uid())=user_id);
create policy owner_update on public.profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
alter table public.communication_rules enable row level security;
revoke all on public.communication_rules from anon, authenticated;
grant all on public.communication_rules to service_role;
grant select on public.communication_rules to authenticated;
create policy owner_read on public.communication_rules for select to authenticated using ((select auth.uid())=user_id);
grant insert,update,delete on public.communication_rules to authenticated;
create policy owner_write on public.communication_rules for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
alter table public.reminders enable row level security;
revoke all on public.reminders from anon, authenticated;
grant all on public.reminders to service_role;
grant select on public.reminders to authenticated;
create policy owner_read on public.reminders for select to authenticated using ((select auth.uid())=user_id);
create index reminders_owner on public.reminders(user_id);
grant insert,update,delete on public.reminders to authenticated;
create policy owner_write on public.reminders for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
alter table public.home_assistant_integrations enable row level security;
revoke all on public.home_assistant_integrations from anon, authenticated;
grant all on public.home_assistant_integrations to service_role;
grant select on public.home_assistant_integrations to authenticated;
create policy owner_read on public.home_assistant_integrations for select to authenticated using ((select auth.uid())=user_id);
create index home_assistant_integrations_owner on public.home_assistant_integrations(user_id);
grant insert,update,delete on public.home_assistant_integrations to authenticated;
create policy owner_write on public.home_assistant_integrations for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
alter table public.devices enable row level security;
revoke all on public.devices from anon, authenticated;
grant all on public.devices to service_role;
grant select on public.devices to authenticated;
create policy owner_read on public.devices for select to authenticated using ((select auth.uid())=user_id);
create index devices_owner on public.devices(user_id);
create policy owner_update on public.devices for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
alter table public.home_events enable row level security;
revoke all on public.home_events from anon, authenticated;
grant all on public.home_events to service_role;
grant select on public.home_events to authenticated;
create policy owner_read on public.home_events for select to authenticated using ((select auth.uid())=user_id);
create index home_events_owner on public.home_events(user_id);
create policy owner_update on public.home_events for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
alter table public.check_ins enable row level security;
revoke all on public.check_ins from anon, authenticated;
grant all on public.check_ins to service_role;
grant select on public.check_ins to authenticated;
create policy owner_read on public.check_ins for select to authenticated using ((select auth.uid())=user_id);
create index check_ins_owner on public.check_ins(user_id);
grant insert,update,delete on public.check_ins to authenticated;
create policy owner_write on public.check_ins for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
alter table public.notification_attempts enable row level security;
revoke all on public.notification_attempts from anon, authenticated;
grant all on public.notification_attempts to service_role;
grant select on public.notification_attempts to authenticated;
create policy owner_read on public.notification_attempts for select to authenticated using ((select auth.uid())=user_id);
create index notification_attempts_owner on public.notification_attempts(user_id);
alter table public.reminder_history enable row level security;
revoke all on public.reminder_history from anon, authenticated;
grant all on public.reminder_history to service_role;
grant select on public.reminder_history to authenticated;
create policy owner_read on public.reminder_history for select to authenticated using ((select auth.uid())=user_id);
create index reminder_history_owner on public.reminder_history(user_id);
alter table public.communication_metadata enable row level security;
revoke all on public.communication_metadata from anon, authenticated;
grant all on public.communication_metadata to service_role;
grant select on public.communication_metadata to authenticated;
create policy owner_read on public.communication_metadata for select to authenticated using ((select auth.uid())=user_id);
create index communication_metadata_owner on public.communication_metadata(user_id);
alter table public.device_action_logs enable row level security;
revoke all on public.device_action_logs from anon, authenticated;
grant all on public.device_action_logs to service_role;
grant select on public.device_action_logs to authenticated;
create policy owner_read on public.device_action_logs for select to authenticated using ((select auth.uid())=user_id);
create index device_action_logs_owner on public.device_action_logs(user_id);
alter table public.structured_memory enable row level security;
revoke all on public.structured_memory from anon, authenticated;
grant all on public.structured_memory to service_role;
grant select on public.structured_memory to authenticated;
create policy owner_read on public.structured_memory for select to authenticated using ((select auth.uid())=user_id);
create index structured_memory_owner on public.structured_memory(user_id);
grant insert,update,delete on public.structured_memory to authenticated;
create policy owner_write on public.structured_memory for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant update(timezone,opted_in_channels,outreach_enabled) on public.profiles to authenticated;
grant update(name) on public.devices to authenticated;
grant update(acknowledged_at) on public.home_events to authenticated;
-- Triggers run with the calling role; history/invalidation uses a narrowly scoped private definer.
create function private.revise_source() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.revision:=1;
 elsif (to_jsonb(new)-'revision'-'updated_at') is distinct from (to_jsonb(old)-'revision'-'updated_at') then
  new.revision:=old.revision+1;
 else new.revision:=old.revision; end if;
 if tg_table_name='reminders' then new.updated_at:=now(); end if;
 return new;
end $$;
create function private.source_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='reminders' then
  insert into public.reminder_history(user_id,reminder_id,revision,before_state,after_state)
  values(new.user_id,new.id,new.revision,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 end if;
 update public.notification_attempts set status='canceled',outcome_at=now(),error_code='source_changed'
 where status='pending' and revision<>new.revision and
 ((tg_table_name='reminders' and reminder_id=new.id) or (tg_table_name='home_events' and home_event_id=new.id) or (tg_table_name='check_ins' and check_in_id=new.id));
 return new;
end $$;
revoke all on function private.revise_source(), private.source_changed() from public,anon,authenticated;
create trigger revision before insert or update on public.reminders for each row execute function private.revise_source();
create trigger history after insert or update on public.reminders for each row execute function private.source_changed();
create trigger revision before insert or update on public.home_events for each row execute function private.revise_source();
create trigger history after insert or update on public.home_events for each row execute function private.source_changed();
create trigger revision before insert or update on public.check_ins for each row execute function private.revise_source();
create trigger history after insert or update on public.check_ins for each row execute function private.source_changed();
create function private.validate_timezone() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone'; end if;
 return new;
end $$;
create trigger timezone before insert or update on public.profiles for each row execute function private.validate_timezone();
revoke all on function private.validate_timezone() from public,anon,authenticated;

-- No SECURITY DEFINER on API RPCs: only service_role has access to their dependencies.
create view private.escalation_sources with (security_invoker=true) as
 select 'reminder'::text kind,id,user_id,revision,priority,
 case when status='snoozed' then snoozed_until else due_at end due_at,
 status in ('pending','snoozed') active,acknowledged_at from public.reminders
 union all select 'home_event',id,user_id,revision,severity,occurred_at,outreach_eligible,acknowledged_at from public.home_events
 union all select 'check_in',id,user_id,revision,priority,due_at,enabled and consented_at is not null,acknowledged_at from public.check_ins;
grant usage on schema private to service_role;
grant select on private.escalation_sources to service_role;
create function private.escalation_candidate(p_kind text,p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('kind',s.kind,'id',s.id,'revision',s.revision::text,'priority',s.priority,
 'dueAt',s.due_at,'active',s.active,'acknowledgedAt',s.acknowledged_at,
 'policy',jsonb_build_object('enabled',p.outreach_enabled,'channels',
 case when p.verified_at is not null and p.destination is not null then to_jsonb(p.opted_in_channels) else '[]'::jsonb end,
 'timezone',p.timezone,'quietHours',case when r.quiet_start is null then null else
 jsonb_build_object('start',to_char(r.quiet_start,'HH24:MI'),'end',to_char(r.quiet_end,'HH24:MI')) end,
 'callsRemaining',greatest(0,r.max_calls_per_day-(select count(*) from public.notification_attempts a
 where a.user_id=s.user_id and a.channel='facetime' and a.status<>'canceled'
 and (a.created_at at time zone p.timezone)::date=(now() at time zone p.timezone)::date)),
 'graceSeconds',r.grace_seconds,'lowMessage',r.low_message,'mediumFollowUpSeconds',r.medium_follow_up_seconds,
 'highCallSeconds',r.high_call_seconds,'criticalChannel',r.critical_channel,
 'criticalFallback',case when r.critical_fallback_channel is null then null else
 jsonb_build_object('channel',r.critical_fallback_channel,'delaySeconds',r.critical_fallback_seconds) end),
 'attempts',coalesce((select jsonb_agg(jsonb_build_object('channel',a.channel,'stage',a.stage,'status',a.status,'outcomeAt',a.outcome_at))
 from public.notification_attempts a where a.revision=s.revision and
 ((s.kind='reminder' and a.reminder_id=s.id) or (s.kind='home_event' and a.home_event_id=s.id) or (s.kind='check_in' and a.check_in_id=s.id))), '[]'::jsonb))
 from private.escalation_sources s join public.profiles p using(user_id) join public.communication_rules r using(user_id)
 where s.kind=p_kind and s.id=p_id;
$$;
create function private.stage_eligible(c jsonb,ch public.channel,st public.notification_stage) returns boolean
language plpgsql stable set search_path='' as $$
declare p jsonb:=c->'policy'; local_time text; elapsed numeric; a jsonb; prior jsonb;
begin
 if c is null or not (c->>'active')::boolean or c->>'acknowledgedAt' is not null or not (p->>'enabled')::boolean
 or not (p->'channels' ? ch::text) then return false; end if;
 elapsed:=extract(epoch from now()-(c->>'dueAt')::timestamptz);
 if elapsed<0 or (c->>'priority'<>'critical' and elapsed<(p->>'graceSeconds')::integer) then return false; end if;
 local_time:=to_char(now() at time zone (p->>'timezone'),'HH24:MI');
 if p->'quietHours'<>'null'::jsonb and
 (case when p#>>'{quietHours,start}' < p#>>'{quietHours,end}' then
 local_time>=p#>>'{quietHours,start}' and local_time<p#>>'{quietHours,end}'
 when p#>>'{quietHours,start}' > p#>>'{quietHours,end}' then
 local_time>=p#>>'{quietHours,start}' or local_time<p#>>'{quietHours,end}' else false end) then return false; end if;
 select x into a from jsonb_array_elements(c->'attempts') x where x->>'channel'=ch::text and x->>'stage'=st::text;
 if a is not null and a->>'status' not in ('pending','sending','unknown') then return false; end if;
 if ch='facetime' and a is null and (p->>'callsRemaining')::integer<=0 then return false; end if;
 if st='initial' then
 return (ch='imessage' and ((c->>'priority'='low' and (p->>'lowMessage')::boolean) or c->>'priority' in ('medium','high')))
 or (c->>'priority'='critical' and ch::text=p->>'criticalChannel');
 end if;
 select x into prior from jsonb_array_elements(c->'attempts') x where x->>'stage'='initial' and x->>'channel'=
 case when c->>'priority'='critical' then p->>'criticalChannel' else 'imessage' end;
 if prior is null or prior->>'outcomeAt' is null then return false; end if;
 elapsed:=extract(epoch from now()-(prior->>'outcomeAt')::timestamptz);
 return case st
 when 'follow_up' then c->>'priority'='medium' and ch='imessage' and prior->>'status' in ('accepted','completed','simulated') and elapsed>=(p->>'mediumFollowUpSeconds')::integer
 when 'escalation' then c->>'priority'='high' and ch='facetime' and prior->>'status' in ('accepted','completed','simulated') and elapsed>=(p->>'highCallSeconds')::integer
 when 'fallback' then c->>'priority'='critical' and prior->>'status'='unanswered' and ch::text=p#>>'{criticalFallback,channel}' and elapsed>=(p#>>'{criticalFallback,delaySeconds}')::integer
 else false end;
end $$;
create function public.list_escalation_candidates(p_limit integer default 20) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(c),'[]'::jsonb) from (
 select c from private.escalation_sources s
 cross join lateral (select private.escalation_candidate(s.kind,s.id) c) candidate
 where s.active and s.acknowledged_at is null and s.due_at<=now()
 and exists(select 1 from unnest(enum_range(null::public.channel)) ch
 cross join unnest(enum_range(null::public.notification_stage)) st
 where private.stage_eligible(c,ch,st))
 order by coalesce((select max(a.last_claimed_at) from public.notification_attempts a
 where a.revision=s.revision and ((s.kind='reminder' and a.reminder_id=s.id)
 or (s.kind='home_event' and a.home_event_id=s.id) or (s.kind='check_in' and a.check_in_id=s.id))),'-infinity'::timestamptz),s.due_at,s.id
 limit least(greatest(p_limit,1),100)) eligible;
$$;
create function public.claim_escalation_attempt(p_job jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare s record; c jsonb; a public.notification_attempts; ch public.channel:=(p_job->>'channel')::public.channel;
 st public.notification_stage:=(p_job->>'stage')::public.notification_stage;
begin
 select * into s from private.escalation_sources where kind=p_job->>'kind' and id=(p_job->>'id')::uuid;
 if not found then return null; end if;
 -- Owner lock serializes claims across sources, enforcing the daily cap across workers.
 perform 1 from public.profiles where user_id=s.user_id for update;
 if s.kind='reminder' then perform 1 from public.reminders where id=s.id for update;
 elsif s.kind='home_event' then perform 1 from public.home_events where id=s.id for update;
 else perform 1 from public.check_ins where id=s.id for update; end if;
 c:=private.escalation_candidate(s.kind,s.id);
 if c->>'revision' is distinct from p_job->>'revision' or not coalesce(private.stage_eligible(c,ch,st),false) then return null; end if;
 insert into public.notification_attempts(user_id,reminder_id,home_event_id,check_in_id,revision,channel,stage,idempotency_key)
 values(s.user_id,case when s.kind='reminder' then s.id end,case when s.kind='home_event' then s.id end,
 case when s.kind='check_in' then s.id end,(c->>'revision')::bigint,ch,st,
 s.kind||':'||s.id||':'||(c->>'revision')||':'||ch||':'||st)
 on conflict(idempotency_key) do nothing;
 select * into a from public.notification_attempts where idempotency_key=s.kind||':'||s.id||':'||(c->>'revision')||':'||ch||':'||st;
 if a.status not in ('pending','sending','unknown') then return null; end if;
 update public.notification_attempts set last_claimed_at=now() where id=a.id;
 return jsonb_build_object('attemptId',a.id);
end $$;
-- Transport MUST call this before contacting a provider. Only the winning caller gets a row.
-- Never auto-retry sending/unknown: reconcile using the stable provider idempotency key.
create function public.begin_notification_delivery(p_attempt_id uuid) returns jsonb
language plpgsql set search_path='' as $$
declare a public.notification_attempts; c jsonb; k text; source_id uuid;
begin
 select * into a from public.notification_attempts where id=p_attempt_id;
 if not found then return null; end if;
 perform 1 from public.profiles where user_id=a.user_id for update;
 if a.reminder_id is not null then k:='reminder';source_id:=a.reminder_id;perform 1 from public.reminders where id=source_id for update;
 elsif a.home_event_id is not null then k:='home_event';source_id:=a.home_event_id;perform 1 from public.home_events where id=source_id for update;
 else k:='check_in';source_id:=a.check_in_id;perform 1 from public.check_ins where id=source_id for update; end if;
 select * into a from public.notification_attempts where id=p_attempt_id for update;
 c:=private.escalation_candidate(k,source_id);
 if a.status<>'pending' or a.revision::text is distinct from c->>'revision' or not coalesce(private.stage_eligible(c,a.channel,a.stage),false) then return null; end if;
 update public.notification_attempts set status='sending' where id=a.id;
 return jsonb_build_object('attemptId',a.id,'idempotencyKey',a.idempotency_key,'channel',a.channel,
 'destination',(select destination from public.profiles where user_id=a.user_id),'userId',a.user_id);
end $$;
revoke all on function public.list_escalation_candidates(integer),public.claim_escalation_attempt(jsonb),public.begin_notification_delivery(uuid),private.escalation_candidate(text,uuid),private.stage_eligible(jsonb,public.channel,public.notification_stage) from public,anon,authenticated;
grant execute on function public.list_escalation_candidates(integer),public.claim_escalation_attempt(jsonb),public.begin_notification_delivery(uuid),private.escalation_candidate(text,uuid),private.stage_eligible(jsonb,public.channel,public.notification_stage) to service_role;
create function private.initialize_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(user_id) values(new.id);
 insert into public.communication_rules(user_id) values(new.id);
 return new;
end $$;
revoke all on function private.initialize_profile() from public,anon,authenticated;
create trigger calljarvis_profile after insert on auth.users for each row execute function private.initialize_profile();

-- Index the owner-scoped foreign-key deletion and lookup paths.
create index devices_integration on public.devices(integration_id,user_id);
create index history_reminder on public.reminder_history(reminder_id,user_id);
create index metadata_attempt on public.communication_metadata(attempt_id,user_id);
create index actions_device on public.device_action_logs(device_id,user_id);
