"""Run after db reset: python3 supabase/tests/concurrency.py [container-name]."""
import concurrent.futures
import json
import subprocess
import sys
import uuid

container = sys.argv[1] if len(sys.argv) > 1 else 'supabase_db_CallJarvisMVP'
owner, reminder = str(uuid.uuid4()), str(uuid.uuid4())

def sql(statement):
    return subprocess.check_output(['docker', 'exec', '-i', container, 'psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], input=statement, text=True).strip()

try:
    sql(f"""insert into auth.users(id) values('{owner}');
    update public.profiles set outreach_enabled=true,destination='simulation-only',verified_at=now(),opted_in_channels='{{imessage}}' where user_id='{owner}';
    update public.communication_rules set grace_seconds=0 where user_id='{owner}';
    insert into public.reminders(id,user_id,title,due_at,priority) values('{reminder}','{owner}','Concurrent claim test',now()-interval '1 hour','high');""")
    job = json.dumps(dict(kind='reminder', id=reminder, revision='1', channel='imessage', stage='initial'))
    def claim(_):
        result = sql(f"begin; set local role service_role; select public.claim_escalation_attempt('{job}'); select pg_sleep(0.1); commit;")
        return next(json.loads(line)['attemptId'] for line in result.splitlines() if line.startswith('{'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        ids = list(pool.map(claim, range(8)))
    assert len(set(ids)) == 1, ids
    assert sql(f"select count(*) from public.notification_attempts where reminder_id='{reminder}'") == '1'
    attempt = ids[0]
    def send(_):
        result = sql(f"begin; set local role service_role; select public.begin_notification_delivery('{attempt}'); select pg_sleep(0.1); commit;")
        return [line for line in result.splitlines() if line.startswith('{')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        sends = list(pool.map(send, range(8)))
    assert sum(bool(result) for result in sends) == 1, sends
    print('PASS: eight concurrent claims reuse one attempt; eight transport requests authorize one send')
finally:
    sql(f"delete from auth.users where id='{owner}';")
