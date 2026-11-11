create extension if not exists pgcrypto with schema extensions;

-- ===== Types =====
create type public.app_role as enum ('owner','admin','reseller');
create type public.account_status as enum ('active','blocked','banned');

-- ===== Tables =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  status public.account_status not null default 'active',
  balance bigint not null default 0 check (balance >= 0),
  expires_at timestamptz,
  ref_limit int not null default 10 check (ref_limit >= 0),
  ref_used int not null default 0 check (ref_used >= 0),
  uplink_id uuid,
  uplink text,
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));
create index profiles_uplink_idx on public.profiles (uplink_id);
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.app_role not null
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create table public.prices (
  hours int primary key check (hours > 0),
  price bigint not null check (price >= 0),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.prices to authenticated;
grant all on public.prices to service_role;
alter table public.prices enable row level security;

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  telegram_url text not null default 'https://t.me/ONExZEROXX',
  telegram_handle text not null default '@ONExZEROXX',
  updated_at timestamptz not null default now()
);
grant select on public.app_settings to anon;
grant select, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;

create table public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  role public.app_role not null,
  duration_hours int,
  credit bigint not null default 0 check (credit >= 0),
  max_uses int not null default 1 check (max_uses >= 1),
  uses int not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  cost bigint not null default 0,
  revoked boolean not null default false,
  created_by uuid,
  created_by_name text not null default 'System',
  created_at timestamptz not null default now()
);
create index referral_codes_creator_idx on public.referral_codes (created_by, created_at desc);
grant select on public.referral_codes to authenticated;
grant all on public.referral_codes to service_role;
alter table public.referral_codes enable row level security;

create table public.referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.referral_codes(id) on delete cascade,
  user_id uuid not null,
  username text not null,
  created_at timestamptz not null default now()
);
create index referral_redemptions_code_idx on public.referral_redemptions (code_id);
grant select on public.referral_redemptions to authenticated;
grant all on public.referral_redemptions to service_role;
alter table public.referral_redemptions enable row level security;

create table public.license_keys (
  id bigserial primary key,
  game text not null,
  license_key text not null unique,
  duration_hours int not null,
  max_devices int not null default 1,
  price bigint not null default 0,
  created_by uuid not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  devices text[] not null default '{}'
);
create index license_keys_creator_idx on public.license_keys (created_by, id desc);
grant select on public.license_keys to authenticated;
grant all on public.license_keys to service_role;
alter table public.license_keys enable row level security;

create table public.transactions (
  id bigserial primary key,
  user_id uuid,
  username text not null,
  kind text not null,
  amount bigint not null default 0,
  balance_after bigint,
  details text not null default '',
  request_id uuid unique,
  created_at timestamptz not null default now()
);
create index transactions_user_idx on public.transactions (user_id, id desc);
grant select on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_user_id uuid,
  target_role public.app_role,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index notices_created_idx on public.notices (created_at desc);
grant select, insert, delete on public.notices to authenticated;
grant all on public.notices to service_role;
alter table public.notices enable row level security;

create table public.connect_settings (
  id int primary key default 1 check (id = 1),
  secret_word text not null default encode(extensions.gen_random_bytes(16), 'hex') check (length(secret_word) between 4 and 128),
  mod_name text not null default 'ZEROX BYPASS' check (length(mod_name) <= 60),
  mod_status text not null default 'Safe' check (length(mod_status) <= 60),
  credit_text text not null default 'ZEROX BYPASS' check (length(credit_text) <= 120),
  maintenance boolean not null default false,
  maintenance_message text not null default 'Server under maintenance. Try again later.' check (length(maintenance_message) <= 200),
  updated_at timestamptz not null default now()
);
grant select, update on public.connect_settings to authenticated;
grant all on public.connect_settings to service_role;
alter table public.connect_settings enable row level security;

