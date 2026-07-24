-- Utas database schema
-- Aman dijalankan berulang kali (idempotent) — cocok untuk instalasi baru
-- maupun menerapkan pembaruan skema pada database yang sudah berjalan.

-- ============================================================
-- TABEL
-- ============================================================

-- Profil pengguna, terhubung ke auth.users
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text,
  bio text default '' check (char_length(bio) <= 160),
  is_admin boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz default now()
);

alter table profiles add column if not exists is_admin boolean not null default false;
alter table profiles add column if not exists is_verified boolean not null default false;

-- Postingan (juga dipakai untuk reply via parent_id)
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade not null,
  content text not null check (char_length(content) <= 500),
  parent_id uuid references posts(id) on delete cascade,
  image_url text,
  image_width int,
  image_height int,
  edited_at timestamptz,
  quote_post_id uuid references posts(id) on delete set null,
  pinned_at timestamptz,
  view_count int not null default 0,
  video_url text,
  video_width int,
  video_height int,
  video_duration_sec numeric(6,2),
  video_thumbnail_url text,
  created_at timestamptz default now(),
  constraint no_image_and_video check (not (image_url is not null and video_url is not null))
);

-- Draft postingan (privat, hanya dapat dilihat pemiliknya — lihat RLS di bawah)
create table if not exists post_drafts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade not null,
  content text not null default '' check (char_length(content) <= 500),
  image_url text,
  image_width int,
  image_height int,
  video_url text,
  video_width int,
  video_height int,
  video_duration_sec numeric(6,2),
  video_thumbnail_url text,
  poll_options jsonb,
  poll_duration_hours int,
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'private')),
  parent_id uuid references posts(id) on delete set null,
  quote_post_id uuid references posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_no_image_and_video check (not (image_url is not null and video_url is not null))
);

create index if not exists post_drafts_author_updated_idx
  on post_drafts (author_id, updated_at desc);

-- Like pada post
create table if not exists likes (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- Follow antar pengguna
create table if not exists follows (
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);

-- Notifikasi
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references profiles(id) on delete cascade not null,
  actor_id uuid references profiles(id) on delete cascade not null,
  type text not null check (type in ('like', 'reply', 'follow', 'mention', 'quote')),
  post_id uuid references posts(id) on delete cascade,
  read boolean default false,
  created_at timestamptz default now()
);

-- Bookmark
create table if not exists bookmarks (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- Hashtag
create table if not exists hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text unique not null check (tag ~ '^[a-z0-9_]{1,50}$')
);

create table if not exists post_hashtags (
  post_id uuid references posts(id) on delete cascade,
  hashtag_id uuid references hashtags(id) on delete cascade,
  primary key (post_id, hashtag_id)
);

-- Mention (@username di dalam post)
create table if not exists post_mentions (
  post_id uuid references posts(id) on delete cascade,
  mentioned_user_id uuid references profiles(id) on delete cascade,
  primary key (post_id, mentioned_user_id)
);

-- Polling di dalam post (opsional, satu post maksimal satu poll)
create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade not null unique,
  closes_at timestamptz not null,
  created_at timestamptz default now()
);

create table if not exists poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references polls(id) on delete cascade not null,
  label text not null check (char_length(label) between 1 and 80),
  position smallint not null check (position between 0 and 3)
);

create table if not exists poll_votes (
  poll_id uuid references polls(id) on delete cascade,
  option_id uuid references poll_options(id) on delete cascade not null,
  voter_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (poll_id, voter_id)
);

-- Laporan konten/pengguna (moderasi)
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete cascade not null,
  reported_post_id uuid references posts(id) on delete cascade,
  reported_user_id uuid references profiles(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'misinformation', 'other')),
  detail text default '' check (char_length(detail) <= 500),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz default now(),
  constraint report_target_check check (
    (reported_post_id is not null and reported_user_id is null) or
    (reported_post_id is null and reported_user_id is not null)
  )
);

-- Blokir pengguna
create table if not exists blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id != blocked_id)
);

-- Bisukan (mute): sembunyikan post seseorang dari feed tanpa unfollow dan
-- tanpa mereka tahu (beda dengan block: tetap follow, mereka tetap bisa
-- lihat profil & DM kita seperti biasa).
create table if not exists mutes (
  muter_id uuid references profiles(id) on delete cascade,
  muted_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (muter_id, muted_id),
  constraint no_self_mute check (muter_id != muted_id)
);

-- Pesan langsung (DM)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references profiles(id) on delete cascade not null,
  user_b uuid references profiles(id) on delete cascade not null,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint distinct_users check (user_a != user_b),
  constraint ordered_pair check (user_a < user_b)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete cascade not null,
  content text not null check (char_length(content) <= 1000),
  image_url text,
  image_width int,
  image_height int,
  read boolean default false,
  created_at timestamptz default now()
);

alter table messages add column if not exists image_url text;
alter table messages add column if not exists image_width int;
alter table messages add column if not exists image_height int;
alter table messages add column if not exists audio_url text;
alter table messages add column if not exists audio_duration_sec numeric(6,2);

-- `create table if not exists` di atas TIDAK mengubah constraint pada tabel
-- yang sudah ada di database lama, jadi kalau tabel `messages` dibuat
-- sebelum fitur gambar/voice note ada, constraint content lama (yang
-- mewajibkan content non-kosong) tetap aktif walau baris di atas sudah
-- menuliskan versi longgar. Drop + buat ulang di sini secara eksplisit
-- supaya kirim gambar/voice note tanpa teks (content = '') tidak lagi
-- gagal dengan error 23514 "violates check constraint
-- messages_content_check". Aman dijalankan berulang kali.
alter table messages drop constraint if exists messages_content_check;
alter table messages add constraint messages_content_check check (char_length(content) <= 1000);

do $$
begin
  alter table messages add constraint no_image_and_audio check (not (image_url is not null and audio_url is not null));
exception
  when duplicate_object then null;
end $$;

