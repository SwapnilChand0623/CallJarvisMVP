create table public.provider_events (
  id text primary key check (length(id) between 1 and 512),
  received_at timestamptz not null default now()
);

alter table public.provider_events enable row level security;
revoke all on table public.provider_events from public, anon, authenticated;
grant select, insert, delete on table public.provider_events to service_role;