create table public.connect_failures (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  serial_hash text not null,
  at timestamptz not null default now()
);
grant all on public.connect_failures to service_role;
alter table public.connect_failures enable row level security;
create index connect_failures_ip_at on public.connect_failures (ip_hash, at);
create index connect_failures_serial_at on public.connect_failures (serial_hash, at);

-- ===== Role helpers =====
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid() limit 1
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'owner')
$$;

-- ===== Policies =====
create policy "profiles readable by self, owner, uplink" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_owner() or uplink_id = auth.uid());

create policy "roles readable by self, owner, uplink" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_owner()
         or exists (select 1 from public.profiles p where p.id = user_roles.user_id and p.uplink_id = auth.uid()));

create policy "prices readable" on public.prices for select to authenticated using (true);
create policy "owner inserts prices" on public.prices for insert to authenticated with check (public.is_owner());
create policy "owner updates prices" on public.prices for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner deletes prices" on public.prices for delete to authenticated using (public.is_owner());

create policy "settings readable" on public.app_settings for select to anon, authenticated using (true);
create policy "owner updates settings" on public.app_settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "referrals readable by creator or owner" on public.referral_codes for select to authenticated
  using (created_by = auth.uid() or public.is_owner());

create policy "redemptions readable by code creator or owner" on public.referral_redemptions for select to authenticated
  using (public.is_owner() or exists (select 1 from public.referral_codes c where c.id = code_id and c.created_by = auth.uid()));

create policy "keys readable by creator or owner" on public.license_keys for select to authenticated
  using (created_by = auth.uid() or public.is_owner());

create policy "transactions readable by self or owner" on public.transactions for select to authenticated
  using (user_id = auth.uid() or public.is_owner());

create policy "notices readable by target" on public.notices for select to authenticated
  using (public.is_owner() or target_user_id = auth.uid()
         or (target_user_id is null and (target_role is null or target_role = public.my_role())));
create policy "owner sends notices" on public.notices for insert to authenticated with check (public.is_owner());
create policy "owner deletes notices" on public.notices for delete to authenticated using (public.is_owner());

create policy "owner reads connect settings" on public.connect_settings for select to authenticated using (public.is_owner());
create policy "owner updates connect settings" on public.connect_settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- ===== Utility functions =====
create or replace function public.zx_duration_label(_hours int)
returns text language sql immutable set search_path = public as $$
  select case
    when _hours is null then 'Lifetime'
    when _hours < 24 then _hours || case when _hours = 1 then ' Hour' else ' Hours' end
    when _hours % 24 = 0 then (_hours / 24) || case when _hours = 24 then ' Day' else ' Days' end
    else _hours || ' Hours' end
$$;

create or replace function public._zx_rand(_n int)
returns text language plpgsql volatile set search_path = public as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r text := ''; i int;
begin
  for i in 1.._n loop r := r || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
  return r;
end $$;

create or replace function public._assert_active(_uid uuid)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if _uid is null then raise exception 'Please login first'; end if;
  select * into p from public.profiles where id = _uid for update;
  if not found then raise exception 'Account not found'; end if;
  if p.status = 'banned' then raise exception 'Your account is banned. Please DM the Owner.'; end if;
  if p.status = 'blocked' then raise exception 'Your account is blocked. Please DM the Owner.'; end if;
  if p.expires_at is not null and p.expires_at <= now() and not public.has_role(_uid, 'owner') then
    raise exception 'Your referral has expired. Please DM the Owner.';
  end if;
  return p;
end $$;

-- ===== Key generation (atomic balance deduction; resellers: single auto-named key only) =====
create or replace function public.generate_keys(_game text, _hours int, _devices int, _qty int, _custom text default null, _request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); p public.profiles; pr bigint; total bigint; is_own boolean; caller public.app_role;
  k text; keys text[] := '{}'; i int; tries int; exp timestamptz; newbal bigint; cust text;