-- Migrasi kolom untuk database yang sudah berjalan sebelum fitur gambar ditambahkan
alter table posts add column if not exists image_url text;
alter table posts add column if not exists image_width int;
alter table posts add column if not exists image_height int;
alter table posts add column if not exists edited_at timestamptz;
alter table posts add column if not exists quote_post_id uuid references posts(id) on delete set null;
alter table posts add column if not exists pinned_at timestamptz;
alter table posts add column if not exists view_count int not null default 0;
alter table posts add column if not exists video_url text;
alter table posts add column if not exists video_width int;
alter table posts add column if not exists video_height int;
alter table posts add column if not exists video_duration_sec numeric(6,2);
alter table posts add column if not exists video_thumbnail_url text;

do $$
begin
  alter table posts add constraint no_image_and_video check (not (image_url is not null and video_url is not null));
exception
  when duplicate_object then null;
end $$;

-- Privasi postingan: 'public' (semua orang), 'followers' (hanya pengikut),
-- 'private' (hanya penulis sendiri). Lihat penegakannya lewat RLS di
-- bagian bawah — kolom ini sendiri TIDAK cukup untuk keamanan tanpa RLS
-- yang sesuai, karena kolom biasa tidak mencegah pembacaan lewat REST API.
alter table posts add column if not exists visibility text not null default 'public';

do $$
begin
  alter table posts add constraint posts_visibility_check
    check (visibility in ('public', 'followers', 'private'));
exception
  when duplicate_object then null;
end $$;

alter table post_drafts add column if not exists visibility text not null default 'public';

do $$
begin
  alter table post_drafts add constraint post_drafts_visibility_check
    check (visibility in ('public', 'followers', 'private'));
exception
  when duplicate_object then null;
end $$;

-- Migrasi constraint tipe notifikasi untuk database yang sudah berjalan sebelum
-- tipe 'mention' dan 'quote' ditambahkan.
do $$
begin
  alter table notifications drop constraint if exists notifications_type_check;
  alter table notifications add constraint notifications_type_check
    check (type in ('like', 'reply', 'follow', 'mention', 'quote'));
exception
  when others then null;
end $$;

-- ============================================================
-- INDEX
-- ============================================================

