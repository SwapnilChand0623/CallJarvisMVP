-- Promote a verified Auth phone into the exact records consumed by escalation.
-- No service key or editable metadata is accepted as proof of phone ownership.
create function public.complete_phone_onboarding(p_phone text, p_timezone text, p_consent boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  confirmed_phone text;
  confirmed_at timestamptz;
  profile public.profiles;
begin
  if owner_id is null then
    raise exception 'Sign in to set up reminder calls' using errcode = '42501';
  end if;
  if p_consent is distinct from true then
    raise exception 'Calling consent is required' using errcode = '22023';
  end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use an international phone number' using errcode = '22023';
  end if;
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Choose a valid time zone' using errcode = '22023';
  end if;

  -- Lock the Auth row so a concurrent phone change cannot race promotion.
  -- Supabase may store Auth phone numbers without the leading +.
  select '+' || ltrim(u.phone, '+'), u.phone_confirmed_at
    into confirmed_phone, confirmed_at
    from auth.users u where u.id = owner_id for share;
  if confirmed_at is null or confirmed_phone is distinct from p_phone then
    raise exception 'Verify this phone number before enabling calls' using errcode = '42501';
  end if;

  -- One transaction: a scheduler can see neither a half-saved profile nor stale rules.
  insert into public.profiles(user_id, destination, verified_at, timezone, outreach_enabled, opted_in_channels)
  values(owner_id, confirmed_phone, confirmed_at, p_timezone, true, array['facetime']::public.channel[])
  on conflict(user_id) do update set
    destination = excluded.destination,
    verified_at = excluded.verified_at,
    timezone = excluded.timezone,
    outreach_enabled = true,
    opted_in_channels = case
      when 'facetime'::public.channel = any(public.profiles.opted_in_channels)
        then public.profiles.opted_in_channels
      else array_append(public.profiles.opted_in_channels, 'facetime'::public.channel)
    end
  returning * into profile;

  insert into public.communication_rules(user_id, critical_channel)
  values(owner_id, 'facetime')
  on conflict(user_id) do update set critical_channel = excluded.critical_channel;

  return jsonb_build_object('destination', profile.destination, 'verified_at', profile.verified_at,
    'timezone', profile.timezone, 'outreach_enabled', profile.outreach_enabled,
    'opted_in_channels', profile.opted_in_channels);
end $$;
revoke all on function public.complete_phone_onboarding(text, text, boolean) from public, anon;
grant execute on function public.complete_phone_onboarding(text, text, boolean) to authenticated;