begin
  p := public._assert_active(uid);
  if _request_id is not null and exists (select 1 from public.transactions where request_id = _request_id) then
    raise exception 'This request was already processed';
  end if;
  caller := public.my_role();
  is_own := (caller = 'owner');
  if _game is null or length(trim(_game)) = 0 or length(_game) > 32 then raise exception 'Select a game'; end if;
  if _devices is null or _devices < 1 or _devices > 50 then raise exception 'Max devices must be between 1 and 50'; end if;
  cust := nullif(upper(trim(coalesce(_custom, ''))), '');
  if caller is distinct from 'owner' and caller is distinct from 'admin' then
    if cust is not null then raise exception 'Resellers cannot create custom keys'; end if;
    if _qty is distinct from 1 then raise exception 'Resellers can generate only 1 key at a time'; end if;
  end if;
  if cust is not null then
    if cust !~ '^[A-Z0-9_-]{4,20}$' then raise exception 'Custom key must be 4-20 letters, numbers, - or _'; end if;
    if exists (select 1 from public.license_keys where license_key = cust) then raise exception 'This key name already exists'; end if;
    _qty := 1;
  end if;
  if _qty is null or _qty not in (1, 10, 50, 100, 200, 300) then raise exception 'Invalid bulk quantity'; end if;
  select price into pr from public.prices where hours = _hours;
  if not found then raise exception 'Invalid duration plan'; end if;
  total := case when is_own then 0 else pr * _qty end;
  if p.balance < total then
    raise exception 'Insufficient balance. Need ₹% but you have ₹%', total, p.balance;
  end if;
  exp := now() + make_interval(hours => _hours);
  for i in 1.._qty loop
    if cust is not null then k := cust;
    else
      tries := 0;
      loop
        k := 'ZEROX-' || _hours || '-' || public._zx_rand(8);
        exit when not exists (select 1 from public.license_keys where license_key = k);
        tries := tries + 1; if tries > 5 then raise exception 'Could not generate a unique key, try again'; end if;
      end loop;
    end if;
    insert into public.license_keys (game, license_key, duration_hours, max_devices, price, created_by, created_by_name, expires_at)
    values (trim(_game), k, _hours, _devices, case when is_own then 0 else pr end, uid, p.username, exp);
    keys := keys || k;
  end loop;
  update public.profiles set balance = balance - total, last_active_at = now() where id = uid returning balance into newbal;
  insert into public.transactions (user_id, username, kind, amount, balance_after, details, request_id)
  values (uid, p.username, 'key_generate', -total, newbal,
    format('%s · %s key(s) · %s · %s device(s)', trim(_game), _qty, public.zx_duration_label(_hours), _devices), _request_id);
  return jsonb_build_object('keys', to_jsonb(keys), 'charged', total, 'balance', newbal, 'expires_at', exp,
    'game', trim(_game), 'duration', public.zx_duration_label(_hours), 'devices', _devices);
end $$;

-- ===== Referral creation =====
create or replace function public.create_referral(_role public.app_role, _hours int, _credit bigint, _max_uses int, _valid_hours int, _request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); p public.profiles; caller public.app_role; pr bigint := 0; cost bigint := 0;
  c text; newbal bigint; tries int := 0;