create index if not exists posts_parent_id_idx on posts(parent_id);
create index if not exists posts_author_id_idx on posts(author_id);
create index if not exists posts_created_at_idx on posts(created_at desc);
create index if not exists likes_post_id_idx on likes(post_id);
create index if not exists follows_follower_idx on follows(follower_id);
create index if not exists follows_following_idx on follows(following_id);
create index if not exists profiles_username_idx on profiles(username);
create index if not exists notifications_recipient_idx on notifications(recipient_id, created_at desc);
create index if not exists bookmarks_user_idx on bookmarks(user_id, created_at desc);
create index if not exists post_hashtags_hashtag_idx on post_hashtags(hashtag_id);
create index if not exists post_hashtags_post_idx on post_hashtags(post_id);
create index if not exists post_mentions_user_idx on post_mentions(mentioned_user_id);
create index if not exists posts_quote_post_idx on posts(quote_post_id);
create index if not exists posts_video_idx on posts(created_at desc) where video_url is not null;
create index if not exists reports_status_idx on reports(status, created_at desc);
create index if not exists poll_options_poll_idx on poll_options(poll_id, position);
create index if not exists poll_votes_option_idx on poll_votes(option_id);
create unique index if not exists posts_pinned_per_author_idx on posts(author_id) where pinned_at is not null;
create index if not exists posts_visibility_idx on posts(visibility);
create index if not exists reports_reporter_idx on reports(reporter_id);
create index if not exists blocks_blocker_idx on blocks(blocker_id);
create index if not exists blocks_blocked_idx on blocks(blocked_id);
create index if not exists mutes_muter_idx on mutes(muter_id);
create unique index if not exists conversations_pair_idx on conversations(user_a, user_b);
create index if not exists conversations_last_message_idx on conversations(last_message_at desc);
create index if not exists messages_conversation_idx on messages(conversation_id, created_at asc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table posts enable row level security;
alter table likes enable row level security;
alter table follows enable row level security;
alter table notifications enable row level security;
alter table bookmarks enable row level security;
alter table hashtags enable row level security;
alter table post_hashtags enable row level security;
alter table post_mentions enable row level security;
alter table polls enable row level security;
alter table poll_options enable row level security;
alter table poll_votes enable row level security;
alter table reports enable row level security;
alter table blocks enable row level security;
alter table mutes enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

-- profiles
drop policy if exists "Profil dapat dilihat semua orang" on profiles;
create policy "Profil dapat dilihat semua orang" on profiles for select using (true);
drop policy if exists "User dapat update profil sendiri" on profiles;
create policy "User dapat update profil sendiri" on profiles for update using (auth.uid() = id);

-- Cegah user mengubah is_admin atau is_verified miliknya sendiri lewat update
-- biasa (mis. lewat form edit profil di aplikasi). Kolom ini hanya boleh
-- diubah lewat SQL Editor Supabase langsung oleh pemilik project, atau lewat
-- fungsi khusus admin (lihat handle_admin_review_report). Tanpa trigger ini,
-- RLS "auth.uid() = id" pada policy update di atas akan mengizinkan user
-- mengubah kolom apapun di barisnya sendiri, termasuk menaikkan privilegenya
-- sendiri menjadi admin — celah privilege escalation.
create or replace function public.prevent_self_privilege_escalation()
returns trigger as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() = old.id then
    new.is_admin := old.is_admin;
  end if;
  if new.is_verified is distinct from old.is_verified and auth.uid() = old.id then
    new.is_verified := old.is_verified;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_update_guard on profiles;
create trigger on_profile_update_guard
  before update on profiles
  for each row execute procedure public.prevent_self_privilege_escalation();

-- posts
-- Fungsi security definer untuk cek visibilitas post — lihat penjelasan
-- lengkap di supabase/migrations/add-post-visibility.sql.
create or replace function can_view_post(p_author_id uuid, p_visibility text, p_viewer_id uuid)
returns boolean as $$
  select case
    when p_viewer_id = p_author_id then true
    when p_visibility = 'public' then true
    when p_visibility = 'private' then false
    when p_visibility = 'followers' then exists (
      select 1 from follows
      where follower_id = p_viewer_id and following_id = p_author_id
    )
    else false
  end;
$$ language sql security definer stable set search_path = public;

create or replace function can_view_post_thread(p_post_id uuid, p_viewer_id uuid)
returns boolean as $$
  with recursive ancestor_chain as (
    select p.id, p.author_id, p.visibility, p.parent_id, 1 as depth
    from posts p
    where p.id = p_post_id

    union all

    select p.id, p.author_id, p.visibility, p.parent_id, ac.depth + 1
    from posts p
    join ancestor_chain ac on p.id = ac.parent_id
    where ac.depth < 50
  )
  select coalesce(bool_and(can_view_post(author_id, visibility, p_viewer_id)), true)
  from ancestor_chain;
$$ language sql security definer stable set search_path = public;

drop policy if exists "Post dapat dilihat semua orang" on posts;
drop policy if exists "Post dapat dilihat sesuai visibilitas" on posts;
create policy "Post dapat dilihat sesuai visibilitas" on posts
  for select using (
    can_view_post(author_id, visibility, auth.uid())
    and (parent_id is null or can_view_post_thread(parent_id, auth.uid()))
  );
drop policy if exists "User dapat membuat post sendiri" on posts;
create policy "User dapat membuat post sendiri" on posts for insert with check (auth.uid() = author_id);
drop policy if exists "User dapat hapus post sendiri" on posts;
create policy "User dapat hapus post sendiri" on posts for delete using (auth.uid() = author_id);
drop policy if exists "User dapat edit post sendiri" on posts;
create policy "User dapat edit post sendiri" on posts for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- post_drafts (privat — hanya pemilik yang boleh lihat/ubah/hapus)
alter table post_drafts enable row level security;

drop policy if exists "User hanya lihat draft sendiri" on post_drafts;
create policy "User hanya lihat draft sendiri" on post_drafts
  for select using (auth.uid() = author_id);

drop policy if exists "User dapat buat draft sendiri" on post_drafts;
create policy "User dapat buat draft sendiri" on post_drafts
  for insert with check (auth.uid() = author_id);

drop policy if exists "User dapat update draft sendiri" on post_drafts;
create policy "User dapat update draft sendiri" on post_drafts
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "User dapat hapus draft sendiri" on post_drafts;
create policy "User dapat hapus draft sendiri" on post_drafts
  for delete using (auth.uid() = author_id);

create or replace function public.set_post_draft_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_post_draft_update on post_drafts;
create trigger on_post_draft_update
  before update on post_drafts
  for each row execute procedure public.set_post_draft_updated_at();

-- likes

drop policy if exists "Like dapat dilihat semua orang" on likes;
create policy "Like dapat dilihat semua orang" on likes for select using (true);
drop policy if exists "User dapat like/unlike sendiri" on likes;
create policy "User dapat like/unlike sendiri" on likes for insert with check (auth.uid() = user_id);
drop policy if exists "User dapat hapus like sendiri" on likes;
create policy "User dapat hapus like sendiri" on likes for delete using (auth.uid() = user_id);

-- follows
drop policy if exists "Follow dapat dilihat semua orang" on follows;
create policy "Follow dapat dilihat semua orang" on follows for select using (true);
drop policy if exists "User dapat follow sendiri" on follows;
create policy "User dapat follow sendiri" on follows for insert with check (auth.uid() = follower_id);
drop policy if exists "User dapat unfollow sendiri" on follows;
create policy "User dapat unfollow sendiri" on follows for delete using (auth.uid() = follower_id);

-- notifications
drop policy if exists "User hanya lihat notifikasi sendiri" on notifications;
create policy "User hanya lihat notifikasi sendiri" on notifications for select using (auth.uid() = recipient_id);
drop policy if exists "User dapat update status baca notifikasi sendiri" on notifications;
create policy "User dapat update status baca notifikasi sendiri" on notifications for update using (auth.uid() = recipient_id);
drop policy if exists "Sistem dapat insert notifikasi" on notifications;
create policy "Sistem dapat insert notifikasi" on notifications for insert with check (auth.uid() = actor_id);

-- bookmarks
drop policy if exists "User hanya lihat bookmark sendiri" on bookmarks;
create policy "User hanya lihat bookmark sendiri" on bookmarks for select using (auth.uid() = user_id);
drop policy if exists "User dapat bookmark sendiri" on bookmarks;
create policy "User dapat bookmark sendiri" on bookmarks for insert with check (auth.uid() = user_id);
drop policy if exists "User dapat hapus bookmark sendiri" on bookmarks;
create policy "User dapat hapus bookmark sendiri" on bookmarks for delete using (auth.uid() = user_id);

-- hashtags & post_hashtags: publik dibaca semua orang, ditulis lewat trigger (security definer)
drop policy if exists "Hashtag dapat dilihat semua orang" on hashtags;
create policy "Hashtag dapat dilihat semua orang" on hashtags for select using (true);
drop policy if exists "Relasi post-hashtag dapat dilihat semua orang" on post_hashtags;
create policy "Relasi post-hashtag dapat dilihat semua orang" on post_hashtags for select using (true);

-- post_mentions: publik dibaca semua orang, ditulis lewat trigger (security definer)
drop policy if exists "Mention dapat dilihat semua orang" on post_mentions;
create policy "Mention dapat dilihat semua orang" on post_mentions for select using (true);

-- reports: hanya pelapor sendiri yang bisa lihat laporannya (bukan publik, karena berisi konten sensitif)
-- polls: dapat dilihat semua orang, dibuat hanya oleh pemilik post terkait
drop policy if exists "Poll dapat dilihat semua orang" on polls;
create policy "Poll dapat dilihat semua orang" on polls for select using (true);
drop policy if exists "User dapat buat poll di post sendiri" on polls;
create policy "User dapat buat poll di post sendiri" on polls
  for insert with check (
    exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
  );

drop policy if exists "Opsi poll dapat dilihat semua orang" on poll_options;
create policy "Opsi poll dapat dilihat semua orang" on poll_options for select using (true);
drop policy if exists "User dapat buat opsi poll di post sendiri" on poll_options;
create policy "User dapat buat opsi poll di post sendiri" on poll_options
  for insert with check (
    exists (
      select 1 from polls pl join posts p on p.id = pl.post_id
      where pl.id = poll_id and p.author_id = auth.uid()
    )
  );

drop policy if exists "Suara poll dapat dilihat semua orang" on poll_votes;
create policy "Suara poll dapat dilihat semua orang" on poll_votes for select using (true);
drop policy if exists "User dapat memilih sendiri" on poll_votes;
create policy "User dapat memilih sendiri" on poll_votes for insert with check (auth.uid() = voter_id);

drop policy if exists "User hanya lihat laporan miliknya" on reports;
create policy "User hanya lihat laporan miliknya" on reports for select using (auth.uid() = reporter_id);
drop policy if exists "User dapat membuat laporan" on reports;
create policy "User dapat membuat laporan" on reports for insert with check (auth.uid() = reporter_id);

-- Admin dapat melihat dan menindaklanjuti semua laporan, bukan hanya miliknya
drop policy if exists "Admin dapat lihat semua laporan" on reports;
create policy "Admin dapat lihat semua laporan" on reports for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true)
);
drop policy if exists "Admin dapat update status laporan" on reports;
create policy "Admin dapat update status laporan" on reports for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true)
);

