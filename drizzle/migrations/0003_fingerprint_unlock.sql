-- 0003: Fingerprint unlock (WebAuthn passkeys) tied to a referral code's duration.

-- How long each user's fingerprint unlock is valid (set from a referral code). NULL = lifetime.
create table public.fingerprint_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
grant select on public.fingerprint_access to authenticated;
grant all on public.fingerprint_access to service_role;
alter table public.fingerprint_access enable row level security;
create policy "own fingerprint access" on public.fingerprint_access for select to authenticated using (user_id = auth.uid());

-- Registered fingerprints (public keys only). Server-side only: no client grants, no policies.
create table public.passkeys (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null,
  alg int not null,
  sign_count bigint not null default 0,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index passkeys_user_idx on public.passkeys (user_id);
grant all on public.passkeys to service_role;
alter table public.passkeys enable row level security;

-- One-time challenges (5 min life), server-side only.
create table public.passkey_challenges (
  challenge text primary key,
  kind text not null check (kind in ('register', 'login')),
  user_id uuid,
  credential_id text,
  created_at timestamptz not null default now()
);
grant all on public.passkey_challenges to service_role;
alter table public.passkey_challenges enable row level security;

create or replace function public.fp_check_code(_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.referral_codes; issuer public.profiles;
begin
  select * into r from public.referral_codes where code = upper(trim(_code));
  if not found or r.revoked then raise exception 'Invalid referral code'; end if;
  if r.uses >= r.max_uses then raise exception 'This referral code has already been used'; end if;
  if r.expires_at <= now() then raise exception 'This referral code has expired'; end if;
  if r.created_by is not null then
    select * into issuer from public.profiles where id = r.created_by;
    if not found or issuer.status <> 'active' then raise exception 'This referral code is no longer valid'; end if;
  end if;
  return jsonb_build_object(
    'duration', public.zx_duration_label(r.duration_hours),
    'hours', r.duration_hours,
    'code_expires_at', r.expires_at,
    'uses_left', r.max_uses - r.uses);
end $$;

-- Consumes one use of the code and grants/extends the user's fingerprint time.
create or replace function public.fp_redeem_code(_code text, _uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.referral_codes; issuer public.profiles; pr public.profiles; cur public.fingerprint_access; new_exp timestamptz; lifetime boolean;
begin
  select * into pr from public.profiles where id = _uid;
  if not found then raise exception 'Account not found'; end if;
  select * into r from public.referral_codes where code = upper(trim(_code)) for update;
  if not found or r.revoked then raise exception 'Invalid referral code'; end if;
  if r.uses >= r.max_uses then raise exception 'This referral code has already been used'; end if;
  if r.expires_at <= now() then raise exception 'This referral code has expired'; end if;
  if r.created_by is not null then
    select * into issuer from public.profiles where id = r.created_by;
    if not found or issuer.status <> 'active' then raise exception 'This referral code is no longer valid'; end if;
  end if;
  select * into cur from public.fingerprint_access where user_id = _uid for update;
  lifetime := r.duration_hours is null or (found and cur.expires_at is null);
  if lifetime then new_exp := null;
  else new_exp := greatest(now(), coalesce(cur.expires_at, now())) + make_interval(hours => r.duration_hours);
  end if;
  insert into public.fingerprint_access (user_id, expires_at, updated_at) values (_uid, new_exp, now())
  on conflict (user_id) do update set expires_at = excluded.expires_at, updated_at = now();
  update public.referral_codes set uses = uses + 1 where id = r.id;
  insert into public.referral_redemptions (code_id, user_id, username) values (r.id, _uid, pr.username);
  return jsonb_build_object('expires_at', new_exp, 'lifetime', lifetime);
end $$;

revoke execute on function public.fp_check_code(text) from public, anon, authenticated;
revoke execute on function public.fp_redeem_code(text, uuid) from public, anon, authenticated;
grant execute on function public.fp_check_code(text) to service_role;
grant execute on function public.fp_redeem_code(text, uuid) to service_role;