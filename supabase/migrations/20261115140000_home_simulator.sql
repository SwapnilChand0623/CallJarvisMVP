-- Home simulator: a Home/Away mode per account and devices other than lights.

-- A stove can now be a device. Jarvis may switch any permitted device.
alter table public.devices drop constraint devices_kind_check;
alter table public.devices add constraint devices_kind_check check (kind in ('light', 'stove'));

-- Whether the household is home or away. Away is what makes a home event worth a call.
create table public.home_modes (
  user_id uuid primary key references public.profiles on delete cascade,
  mode text not null default 'home' check (mode in ('home', 'away')),
  updated_at timestamptz not null default now()
);
alter table public.home_modes enable row level security;
revoke all on public.home_modes from public, anon, authenticated;
grant all on public.home_modes to service_role;
grant select on public.home_modes to authenticated;
create policy owner_read on public.home_modes for select to authenticated using ((select auth.uid()) = user_id);