begin
  p := public._assert_active(uid);
  if _request_id is not null and exists (select 1 from public.transactions where request_id = _request_id) then
    raise exception 'This request was already processed';
  end if;
  caller := public.my_role();
  if caller is null or caller = 'reseller' then raise exception 'Resellers cannot generate referrals'; end if;
  if caller = 'admin' and _role <> 'reseller' then raise exception 'Admins can only generate RESELLER referrals'; end if;
  if _max_uses is null or _max_uses < 1 or _max_uses > 100 then raise exception 'Usage limit must be between 1 and 100'; end if;
  if _credit is null or _credit < 0 then raise exception 'Credit cannot be negative'; end if;
  if _valid_hours is null or _valid_hours < 1 or _valid_hours > 8760 then raise exception 'Invalid referral expiry'; end if;
  if _hours is null then
    if caller <> 'owner' then raise exception 'Only the Owner can create lifetime referrals'; end if;
  else
    select price into pr from public.prices where hours = _hours;
    if not found then raise exception 'Invalid duration'; end if;
  end if;
  if caller = 'admin' then
    if p.ref_used + _max_uses > p.ref_limit then
      raise exception 'Referral limit reached (% / %). Please DM the Owner.', p.ref_used, p.ref_limit;
    end if;
    cost := (pr + _credit) * _max_uses;
    if p.balance < cost then raise exception 'Insufficient balance. Need ₹% but you have ₹%', cost, p.balance; end if;
  end if;
  loop
    c := 'ZX' || public._zx_rand(8);
    exit when not exists (select 1 from public.referral_codes where code = c);
    tries := tries + 1; if tries > 5 then raise exception 'Could not generate code, try again'; end if;
  end loop;
  insert into public.referral_codes (code, role, duration_hours, credit, max_uses, expires_at, cost, created_by, created_by_name)
  values (c, _role, _hours, _credit, _max_uses, now() + make_interval(hours => _valid_hours), cost, uid, p.username);
  update public.profiles set balance = balance - cost, ref_used = ref_used + _max_uses, last_active_at = now()
  where id = uid returning balance into newbal;
  insert into public.transactions (user_id, username, kind, amount, balance_after, details, request_id)
  values (uid, p.username, 'referral_create', -cost, newbal,
    format('Referral %s · %s · %s · ₹%s credit · %s use(s)', c, upper(_role::text), public.zx_duration_label(_hours), _credit, _max_uses), _request_id);
  return jsonb_build_object('code', c, 'cost', cost, 'balance', newbal);
end $$;

