-- Install after deploying the Edge Function and setting both Vault entries.
-- Run as the project database administrator with Cron and pg_net enabled.
do $$
begin
  if (select count(*) from vault.decrypted_secrets
      where name in ('calljarvis_escalate_url', 'calljarvis_escalate_token')
        and nullif(decrypted_secret, '') is not null) <> 2
     or (select count(distinct name) from vault.decrypted_secrets
         where name in ('calljarvis_escalate_url', 'calljarvis_escalate_token')) <> 2 then
    raise exception 'Configure one URL and one token in Vault before registering Cron';
  end if;
end
$$;

select cron.schedule('calljarvis-escalate', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'calljarvis_escalate_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'calljarvis_escalate_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
