-- LOCAL DEVELOPMENT ONLY. Addresses use reserved .test; outreach is disabled.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
values
 ('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alex@calljarvis.test',extensions.crypt('LocalDemoOnly!123',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','',''),
 ('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sam@calljarvis.test',extensions.crypt('LocalDemoOnly!123',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')
on conflict(id) do nothing;
insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
select id,id,id::text,jsonb_build_object('sub',id::text,'email',email),'email',now(),now()
from auth.users where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')
on conflict(provider_id,provider) do nothing;
insert into public.profiles(user_id,timezone)
values('11111111-1111-4111-8111-111111111111','America/Chicago'),('22222222-2222-4222-8222-222222222222','America/Los_Angeles') on conflict(user_id) do update set timezone=excluded.timezone;
insert into public.communication_rules(user_id) select user_id from public.profiles on conflict do nothing;
insert into public.reminders(id,user_id,title,due_at,priority,status,snoozed_until)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111','Take out recycling',now()-interval '10 minutes','high','pending',null),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','11111111-1111-4111-8111-111111111111','Read a chapter',now()+interval '1 hour','low','pending',null),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','22222222-2222-4222-8222-222222222222','Check the oven timer',now()-interval '5 minutes','critical','pending',null),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','22222222-2222-4222-8222-222222222222','Water plants',now()-interval '1 hour','medium','snoozed',now()+interval '30 minutes') on conflict do nothing;
insert into public.home_assistant_integrations(id,user_id,name,source) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','11111111-1111-4111-8111-111111111111','Demo home','simulated'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','22222222-2222-4222-8222-222222222222','Sam demo home','simulated') on conflict do nothing;
insert into public.devices(user_id,integration_id,name,entity_id,permitted,source)
select user_id,id,'Demo light','light.demo',true,'simulated' from public.home_assistant_integrations i
where not exists(select 1 from public.devices d where d.integration_id=i.id);
insert into public.home_events(id,user_id,type,severity,description,source,outreach_eligible) values
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','11111111-1111-4111-8111-111111111111','motion','medium','Simulated front door motion','simulated',true),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2','22222222-2222-4222-8222-222222222222','motion','low','Simulated hallway motion','simulated',false) on conflict do nothing;