-- blocks: user hanya bisa lihat & kelola daftar blokirnya sendiri
drop policy if exists "User hanya lihat daftar blokir miliknya" on blocks;
create policy "User hanya lihat daftar blokir miliknya" on blocks for select using (auth.uid() = blocker_id);
drop policy if exists "User dapat blokir pengguna lain" on blocks;
create policy "User dapat blokir pengguna lain" on blocks for insert with check (auth.uid() = blocker_id);
drop policy if exists "User dapat membuka blokir" on blocks;
create policy "User dapat membuka blokir" on blocks for delete using (auth.uid() = blocker_id);

-- mutes: sepenuhnya privat, hanya pemilik yang tahu siapa yang dia bisukan
drop policy if exists "User hanya lihat daftar bisukan miliknya" on mutes;
create policy "User hanya lihat daftar bisukan miliknya" on mutes for select using (auth.uid() = muter_id);
drop policy if exists "User dapat membisukan pengguna lain" on mutes;
create policy "User dapat membisukan pengguna lain" on mutes for insert with check (auth.uid() = muter_id);
drop policy if exists "User dapat membuka bisukan" on mutes;
create policy "User dapat membuka bisukan" on mutes for delete using (auth.uid() = muter_id);

-- conversations
drop policy if exists "User hanya lihat percakapan miliknya" on conversations;
create policy "User hanya lihat percakapan miliknya" on conversations
  for select using (auth.uid() = user_a or auth.uid() = user_b);
drop policy if exists "User dapat membuat percakapan miliknya" on conversations;
create policy "User dapat membuat percakapan miliknya" on conversations
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);

