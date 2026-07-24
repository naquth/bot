-- ============================================================
-- FITUR: Akun Privat (Private Account)
-- ============================================================
-- Menambahkan kemampuan bagi pengguna untuk mengunci profilnya.
-- Saat akun privat:
--   * Non-follower tidak bisa melihat post (termasuk yang visibility
--     'public') maupun daftar follower/following.
--   * Follow tidak langsung terjadi — masuk sebagai "permintaan ikuti"
--     (follow_requests) yang harus diterima/ditolak pemilik akun.
--   * Follower yang sudah diterima tetap bisa lihat semua post publik
--     & followers-only milik akun tersebut, persis seperti sebelumnya.
-- Aman dijalankan berulang kali (idempotent).

-- ------------------------------------------------------------
-- 1. Kolom is_private di profiles
-- ------------------------------------------------------------
alter table profiles add column if not exists is_private boolean not null default false;

-- ------------------------------------------------------------
-- 2. Tabel follow_requests
-- ------------------------------------------------------------
create table if not exists follow_requests (
  requester_id uuid references profiles(id) on delete cascade not null,
  target_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  constraint follow_request_not_self check (requester_id <> target_id)
);

create index if not exists follow_requests_target_idx on follow_requests (target_id, created_at desc);

alter table follow_requests enable row level security;

drop policy if exists "User lihat permintaan yang dikirim atau diterimanya" on follow_requests;
create policy "User lihat permintaan yang dikirim atau diterimanya" on follow_requests
  for select using (auth.uid() = requester_id or auth.uid() = target_id);

drop policy if exists "User dapat mengirim permintaan ikuti" on follow_requests;
create policy "User dapat mengirim permintaan ikuti" on follow_requests
  for insert with check (auth.uid() = requester_id);

drop policy if exists "User dapat batalkan atau tolak permintaan" on follow_requests;
create policy "User dapat batalkan atau tolak permintaan" on follow_requests
  for delete using (auth.uid() = requester_id or auth.uid() = target_id);

-- ------------------------------------------------------------
-- 3. toggle_follow_request — RPC utama untuk tombol "Ikuti"
-- ------------------------------------------------------------
-- Menggantikan insert langsung ke follows dari client. Menangani 3 kasus:
--   a) target akun publik  -> langsung insert ke follows (perilaku lama)
--   b) target akun privat  -> insert ke follow_requests (menunggu approval)
--   c) requester adalah admin target atau sudah follow -> no-op aman
-- Mengembalikan status agar UI tahu tombol harus jadi "Mengikuti",
-- "Diminta", atau tetap "Ikuti".
create or replace function public.send_follow_request(target_user_id uuid)
returns text as $$
declare
  target_is_private boolean;
  already_following boolean;
  already_requested boolean;
  am_blocked boolean;
begin
  if auth.uid() is null then
    raise exception 'Tidak terautentikasi';
  end if;
  if auth.uid() = target_user_id then
    raise exception 'Tidak bisa mengikuti diri sendiri';
  end if;

  select exists(
    select 1 from blocks
    where (blocker_id = target_user_id and blocked_id = auth.uid())
       or (blocker_id = auth.uid() and blocked_id = target_user_id)
  ) into am_blocked;
  if am_blocked then
    raise exception 'Tidak dapat mengikuti pengguna ini';
  end if;

  select is_private into target_is_private from profiles where id = target_user_id;
  if target_is_private is null then
    raise exception 'Pengguna tidak ditemukan';
  end if;

  select exists(
    select 1 from follows where follower_id = auth.uid() and following_id = target_user_id
  ) into already_following;
  if already_following then
    return 'following';
  end if;

  if not target_is_private then
    insert into follows (follower_id, following_id) values (auth.uid(), target_user_id)
    on conflict do nothing;
    return 'following';
  end if;

  select exists(
    select 1 from follow_requests where requester_id = auth.uid() and target_id = target_user_id
  ) into already_requested;
  if already_requested then
    return 'requested';
  end if;

  insert into follow_requests (requester_id, target_id) values (auth.uid(), target_user_id)
  on conflict do nothing;
  return 'requested';
end;
$$ language plpgsql security definer set search_path = public;

-- Batalkan permintaan ikuti yang masih pending (dipanggil requester).
create or replace function public.cancel_follow_request(target_user_id uuid)
returns void as $$
begin
  if auth.uid() is null then
    raise exception 'Tidak terautentikasi';
  end if;
  delete from follow_requests where requester_id = auth.uid() and target_id = target_user_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Terima atau tolak permintaan ikuti (dipanggil target/pemilik akun).
create or replace function public.respond_follow_request(requester_user_id uuid, accept boolean)
returns void as $$
begin
  if auth.uid() is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if not exists (
    select 1 from follow_requests where requester_id = requester_user_id and target_id = auth.uid()
  ) then
    raise exception 'Permintaan tidak ditemukan';
  end if;

  if accept then
    insert into follows (follower_id, following_id) values (requester_user_id, auth.uid())
    on conflict do nothing;
  end if;

  delete from follow_requests where requester_id = requester_user_id and target_id = auth.uid();
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------
-- 4. Kunci jalur insert langsung ke follows untuk akun privat
-- ------------------------------------------------------------
-- RPC di atas security definer sehingga bisa bypass RLS follows, tapi kita
-- tetap perketat policy insert biasa supaya client tidak bisa insert
-- follows langsung ke akun privat tanpa lewat approval (defense in depth).
drop policy if exists "User dapat follow sendiri" on follows;
create policy "User dapat follow sendiri" on follows for insert with check (
  auth.uid() = follower_id
  and not exists (select 1 from profiles where id = following_id and is_private = true)
);

