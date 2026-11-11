-- Public visitors may only read the single contact-settings row, and only its contact columns.
drop policy if exists "settings readable" on public.app_settings;
create policy "public contact settings readable" on public.app_settings
  for select to anon, authenticated
  using (id = 1);

revoke select on public.app_settings from anon;
grant select (id, telegram_url, telegram_handle) on public.app_settings to anon;