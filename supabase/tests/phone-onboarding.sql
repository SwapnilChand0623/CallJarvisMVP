-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/phone-onboarding.sql.
-- Run against a test database. Transactional fixtures only: no SMS or provider calls, and all rows are rolled back.
begin;
create function pg_temp.assert_true(p_value boolean, p_label text) returns void
language plpgsql as $$ begin
  if p_value is distinct from true then raise exception 'FAIL: %', p_label; end if;
end $$;
create function pg_temp.expect_error(p_sql text, p_state text) returns void
language plpgsql as $$ begin
  begin execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'Expected %, got %: %', p_state, sqlstate, sqlerrm;
  end;
  raise exception 'Expected % but statement succeeded: %', p_state, p_sql;
end $$;
insert into auth.users(id, email, phone, phone_confirmed_at, raw_user_meta_data) values
 ('33333333-3333-4333-8333-333333333333', 'phone-setup-a@example.test', '15555550100', null,
  '{"contact_phone":"+15555550100","phone_verified":true}'),
 ('44444444-4444-4444-8444-444444444444', 'phone-setup-b@example.test', '15555550101', now(), '{}');

set local role anon;
select pg_temp.expect_error($s$select public.complete_phone_onboarding('+15555550100','America/Chicago',true)$s$, '42501');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$select public.complete_phone_onboarding('+15555550100','America/Chicago',true)$s$, '42501');
select pg_temp.assert_true((select destination is null and not outreach_enabled from public.profiles where user_id=auth.uid()), 'forged metadata cannot verify or enable calls');
select pg_temp.expect_error($s$select public.complete_phone_onboarding('+15555550101','America/Chicago',true)$s$, '42501');
select pg_temp.expect_error($s$select public.complete_phone_onboarding('+15555550100','America/Chicago',false)$s$, '22023');
select pg_temp.expect_error($s$select public.complete_phone_onboarding('+15555550100','Not/AZone',true)$s$, '22023');
select pg_temp.expect_error($s$select public.complete_phone_onboarding('5551234','UTC',true)$s$, '22023');
reset role;
update auth.users set phone_confirmed_at=now() where id='33333333-3333-4333-8333-333333333333';
update public.communication_rules set max_calls_per_day=2, high_call_seconds=600 where user_id='33333333-3333-4333-8333-333333333333';
create function pg_temp.reject_call_rules() returns trigger language plpgsql as $$ begin
  raise exception 'Injected rule failure' using errcode='23514';
end $$;
create trigger test_call_rule_failure before insert or update on public.communication_rules
for each row execute function pg_temp.reject_call_rules();
set local role authenticated;
select pg_temp.expect_error($s$select public.complete_phone_onboarding('+15555550100','America/Chicago',true)$s$, '23514');
select pg_temp.assert_true((select destination is null and not outreach_enabled from public.profiles where user_id=auth.uid()), 'rule failure rolls back the profile update');
reset role;
drop trigger test_call_rule_failure on public.communication_rules;
set local role authenticated;
select public.complete_phone_onboarding('+15555550100','America/Chicago',true);
select pg_temp.assert_true((select destination='+15555550100' and verified_at is not null and outreach_enabled and timezone='America/Chicago' and 'facetime'=any(opted_in_channels) from public.profiles where user_id=auth.uid()), 'confirmed phone and calling consent reach scheduler profile');
select pg_temp.assert_true((select critical_channel='facetime' and max_calls_per_day=2 and high_call_seconds=600 from public.communication_rules where user_id=auth.uid()), 'FaceTime routing is connected without resetting other preferences');
select public.complete_phone_onboarding('+15555550100','America/Chicago',true);
select pg_temp.assert_true((select count(*)=1 from public.communication_rules where user_id=auth.uid()), 'retry is idempotent');
select pg_temp.expect_error($s$update public.profiles set verified_at=now() where user_id=auth.uid()$s$, '42501');
select pg_temp.expect_error($s$select public.complete_phone_onboarding('+15555550101','America/Chicago',true)$s$, '42501');
select pg_temp.assert_true((select destination='+15555550100' from public.profiles where user_id=auth.uid()), 'failed phone change leaves verified destination intact');
insert into public.reminders(id,user_id,title,due_at,priority) values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',auth.uid(),'Phone onboarding regression',now()-interval '1 minute','critical');
reset role;
select pg_temp.assert_true((select destination is null and not outreach_enabled from public.profiles where user_id='44444444-4444-4444-8444-444444444444'), 'another account is untouched');
set local role service_role;
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.list_escalation_candidates(100)) c where c->>'id'='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and c#>>'{policy,criticalChannel}'='facetime' and c#>>'{policy,enabled}'='true'), 'newly onboarded account is eligible for the real scheduler');
select pg_temp.assert_true(public.begin_notification_delivery((public.claim_escalation_attempt('{"kind":"reminder","id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","revision":"1","channel":"facetime","stage":"initial"}')->>'attemptId')::uuid)->>'destination'='+15555550100', 'scheduler delivery resolves to the newly verified phone');
reset role;
set local role authenticated;
update public.profiles set outreach_enabled=false where user_id=auth.uid();
reset role;
set local role service_role;
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.list_escalation_candidates(100)) c where c->>'id'='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 'pausing calls suppresses the scheduler');
reset role;
rollback;
