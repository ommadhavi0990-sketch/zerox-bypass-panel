-- 0002: exact key + game matching, and a lockout that cannot block honest users.
-- Safe to run more than once (create or replace + one-time clear of old lockouts).

-- 1) Exact match: the key must exist AND belong to the game the app sends.
create or replace function public.connect_key(_game text, _key text, _serial text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s public.connect_settings;
  k public.license_keys;
  exp_txt text;
  real text;
begin
  if _key is null or length(trim(_key)) = 0 or _serial is null or length(trim(_serial)) = 0 or _game is null or length(trim(_game)) = 0 then
    return jsonb_build_object('status', false, 'reason', 'Bad Parameter', 'message', 'Invalid key');
  end if;
  select * into s from public.connect_settings where id = 1;
  if not found then
    return jsonb_build_object('status', false, 'reason', 'SERVER ERROR', 'message', 'Try again');
  end if;
  if s.maintenance then
    return jsonb_build_object('status', false, 'reason', s.maintenance_message, 'message', s.maintenance_message);
  end if;
  select * into k from public.license_keys where license_key = trim(_key) for update;
  if not found or lower(trim(k.game)) <> lower(trim(_game)) then
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

-- 2) Lockout: count wrong keys per (ip + device) PAIR, not "ip OR device".
--    Old rule: any 10 wrong keys from one IP (or one shared/'unknown' IP) locked EVERY user,
--    including people holding a valid paid key. New rule: 30 wrong keys / 5 min for the same
--    ip+device pair, plus a high flood cap per IP. A successful login wipes that pair's failures.
create or replace function public.connect_key_guarded(_game text, _key text, _serial text, _ip text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  iph text := md5('zx-ip-' || coalesce(_ip, '?'));
  sh text := md5('zx-sn-' || coalesce(_serial, '?'));
  pair_fails int;
  ip_fails int;
  r jsonb;
  sw text;
begin
  delete from public.connect_failures where at < now() - interval '1 hour';
  select count(*) filter (where serial_hash = sh), count(*) into pair_fails, ip_fails
    from public.connect_failures where at > now() - interval '5 minutes' and ip_hash = iph;
  if pair_fails >= 30 or ip_fails >= 300 then
    return jsonb_build_object('status', false, 'reason', 'TOO MANY ATTEMPTS', 'message', 'Too many wrong keys. Try again after 5 minutes.');
  end if;

  r := public.connect_key(_game, _key, _serial);

  if (r->>'status')::boolean is not true then
    if r->>'reason' = 'USER OR GAME NOT REGISTERED' then
      insert into public.connect_failures (ip_hash, serial_hash) values (iph, sh);
    end if;
    return r;
  end if;

  delete from public.connect_failures where ip_hash = iph and serial_hash = sh;
  select secret_word into sw from public.connect_settings where id = 1;
  return jsonb_set(r, '{data,sig}', to_jsonb(encode(
    extensions.hmac((r->'data'->>'token') || '|' || (r->'data'->>'rng') || '|' || _serial, sw, 'sha256'), 'hex')));
end $$;

revoke execute on function public.connect_key(text, text, text) from public, anon, authenticated;
grant execute on function public.connect_key(text, text, text) to service_role;
revoke execute on function public.connect_key_guarded(text, text, text, text) from public, anon, authenticated;
grant execute on function public.connect_key_guarded(text, text, text, text) to service_role;

-- 3) Release everyone who is locked right now.
delete from public.connect_failures;