-- messages
drop policy if exists "User hanya lihat pesan di percakapannya" on messages;
create policy "User hanya lihat pesan di percakapannya" on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );
drop policy if exists "User dapat kirim pesan di percakapannya" on messages;
create policy "User dapat kirim pesan di percakapannya" on messages
  for insert with check (
    auth.uid() = sender_id and
    (char_length(content) > 0 or image_url is not null or audio_url is not null) and
    exists (
      select 1 from conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );
drop policy if exists "User dapat tandai pesan di percakapannya sudah dibaca" on messages;
create policy "User dapat tandai pesan di percakapannya sudah dibaca" on messages
  for update using (
    exists (
      select 1 from conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  )
  with check (
    sender_id != auth.uid() and
    exists (
      select 1 from conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );
drop policy if exists "User dapat hapus pesan sendiri" on messages;
create policy "User dapat hapus pesan sendiri" on messages
  for delete using (auth.uid() = sender_id);

-- ============================================================
-- STORAGE (avatar)
-- ============================================================

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar dapat dilihat semua orang" on storage.objects;
create policy "Avatar dapat dilihat semua orang" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "User dapat upload avatar sendiri" on storage.objects;
create policy "User dapat upload avatar sendiri" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "User dapat update avatar sendiri" on storage.objects;
create policy "User dapat update avatar sendiri" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage bucket untuk gambar post
insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true)
on conflict (id) do nothing;

drop policy if exists "Gambar post dapat dilihat semua orang" on storage.objects;
create policy "Gambar post dapat dilihat semua orang" on storage.objects
  for select using (bucket_id = 'post-images');

drop policy if exists "User dapat upload gambar post sendiri" on storage.objects;
create policy "User dapat upload gambar post sendiri" on storage.objects
  for insert with check (bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "User dapat hapus gambar post sendiri" on storage.objects;
create policy "User dapat hapus gambar post sendiri" on storage.objects
  for delete using (bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage bucket untuk video post. Batas ukuran 80MB ditegakkan di level
-- bucket (file_size_limit dalam bytes) sebagai jaring pengaman tambahan di
-- luar validasi ukuran yang sudah dilakukan di client sebelum upload.
insert into storage.buckets (id, name, public, file_size_limit)
values ('post-videos', 'post-videos', true, 83886080)
on conflict (id) do update set file_size_limit = 83886080;

drop policy if exists "Video post dapat dilihat semua orang" on storage.objects;
create policy "Video post dapat dilihat semua orang" on storage.objects
  for select using (bucket_id = 'post-videos');

drop policy if exists "User dapat upload video post sendiri" on storage.objects;
create policy "User dapat upload video post sendiri" on storage.objects
  for insert with check (bucket_id = 'post-videos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "User dapat hapus video post sendiri" on storage.objects;
create policy "User dapat hapus video post sendiri" on storage.objects
  for delete using (bucket_id = 'post-videos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Buat profil otomatis saat user baru daftar
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'Pengguna Baru'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Rate limit: maksimal 8 post per 5 menit per user
create or replace function public.check_post_rate_limit()
returns trigger as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from posts
  where author_id = new.author_id
    and created_at > now() - interval '5 minutes';

  if recent_count >= 8 then
    raise exception 'RATE_LIMIT_EXCEEDED';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_post_rate_limit on posts;
create trigger enforce_post_rate_limit
  before insert on posts
  for each row execute procedure public.check_post_rate_limit();

-- Notifikasi otomatis saat like baru
create or replace function public.handle_new_like()
returns trigger as $$
declare
  post_author uuid;
begin
  select author_id into post_author from posts where id = new.post_id;
  if post_author is not null and post_author != new.user_id then
    insert into notifications (recipient_id, actor_id, type, post_id)
    values (post_author, new.user_id, 'like', new.post_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_like_created on likes;
create trigger on_like_created
  after insert on likes
  for each row execute procedure public.handle_new_like();

-- Notifikasi otomatis saat reply baru
create or replace function public.handle_new_reply()
returns trigger as $$
declare
  parent_author uuid;
begin
  if new.parent_id is not null then
    select author_id into parent_author from posts where id = new.parent_id;
    if parent_author is not null and parent_author != new.author_id then
      insert into notifications (recipient_id, actor_id, type, post_id)
      values (parent_author, new.author_id, 'reply', new.id);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_reply_created on posts;
create trigger on_reply_created
  after insert on posts
  for each row execute procedure public.handle_new_reply();

-- Parsing hashtag (#topik) dari konten post: buat entri hashtags bila belum
-- ada, lalu hubungkan lewat post_hashtags. Berjalan saat insert maupun update
-- (edit post) supaya hashtag baru ikut terdeteksi.
create or replace function public.handle_post_hashtags()
returns trigger as $$
declare
  tag_match text;
  tag_id uuid;
begin
  delete from post_hashtags where post_id = new.id;

  for tag_match in
    select lower(m[1]) from regexp_matches(new.content, '#([a-zA-Z0-9_]{1,50})', 'g') as m
  loop
    insert into hashtags (tag) values (tag_match)
    on conflict (tag) do update set tag = excluded.tag
    returning id into tag_id;

    insert into post_hashtags (post_id, hashtag_id)
    values (new.id, tag_id)
    on conflict do nothing;
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_post_hashtags on posts;
create trigger on_post_hashtags
  after insert or update of content on posts
  for each row execute procedure public.handle_post_hashtags();

-- Parsing mention (@username) dari konten post: hubungkan lewat post_mentions
-- dan kirim notifikasi ke user yang di-mention (kecuali mention diri sendiri).
create or replace function public.handle_post_mentions()
returns trigger as $$
declare
  username_match text;
  mentioned_id uuid;
begin
  delete from post_mentions where post_id = new.id;

  for username_match in
    select lower(m[1]) from regexp_matches(new.content, '@([a-zA-Z0-9_]{3,20})', 'g') as m
  loop
    select id into mentioned_id from profiles where username = username_match;

    if mentioned_id is not null and mentioned_id != new.author_id then
      insert into post_mentions (post_id, mentioned_user_id)
      values (new.id, mentioned_id)
      on conflict do nothing;

      insert into notifications (recipient_id, actor_id, type, post_id)
      values (mentioned_id, new.author_id, 'mention', new.id);
    end if;
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_post_mentions on posts;
create trigger on_post_mentions
  after insert on posts
  for each row execute procedure public.handle_post_mentions();

-- Notifikasi otomatis saat post di-quote (ulang unggah dengan kutipan relasional)
create or replace function public.handle_new_quote()
returns trigger as $$
declare
  original_author uuid;
begin
  if new.quote_post_id is not null then
    select author_id into original_author from posts where id = new.quote_post_id;
    if original_author is not null and original_author != new.author_id then
      insert into notifications (recipient_id, actor_id, type, post_id)
      values (original_author, new.author_id, 'quote', new.id);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_quote_created on posts;
create trigger on_quote_created
  after insert on posts
  for each row execute procedure public.handle_new_quote();

-- Notifikasi otomatis saat follow baru
create or replace function public.handle_new_follow()
returns trigger as $$
begin
  insert into notifications (recipient_id, actor_id, type)
  values (new.following_id, new.follower_id, 'follow');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_follow_created on follows;
create trigger on_follow_created
  after insert on follows
  for each row execute procedure public.handle_new_follow();

-- Saat user memblokir orang lain, putuskan hubungan follow di kedua arah
-- otomatis, supaya user yang diblokir tidak lagi muncul mengikuti/diikuti.
create or replace function public.handle_new_block()
returns trigger as $$
begin
  delete from follows where (follower_id = new.blocker_id and following_id = new.blocked_id)
    or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_block_created on blocks;
create trigger on_block_created
  after insert on blocks
  for each row execute procedure public.handle_new_block();

-- Update last_message_at otomatis saat ada pesan baru
create or replace function public.handle_new_message()
returns trigger as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_message_created on messages;
create trigger on_message_created
  after insert on messages
  for each row execute procedure public.handle_new_message();

-- Hapus akun sendiri. Menghapus baris di auth.users akan otomatis
-- menghapus profil dan semua data terkait lewat "on delete cascade" di
-- setiap foreign key (posts, likes, follows, messages, dst). Dibungkus
-- security definer supaya user biasa (anon/authenticated role, tanpa akses
-- langsung ke skema auth) tetap bisa memicu penghapusan akunnya sendiri.
-- Fungsi ini SENGAJA memverifikasi auth.uid() = user_id di dalam body,
-- bukan mengandalkan RLS, karena tabel auth.users tidak punya RLS policy
-- yang bisa diatur dari aplikasi.
create or replace function public.delete_own_account()
returns void as $$
begin
  if auth.uid() is null then
    raise exception 'Tidak terautentikasi';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$ language plpgsql security definer;

-- ============================================================
-- REALTIME
-- ============================================================

-- Aktifkan realtime untuk pesan agar chat update tanpa refresh.
-- Dibungkus exception handler karena "alter publication ... add table"
-- tidak memiliki sintaks "if not exists" bawaan di PostgreSQL.
do $$
begin
  alter publication supabase_realtime add table messages;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table posts;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table likes;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table notifications;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table follows;
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table poll_votes;
exception
  when duplicate_object then
    null;
end $$;

-- Replica identity full diperlukan agar event DELETE lewat realtime
-- menyertakan data baris lengkap (termasuk id), bukan hanya primary key kosong.
alter table messages replica identity full;
alter table posts replica identity full;
alter table likes replica identity full;

-- Fungsi khusus admin: ubah status laporan. Memverifikasi is_admin di dalam
-- body function (bukan cuma mengandalkan RLS) sebagai lapis pertahanan ganda.
create or replace function public.admin_update_report_status(report_id uuid, new_status text)
returns void as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Hanya admin yang dapat melakukan ini';
  end if;
  if new_status not in ('pending', 'reviewed', 'dismissed') then
    raise exception 'Status tidak valid';
  end if;

  update reports set status = new_status where id = report_id;
end;
$$ language plpgsql security definer;

-- Tambah 1 ke view_count secara atomik (menghindari race condition read-then-
-- write dari aplikasi kalau banyak orang buka post yang sama bersamaan).
-- Dibiarkan bisa dipanggil siapa saja termasuk anon, karena melihat sebuah
-- utas bukan aksi yang perlu autentikasi.
create or replace function public.increment_post_view(target_post_id uuid)
returns void as $$
begin
  update posts set view_count = view_count + 1 where id = target_post_id;
end;
$$ language plpgsql security definer;

-- Fungsi khusus admin: hapus post yang dilaporkan (moderasi konten)
create or replace function public.admin_delete_post(target_post_id uuid)
returns void as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Hanya admin yang dapat melakukan ini';
  end if;

  delete from posts where id = target_post_id;
end;
$$ language plpgsql security definer;

-- Fungsi khusus admin: angkat/turunkan admin lain
create or replace function public.admin_set_admin_status(target_user_id uuid, new_status boolean)
returns void as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Hanya admin yang dapat melakukan ini';
  end if;

  update profiles set is_admin = new_status where id = target_user_id;
end;
$$ language plpgsql security definer;

-- Fungsi khusus admin: verifikasi/cabut verifikasi akun. Dibuat sebagai RPC
-- terpisah (bukan mengandalkan update biasa dari client) supaya validasi
-- "hanya admin yang boleh" eksplisit di dalam function, bukan implisit lewat
-- kombinasi RLS + trigger yang lebih sulit diaudit.
create or replace function public.admin_set_verified(target_user_id uuid, new_status boolean)
returns void as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Hanya admin yang dapat melakukan ini';
  end if;

  update profiles set is_verified = new_status where id = target_user_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- CATATAN: MENGANGKAT ADMIN PERTAMA
-- ============================================================
-- Tidak ada cara mengangkat admin lewat aplikasi (disengaja, untuk mencegah
-- privilege escalation — lihat trigger prevent_self_privilege_escalation di
-- atas). Untuk menjadikan seseorang admin pertama kali, jalankan manual di
-- SQL Editor Supabase:
--
--   update profiles set is_admin = true where username = 'username_kamu';
--
-- Setelah itu, admin bisa mengangkat admin lain lewat halaman /admin di
-- aplikasi (yang juga memakai fungsi security definer, bukan update RLS biasa).

-- ============================================================
-- GRUP CHAT (percakapan multi-anggota)
-- ============================================================
-- Memperluas 'conversations' agar mendukung grup, bukan cuma DM 1-ke-1.
-- user_a/user_b dipertahankan (dibuat nullable) untuk kompatibilitas mundur
-- dengan baris lama; keanggotaan sekarang sumber kebenarannya ada di tabel
-- conversation_participants (many-to-many), termasuk untuk DM lama yang
-- dimigrasikan otomatis di bawah.

alter table conversations add column if not exists is_group boolean not null default false;
alter table conversations add column if not exists name text;
alter table conversations add column if not exists avatar_url text;
alter table conversations add column if not exists created_by uuid references profiles(id) on delete set null;

do $$
begin
  alter table conversations add constraint group_name_length check (name is null or char_length(name) between 1 and 50);
exception
  when duplicate_object then null;
end $$;

-- Kolom lama dibuat nullable + constraint pair lama dilonggarkan, supaya
-- baris grup baru (tanpa user_a/user_b) dan grup >2 anggota bisa dibuat.
alter table conversations alter column user_a drop not null;
alter table conversations alter column user_b drop not null;
alter table conversations drop constraint if exists distinct_users;
alter table conversations drop constraint if exists ordered_pair;
drop index if exists conversations_pair_idx;

create table if not exists conversation_participants (
  conversation_id uuid references conversations(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  is_admin boolean not null default false,
  joined_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_idx on conversation_participants(user_id);
create index if not exists conversation_participants_conv_idx on conversation_participants(conversation_id);

-- Unique pair index baru: mencegah DM 1-ke-1 duplikat antara 2 user yang
-- sama, hanya berlaku untuk percakapan bukan grup (grup boleh punya
-- kombinasi anggota apa saja, termasuk yang sama dengan grup lain).
create unique index if not exists conversations_dm_pair_idx on conversations(least(user_a, user_b), greatest(user_a, user_b)) where not is_group and user_a is not null and user_b is not null;

-- Migrasi data: setiap DM lama (yang masih pakai user_a/user_b) dicatat
-- juga sebagai baris di conversation_participants, supaya query baru yang
-- berbasis participants tetap menemukan percakapan lama. Aman dijalankan
-- berulang karena on conflict do nothing.
insert into conversation_participants (conversation_id, user_id)
select id, user_a from conversations where user_a is not null
union
select id, user_b from conversations where user_b is not null
on conflict do nothing;

alter table conversation_participants enable row level security;

-- Fungsi security definer untuk cek keanggotaan/admin di conversation_participants.
-- WAJIB dipakai alih-alih subquery langsung ke conversation_participants di dalam
-- policy conversation_participants sendiri, karena subquery langsung memicu
-- "infinite recursion detected in policy" (Postgres mengevaluasi ulang policy yang
-- sama untuk baris yang diakses subquery tersebut, berulang tanpa henti). Fungsi
-- security definer berjalan dengan hak akses pemilik fungsi (bukan RLS pemanggil),
-- jadi query di dalamnya tidak memicu RLS lagi.
create or replace function is_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and user_id = p_user_id
  );
$$ language sql security definer stable set search_path = public;

create or replace function is_conversation_admin(p_conversation_id uuid, p_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and user_id = p_user_id and is_admin = true
  );
$$ language sql security definer stable set search_path = public;

drop policy if exists "User hanya lihat partisipan percakapannya" on conversation_participants;
create policy "User hanya lihat partisipan percakapannya" on conversation_participants
  for select using (
    is_conversation_participant(conversation_participants.conversation_id, auth.uid())
  );

drop policy if exists "User dapat menambahkan partisipan ke grup miliknya" on conversation_participants;
create policy "User dapat menambahkan partisipan ke grup miliknya" on conversation_participants
  for insert with check (
    -- Boleh menambahkan diri sendiri, atau menambahkan orang lain kalau:
    -- (a) auth.uid() adalah admin di percakapan itu (menambah anggota grup belakangan), atau
    -- (b) auth.uid() adalah pembuat percakapan itu (created_by) — dipakai saat membuat
    --     DM/grup baru, supaya baris partisipan lawan bicara/anggota awal bisa langsung
    --     ditambahkan dalam insert yang sama tanpa perlu jadi anggota dulu (belum ada
    --     baris participants sama sekali di titik itu), atau
    -- (c) percakapan ini adalah DM (bukan grup) dan auth.uid() adalah salah satu dari
    --     user_a/user_b-nya — dipakai untuk memperbaiki baris participants yang gagal
    --     dibuat sebelumnya (baris "yatim"), dari sisi manapun (bukan cuma pembuat asli).
    user_id = auth.uid() or
    is_conversation_admin(conversation_participants.conversation_id, auth.uid()) or
    exists (
      select 1 from conversations c
      where c.id = conversation_participants.conversation_id and c.created_by = auth.uid()
    ) or
    exists (
      select 1 from conversations c
      where c.id = conversation_participants.conversation_id and not c.is_group and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

drop policy if exists "Admin grup dapat keluarkan anggota, siapapun bisa keluar sendiri" on conversation_participants;
create policy "Admin grup dapat keluarkan anggota, siapapun bisa keluar sendiri" on conversation_participants
  for delete using (
    user_id = auth.uid() or
    is_conversation_admin(conversation_participants.conversation_id, auth.uid())
  );

-- Ganti RLS conversations/messages/voice-notes lama (berbasis kolom
-- user_a/user_b) dengan versi berbasis conversation_participants, supaya
-- grup (dan DM baru yang tidak lagi mengisi user_a/user_b) ikut tercakup.

drop policy if exists "User hanya lihat percakapan miliknya" on conversations;
create policy "User hanya lihat percakapan miliknya" on conversations
  for select using (
    is_conversation_participant(conversations.id, auth.uid())
    or created_by = auth.uid()
    or auth.uid() = user_a
    or auth.uid() = user_b
  );

drop policy if exists "User dapat membuat percakapan miliknya" on conversations;
create policy "User dapat membuat percakapan miliknya" on conversations
  for insert with check (auth.uid() = created_by or auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "Admin grup dapat update grup" on conversations;
create policy "Admin grup dapat update grup" on conversations
  for update using (
    is_conversation_participant(conversations.id, auth.uid()) and (not conversations.is_group or is_conversation_admin(conversations.id, auth.uid()))
  );

drop policy if exists "User hanya lihat pesan di percakapannya" on messages;
create policy "User hanya lihat pesan di percakapannya" on messages
  for select using (
    is_conversation_participant(messages.conversation_id, auth.uid())
  );

drop policy if exists "User dapat kirim pesan di percakapannya" on messages;
create policy "User dapat kirim pesan di percakapannya" on messages
  for insert with check (
    auth.uid() = sender_id and
    is_conversation_participant(messages.conversation_id, auth.uid())
  );

drop policy if exists "User dapat tandai pesan di percakapannya sudah dibaca" on messages;
create policy "User dapat tandai pesan di percakapannya sudah dibaca" on messages
  for update using (
    is_conversation_participant(messages.conversation_id, auth.uid())
  ) with check (
    is_conversation_participant(messages.conversation_id, auth.uid())
  );

-- Telepon & video call: sinyal WebRTC dikirim lewat Realtime Broadcast di
-- channel bertopik `calls:<conversation_id>`. Realtime Authorization di
-- bawah memastikan hanya partisipan percakapan yang bisa join/broadcast ke
-- channel tersebut, bukan siapa saja yang menebak nama topiknya.
--
-- CATATAN: `realtime.messages` dimiliki oleh sistem Supabase Realtime
-- sendiri, bukan role `postgres` project ini, dan RLS-nya SUDAH otomatis
-- aktif secara default. JANGAN jalankan `alter table realtime.messages
-- enable row level security` — akan gagal dengan error 42501 "must be
-- owner of table messages". Cukup buat policy-nya saja seperti di bawah.

drop policy if exists "Partisipan percakapan dapat memakai channel call" on realtime.messages;
create policy "Partisipan percakapan dapat memakai channel call" on realtime.messages
  for select using (
    realtime.topic() like 'calls:%'
    and is_conversation_participant(substring(realtime.topic() from 7)::uuid, auth.uid())
  );

drop policy if exists "Partisipan percakapan dapat broadcast ke channel call" on realtime.messages;
create policy "Partisipan percakapan dapat broadcast ke channel call" on realtime.messages
  for insert with check (
    realtime.topic() like 'calls:%'
    and is_conversation_participant(substring(realtime.topic() from 7)::uuid, auth.uid())
  );

drop policy if exists "User dapat lihat voice note di percakapannya" on storage.objects;
create policy "User dapat lihat voice note di percakapannya" on storage.objects
  for select using (
    bucket_id = 'voice-notes' and
    is_conversation_participant(((storage.foldername(name))[2])::uuid, auth.uid())
  );

drop policy if exists "User dapat upload voice note sendiri" on storage.objects;
create policy "User dapat upload voice note sendiri" on storage.objects
  for insert with check (
    bucket_id = 'voice-notes' and
    auth.uid()::text = (storage.foldername(name))[1] and
    is_conversation_participant(((storage.foldername(name))[2])::uuid, auth.uid())
  );

-- Storage bucket untuk avatar grup (dipakai folder terpisah dari avatar
-- profil di bucket 'avatars' yang sama: group-avatars/{conversation_id}/...)
drop policy if exists "User dapat upload avatar grup jika admin" on storage.objects;
create policy "User dapat upload avatar grup jika admin" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = 'group-avatars' and
    is_conversation_admin(((storage.foldername(name))[2])::uuid, auth.uid())
  );

drop policy if exists "User dapat update avatar grup jika admin" on storage.objects;
create policy "User dapat update avatar grup jika admin" on storage.objects
  for update using (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = 'group-avatars' and
    is_conversation_admin(((storage.foldername(name))[2])::uuid, auth.uid())
  );

-- Batasi pesan grup maksimal 100 anggota (dicek di application layer saat
-- insert, RLS di atas sudah cukup untuk keamanan akses baca/tulis).

-- ============================================================
-- STORIES (konten sementara 24 jam, gaya Instagram/WhatsApp Status)
-- ============================================================

create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade not null,
  image_url text,
  image_width int,
  image_height int,
  video_url text,
  video_width int,
  video_height int,
  video_duration_sec numeric(6,2),
  caption text default '' check (char_length(caption) <= 200),
  bg_color text default '#000000',
  view_count int not null default 0,
  created_at timestamptz default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint story_has_media check (image_url is not null or video_url is not null),
  constraint story_no_image_and_video check (not (image_url is not null and video_url is not null))
);

create table if not exists story_views (
  story_id uuid references stories(id) on delete cascade,
  viewer_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (story_id, viewer_id)
);

create index if not exists stories_author_idx on stories(author_id, created_at desc);
create index if not exists stories_expires_idx on stories(expires_at);
create index if not exists story_views_story_idx on story_views(story_id);
create index if not exists story_views_viewer_idx on story_views(viewer_id);

alter table stories enable row level security;
alter table story_views enable row level security;

drop policy if exists "Story aktif dapat dilihat semua orang" on stories;
create policy "Story aktif dapat dilihat semua orang" on stories
  for select using (expires_at > now());

drop policy if exists "User dapat lihat story sendiri walau sudah lewat" on stories;
create policy "User dapat lihat story sendiri walau sudah lewat" on stories
  for select using (auth.uid() = author_id);

drop policy if exists "User dapat membuat story sendiri" on stories;
create policy "User dapat membuat story sendiri" on stories
  for insert with check (auth.uid() = author_id);

drop policy if exists "User dapat hapus story sendiri" on stories;
create policy "User dapat hapus story sendiri" on stories
  for delete using (auth.uid() = author_id);

drop policy if exists "Views story dapat dilihat pembuat story" on story_views;
create policy "Views story dapat dilihat pembuat story" on story_views
  for select using (
    auth.uid() = viewer_id or
    exists (select 1 from stories s where s.id = story_id and s.author_id = auth.uid())
  );

drop policy if exists "User dapat mencatat view story sendiri" on story_views;
create policy "User dapat mencatat view story sendiri" on story_views
  for insert with check (auth.uid() = viewer_id);

-- Storage bucket untuk media story (gambar & video)
insert into storage.buckets (id, name, public, file_size_limit)
values ('stories', 'stories', true, 83886080)
on conflict (id) do update set file_size_limit = 83886080;

drop policy if exists "Media story dapat dilihat semua orang" on storage.objects;
create policy "Media story dapat dilihat semua orang" on storage.objects
  for select using (bucket_id = 'stories');

drop policy if exists "User dapat upload media story sendiri" on storage.objects;
create policy "User dapat upload media story sendiri" on storage.objects
  for insert with check (bucket_id = 'stories' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "User dapat hapus media story sendiri" on storage.objects;
create policy "User dapat hapus media story sendiri" on storage.objects
  for delete using (bucket_id = 'stories' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage bucket untuk voice note di DM/grup. TIDAK public (beda dari
-- bucket lain) karena isinya rekaman suara pribadi — hanya anggota
-- percakapan yang sama boleh membacanya.
-- Path file: {sender_id}/{conversation_id}/{timestamp}.webm — folder kedua
-- dipakai RLS select untuk memverifikasi keanggotaan percakapan lewat
-- conversation_participants (policy select & insert-nya didefinisikan di
-- bagian GRUP CHAT di atas, supaya ikut mencakup percakapan grup).
insert into storage.buckets (id, name, public, file_size_limit)
values ('voice-notes', 'voice-notes', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "User dapat hapus voice note sendiri" on storage.objects;
create policy "User dapat hapus voice note sendiri" on storage.objects
  for delete using (bucket_id = 'voice-notes' and auth.uid()::text = (storage.foldername(name))[1]);

-- Tambah 1 ke view_count story secara atomik + catat siapa yang melihat.
create or replace function public.record_story_view(target_story_id uuid)
returns void as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into story_views (story_id, viewer_id)
  values (target_story_id, auth.uid())
  on conflict (story_id, viewer_id) do nothing;

  if found then
    update stories set view_count = view_count + 1 where id = target_story_id;
  end if;
end;
$$ language plpgsql security definer;

-- Hapus story yang sudah lewat 24 jam. Jalankan lewat pg_cron kalau tersedia:
--   select cron.schedule('cleanup-expired-stories', '0 * * * *',
--     $$ delete from stories where expires_at < now() $$);
create or replace function public.cleanup_expired_stories()
returns void as $$
begin
  delete from stories where expires_at < now();
end;
$$ language plpgsql security definer;

-- ============================================================
-- PEMBERSIHAN DATA: percakapan DM "yatim" akibat bug RLS lama
-- ============================================================
-- Sebelum perbaikan RLS conversation_participants di atas, percobaan
-- memulai DM baru bisa membuat baris `conversations` tapi gagal mengisi
-- baris `conversation_participants` (ditolak RLS), sehingga user melihat
-- "Gagal memulai percakapan." berulang kali padahal barisnya sudah
-- terlanjur ada di database (unique index conversations_dm_pair_idx
-- lalu memblokir percobaan berikutnya). Blok ini aman dijalankan
-- berulang: melengkapi baris participants yang hilang untuk semua DM
-- yang user_a/user_b-nya sudah terisi tapi belum tercatat sebagai
-- participant.
insert into conversation_participants (conversation_id, user_id)
select c.id, c.user_a from conversations c
where c.user_a is not null
  and not exists (select 1 from conversation_participants cp where cp.conversation_id = c.id and cp.user_id = c.user_a)
union
select c.id, c.user_b from conversations c
where c.user_b is not null
  and not exists (select 1 from conversation_participants cp where cp.conversation_id = c.id and cp.user_id = c.user_b)
on conflict do nothing;