create or replace function public.revoke_referral(_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.referral_codes; remaining int; refund bigint := 0; pr bigint := 0; newbal bigint;
begin
  perform public._assert_active(uid);
  select * into r from public.referral_codes where id = _id for update;
  if not found then raise exception 'Referral not found'; end if;
  if r.created_by is distinct from uid and not public.is_owner() then raise exception 'Not allowed'; end if;
  if r.revoked then raise exception 'Already revoked'; end if;
  remaining := r.max_uses - r.uses;
  if r.cost > 0 and remaining > 0 then refund := (r.cost / r.max_uses) * remaining; end if;
  update public.referral_codes set revoked = true where id = _id;
  if r.created_by is not null then
    update public.profiles set balance = balance + refund, ref_used = greatest(0, ref_used - remaining)
    where id = r.created_by returning balance into newbal;
    insert into public.transactions (user_id, username, kind, amount, balance_after, details)
    values (r.created_by, r.created_by_name, 'referral_revoke', refund, newbal, format('Revoked referral %s · %s unused', r.code, remaining));
  end if;
  return jsonb_build_object('refund', refund);
end $$;

-- ===== Account provisioning (service role only) =====
create or replace function public._provision_user(_uid uuid, _username text, _role public.app_role, _hours int, _credit bigint, _uplink_id uuid, _uplink text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, balance, expires_at, ref_limit, uplink_id, uplink, last_active_at)
  values (_uid, _username, coalesce(_credit, 0),
          case when _hours is null then null else now() + make_interval(hours => _hours) end,
          10, _uplink_id, _uplink, now());
  insert into public.user_roles (user_id, role) values (_uid, _role);
  insert into public.transactions (user_id, username, kind, amount, balance_after, details)
  values (_uid, _username, 'account_created', coalesce(_credit, 0), coalesce(_credit, 0),
          format('%s account · %s · uplink %s', upper(_role::text), public.zx_duration_label(_hours), coalesce(_uplink, 'System')));
end $$;

create or replace function public.check_referral(_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.referral_codes;
begin
  select * into r from public.referral_codes where code = upper(trim(_code));
  if not found or r.revoked then raise exception 'Invalid referral code'; end if;
  if r.uses >= r.max_uses then raise exception 'This referral code has already been used'; end if;
  if r.expires_at <= now() then raise exception 'Your referral has expired. Please DM the Owner.'; end if;
  return jsonb_build_object('role', r.role, 'duration', public.zx_duration_label(r.duration_hours));
end $$;

create or replace function public.redeem_referral(_code text, _uid uuid, _username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.referral_codes; issuer public.profiles;
begin
  select * into r from public.referral_codes where code = upper(trim(_code)) for update;
  if not found or r.revoked then raise exception 'Invalid referral code'; end if;
  if r.uses >= r.max_uses then raise exception 'This referral code has already been used'; end if;
  if r.expires_at <= now() then raise exception 'Your referral has expired. Please DM the Owner.'; end if;
  if r.created_by is not null then
    select * into issuer from public.profiles where id = r.created_by;
    if not found or issuer.status <> 'active' then raise exception 'This referral code is no longer valid'; end if;
  end if;
  perform public._provision_user(_uid, _username, r.role, r.duration_hours, r.credit, r.created_by, r.created_by_name);
  update public.referral_codes set uses = uses + 1 where id = r.id;
  insert into public.referral_redemptions (code_id, user_id, username) values (r.id, _uid, _username);
  return jsonb_build_object('role', r.role);
end $$;

-- ===== Owner controls =====
create or replace function public.owner_update_user(_uid uuid, _role public.app_role, _status public.account_status, _expires_at timestamptz, _lifetime boolean, _ref_limit int)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; t public.profiles;
begin
  if not public.is_owner() then raise exception 'Only the Owner can do this'; end if;
  select * into me from public.profiles where id = auth.uid();
  select * into t from public.profiles where id = _uid for update;
  if not found then raise exception 'User not found'; end if;
  if _uid = auth.uid() and (_role <> 'owner' or _status <> 'active') then raise exception 'You cannot demote or block yourself'; end if;
  if _ref_limit is null or _ref_limit < 0 then raise exception 'Invalid referral limit'; end if;
  update public.profiles set status = _status, ref_limit = _ref_limit,
    expires_at = case when _lifetime then null else _expires_at end
  where id = _uid;
  update public.user_roles set role = _role where user_id = _uid;
  insert into public.transactions (user_id, username, kind, amount, balance_after, details)
  values (_uid, t.username, 'owner_edit', 0, t.balance,
    format('Owner %s set role %s · status %s · expiry %s · ref limit %s', me.username, upper(_role::text), _status,
      case when _lifetime then 'Lifetime' else coalesce(to_char(_expires_at, 'YYYY-MM-DD HH24:MI'), '-') end, _ref_limit));
end $$;

create or replace function public.owner_adjust_balance(_uid uuid, _mode text, _amount bigint, _note text default '')
returns bigint language plpgsql security definer set search_path = public as $$
declare me public.profiles; t public.profiles; nb bigint;
begin
  if not public.is_owner() then raise exception 'Only the Owner can do this'; end if;
  if _amount is null or _amount < 0 then raise exception 'Amount must be 0 or more'; end if;
  select * into me from public.profiles where id = auth.uid();
  select * into t from public.profiles where id = _uid for update;
  if not found then raise exception 'User not found'; end if;
  nb := case _mode when 'add' then t.balance + _amount when 'subtract' then t.balance - _amount when 'set' then _amount else null end;
  if nb is null then raise exception 'Invalid mode'; end if;
  if nb < 0 then raise exception 'Balance cannot go negative (current ₹%)', t.balance; end if;
  update public.profiles set balance = nb where id = _uid;
  insert into public.transactions (user_id, username, kind, amount, balance_after, details)
  values (_uid, t.username, 'balance_adjust', nb - t.balance, nb,
    format('Owner %s %s ₹%s%s', me.username, _mode, _amount, case when coalesce(_note,'') <> '' then ' · ' || _note else '' end));
  return nb;
end $$;

-- ===== Keys maintenance =====
create or replace function public.delete_expired_keys()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public._assert_active(auth.uid());
  delete from public.license_keys where expires_at <= now() and (created_by = auth.uid() or public.is_owner());
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.delete_key(_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_active(auth.uid());
  delete from public.license_keys where id = _id and (created_by = auth.uid() or public.is_owner());
  if not found then raise exception 'Key not found'; end if;
end $$;

create or replace function public.touch_activity()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_active_at = now() where id = auth.uid()
$$;

create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); own boolean := public.is_owner(); tk int; ak int; ek int; us int;
begin
  if uid is null then raise exception 'Please login first'; end if;
  select count(*), count(*) filter (where expires_at > now()), count(*) filter (where expires_at <= now())
    into tk, ak, ek from public.license_keys where own or created_by = uid;
  select count(*) into us from public.profiles where (own and id <> uid) or uplink_id = uid;
  return jsonb_build_object('total_keys', tk, 'active_keys', ak, 'expired_keys', ek, 'users', us);
end $$;

create or replace function public.reset_key_devices(_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.license_keys set devices = '{}' where id = _id and (created_by = auth.uid() or public.is_owner());
  if not found then raise exception 'Key not found'; end if;
end $$;

-- ===== APK connect =====
create or replace function public.connect_key(_game text, _key text, _serial text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s public.connect_settings;
  k public.license_keys;
  exp_txt text;
  real text;
begin
  select * into s from public.connect_settings where id = 1;
  if s.maintenance then
    return jsonb_build_object('status', false, 'reason', s.maintenance_message, 'message', s.maintenance_message);
  end if;
  select * into k from public.license_keys where license_key = _key for update;
  if not found then
    return jsonb_build_object('status', false, 'reason', 'USER OR GAME NOT REGISTERED', 'message', 'Invalid key');
  end if;
  if k.expires_at <= now() then
    return jsonb_build_object('status', false, 'reason', 'EXPIRED KEY', 'message', 'Key expired');
  end if;
  if not (_serial = any(k.devices)) then
    if coalesce(cardinality(k.devices), 0) >= k.max_devices then
      return jsonb_build_object('status', false, 'reason', 'MAX DEVICE REACHED', 'message', 'Max devices reached');
    end if;
    update public.license_keys set devices = array_append(devices, _serial) where id = k.id;
  end if;
  exp_txt := to_char(k.expires_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS');
  real := _game || '-' || _key || '-' || _serial || '-' || s.secret_word;
  return jsonb_build_object('status', true, 'data', jsonb_build_object(
    'token', md5(real),
    'modname', s.mod_name,
    'mod_status', s.mod_status,
    'credit', s.credit_text,
    'ESP', 'on', 'Item', 'on', 'AIM', 'on', 'SilentAim', 'on', 'BulletTrack', 'on',
    'Floating', 'on', 'Memory', 'on', 'Setting', 'on',
    'expired_date', exp_txt,
    'EXP', exp_txt,
    'exdate', exp_txt,
    'device', k.max_devices,
    'rng', extract(epoch from now())::bigint
  ));
end $$;

create or replace function public.connect_key_guarded(_game text, _key text, _serial text, _ip text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  iph text := md5('zx-ip-' || coalesce(_ip, '?'));
  sh text := md5('zx-sn-' || coalesce(_serial, '?'));
  fails int;
  r jsonb;
  sw text;
begin
  delete from public.connect_failures where at < now() - interval '1 hour';
  select count(*) into fails from public.connect_failures
   where at > now() - interval '10 minutes' and (ip_hash = iph or serial_hash = sh);
  if fails >= 10 then
    return jsonb_build_object('status', false, 'reason', 'TOO MANY ATTEMPTS', 'message', 'Too many wrong keys. Try again after 10 minutes.');
  end if;

  r := public.connect_key(_game, _key, _serial);

  if (r->>'status')::boolean is not true then
    if r->>'reason' = 'USER OR GAME NOT REGISTERED' then
      insert into public.connect_failures (ip_hash, serial_hash) values (iph, sh);
    end if;
    return r;
  end if;

  select secret_word into sw from public.connect_settings where id = 1;
  return jsonb_set(r, '{data,sig}', to_jsonb(encode(
    extensions.hmac((r->'data'->>'token') || '|' || (r->'data'->>'rng') || '|' || _serial, sw, 'sha256'), 'hex')));
end $$;

-- ===== Execute permissions =====
revoke execute on function public._assert_active(uuid) from public, anon, authenticated;
revoke execute on function public._provision_user(uuid, text, public.app_role, int, bigint, uuid, text) from public, anon, authenticated;
revoke execute on function public.check_referral(text) from public, anon, authenticated;
revoke execute on function public.redeem_referral(text, uuid, text) from public, anon, authenticated;
grant execute on function public._provision_user(uuid, text, public.app_role, int, bigint, uuid, text) to service_role;
grant execute on function public.check_referral(text) to service_role;
grant execute on function public.redeem_referral(text, uuid, text) to service_role;
revoke execute on function public.generate_keys(text, int, int, int, text, uuid) from public, anon;
revoke execute on function public.create_referral(public.app_role, int, bigint, int, int, uuid) from public, anon;
revoke execute on function public.revoke_referral(uuid) from public, anon;
revoke execute on function public.owner_update_user(uuid, public.app_role, public.account_status, timestamptz, boolean, int) from public, anon;
revoke execute on function public.owner_adjust_balance(uuid, text, bigint, text) from public, anon;
revoke execute on function public.delete_expired_keys() from public, anon;
revoke execute on function public.delete_key(bigint) from public, anon;
revoke execute on function public.touch_activity() from public, anon;
revoke execute on function public.dashboard_stats() from public, anon;
grant execute on function public.generate_keys(text, int, int, int, text, uuid) to authenticated;
grant execute on function public.create_referral(public.app_role, int, bigint, int, int, uuid) to authenticated;
grant execute on function public.revoke_referral(uuid) to authenticated;
grant execute on function public.owner_update_user(uuid, public.app_role, public.account_status, timestamptz, boolean, int) to authenticated;
grant execute on function public.owner_adjust_balance(uuid, text, bigint, text) to authenticated;
grant execute on function public.delete_expired_keys() to authenticated;
grant execute on function public.delete_key(bigint) to authenticated;
grant execute on function public.touch_activity() to authenticated;
grant execute on function public.dashboard_stats() to authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.my_role() to authenticated, service_role;
grant execute on function public.is_owner() to authenticated, service_role;
revoke execute on function public._zx_rand(int) from public, anon, authenticated;
revoke execute on function public.zx_duration_label(int) from public, anon;
grant execute on function public.zx_duration_label(int) to authenticated, service_role;
revoke execute on function public.reset_key_devices(bigint) from public, anon;
grant execute on function public.reset_key_devices(bigint) to authenticated, service_role;
revoke execute on function public.connect_key(text, text, text) from public, anon, authenticated;
grant execute on function public.connect_key(text, text, text) to service_role;
revoke execute on function public.connect_key_guarded(text, text, text, text) from public, anon, authenticated;
grant execute on function public.connect_key_guarded(text, text, text, text) to service_role;

-- ===== Realtime =====
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.notices;

-- ===== Seed data =====
insert into public.prices (hours, price) values
  (5, 50), (24, 99), (72, 150), (168, 299), (360, 350), (720, 550), (1440, 850);

insert into public.app_settings (id, telegram_url, telegram_handle) values (1, 'https://t.me/ONExZEROXX', '@ONExZEROXX');

insert into public.connect_settings (id) values (1) on conflict do nothing;

-- One-time bootstrap code to create the first OWNER account (random per database, never a fixed public code)
insert into public.referral_codes (code, role, duration_hours, credit, max_uses, expires_at, created_by, created_by_name)
values ('ZXOWNER' || public._zx_rand(10), 'owner', null, 0, 1, now() + interval '30 days', null, 'System');