-- ------------------------------------------------------------
-- 5. Perketat can_view_post: akun privat menyembunyikan SEMUA post
--    (termasuk visibility 'public') dari non-follower.
-- ------------------------------------------------------------
create or replace function can_view_post(p_author_id uuid, p_visibility text, p_viewer_id uuid)
returns boolean as $$
  select case
    when p_viewer_id = p_author_id then true
    when p_visibility = 'private' then false
    when exists (select 1 from profiles where id = p_author_id and is_private = true) then
      p_viewer_id is not null and exists (
        select 1 from follows
        where follower_id = p_viewer_id and following_id = p_author_id
      )
    when p_visibility = 'public' then true
    when p_visibility = 'followers' then p_viewer_id is not null and exists (
      select 1 from follows
      where follower_id = p_viewer_id and following_id = p_author_id
    )
    else false
  end;
$$ language sql security definer stable set search_path = public;

-- ------------------------------------------------------------
-- 6. Sembunyikan follower/following list akun privat dari non-follower
-- ------------------------------------------------------------
create or replace function can_view_follow_list(p_profile_id uuid, p_viewer_id uuid)
returns boolean as $$
  select case
    when p_viewer_id = p_profile_id then true
    when not exists (select 1 from profiles where id = p_profile_id and is_private = true) then true
    else p_viewer_id is not null and exists (
      select 1 from follows
      where follower_id = p_viewer_id and following_id = p_profile_id
    )
  end;
$$ language sql security definer stable set search_path = public;

drop policy if exists "Follow dapat dilihat semua orang" on follows;
create policy "Follow dapat dilihat sesuai privasi" on follows
  for select using (
    can_view_follow_list(following_id, auth.uid())
    and can_view_follow_list(follower_id, auth.uid())
  );

-- ------------------------------------------------------------
-- 7. Notifikasi: tambah tipe 'follow_request' & 'follow_accept'
-- ------------------------------------------------------------
do $$
begin
  alter table notifications drop constraint if exists notifications_type_check;
  alter table notifications add constraint notifications_type_check
    check (type in ('like', 'reply', 'follow', 'mention', 'quote', 'follow_request', 'follow_accept'));
exception
  when others then null;
end $$;

create or replace function public.handle_new_follow_request()
returns trigger as $$
begin
  insert into notifications (recipient_id, actor_id, type)
  values (new.target_id, new.requester_id, 'follow_request');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_follow_request_created on follow_requests;
create trigger on_follow_request_created
  after insert on follow_requests
  for each row execute procedure public.handle_new_follow_request();

-- Saat permintaan diterima (baris follow_requests dihapus lalu follows
-- baru muncul), handle_new_follow (trigger lama di follows) sudah otomatis
-- membuat notifikasi type 'follow' ke si pengirim permintaan — cukup.

-- Bersihkan notifikasi follow_request lama begitu permintaan
-- dibatalkan/ditolak/diterima, supaya tidak menumpuk di kotak notifikasi
-- si pemilik akun.
create or replace function public.handle_follow_request_removed()
returns trigger as $$
begin
  delete from notifications
  where recipient_id = old.target_id and actor_id = old.requester_id and type = 'follow_request';
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists on_follow_request_removed on follow_requests;
create trigger on_follow_request_removed
  after delete on follow_requests
  for each row execute procedure public.handle_follow_request_removed();

-- ------------------------------------------------------------
-- 8. Saat blokir, batalkan juga permintaan follow di kedua arah
-- ------------------------------------------------------------
create or replace function public.handle_new_block()
returns trigger as $$
begin
  delete from follows where (follower_id = new.blocker_id and following_id = new.blocked_id)
    or (follower_id = new.blocked_id and following_id = new.blocker_id);
  delete from follow_requests where (requester_id = new.blocker_id and target_id = new.blocked_id)
    or (requester_id = new.blocked_id and target_id = new.blocker_id);
  return new;
end;
$$ language plpgsql security definer;

-- ------------------------------------------------------------
-- 9. Saat akun diubah dari privat -> publik, terima otomatis semua
--    permintaan follow yang masih pending (perilaku standar di app sejenis).
-- ------------------------------------------------------------
create or replace function public.handle_profile_privacy_change()
returns trigger as $$
begin
  if old.is_private = true and new.is_private = false then
    insert into follows (follower_id, following_id)
    select requester_id, target_id from follow_requests where target_id = new.id
    on conflict do nothing;
    delete from follow_requests where target_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_privacy_change on profiles;
create trigger on_profile_privacy_change
  after update on profiles
  for each row
  when (old.is_private is distinct from new.is_private)
  execute procedure public.handle_profile_privacy_change();

-- ------------------------------------------------------------
-- 10. can_view_post_thread tetap bekerja apa adanya (memanggil
--     can_view_post yang sudah diperbarui), tidak perlu diubah.
-- ------------------------------------------------------------
