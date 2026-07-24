-- ============================================================
-- PERBAIKAN CEPAT: "Gagal memulai percakapan" pada fitur DM/grup
-- ============================================================
-- Jalankan file ini di Supabase SQL Editor (Project → SQL Editor → New
-- query → paste seluruh isi file ini → Run). Aman dijalankan berkali-kali
-- (idempotent). Ini adalah bagian penting dari supabase/schema.sql yang
-- dipisah ke file ini supaya bisa langsung dijalankan tanpa perlu scroll
-- seluruh schema.
--
-- v2: memperbaiki bug "infinite recursion detected in policy for relation
-- conversation_participants" (kode error Postgres 42P17) yang muncul di
-- v1 — policy pada tabel conversation_participants tidak boleh melakukan
-- subquery ke tabel itu sendiri secara langsung, karena Postgres akan
-- mengevaluasi ulang policy yang sama untuk baris yang diakses subquery
-- tersebut, berulang tanpa henti. Perbaikannya: pakai fungsi security
-- definer (is_conversation_participant / is_conversation_admin) yang
-- query tabel ini TANPA melalui RLS pemanggil.
--
-- Kalau kamu SUDAH pernah menjalankan seluruh isi supabase/schema.sql
-- versi terbaru, file ini tidak akan mengubah apa-apa (semua idempotent) —
-- tetap aman untuk dijalankan ulang sebagai verifikasi.

-- 1) Pastikan kolom & tabel pendukung grup sudah ada
alter table conversations add column if not exists is_group boolean not null default false;
alter table conversations add column if not exists name text;
alter table conversations add column if not exists avatar_url text;
alter table conversations add column if not exists created_by uuid references profiles(id) on delete set null;

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

create unique index if not exists conversations_dm_pair_idx on conversations(least(user_a, user_b), greatest(user_a, user_b)) where not is_group and user_a is not null and user_b is not null;

alter table conversation_participants enable row level security;

-- 2) Fungsi security definer (memutus rekursi RLS)
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

-- 3) RLS conversation_participants (pakai fungsi, tanpa subquery langsung)
drop policy if exists "User hanya lihat partisipan percakapannya" on conversation_participants;
create policy "User hanya lihat partisipan percakapannya" on conversation_participants
  for select using (
    is_conversation_participant(conversation_participants.conversation_id, auth.uid())
  );

drop policy if exists "User dapat menambahkan partisipan ke grup miliknya" on conversation_participants;
create policy "User dapat menambahkan partisipan ke grup miliknya" on conversation_participants
  for insert with check (
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

-- 4) RLS conversations
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

-- 5) RLS messages
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

-- 6) RLS voice-notes & group-avatars storage
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

-- 7) Migrasi data lama + pembersihan baris "yatim" (aman diulang)
insert into conversation_participants (conversation_id, user_id)
select id, user_a from conversations where user_a is not null
union
select id, user_b from conversations where user_b is not null
on conflict do nothing;

insert into conversation_participants (conversation_id, user_id)
select c.id, c.user_a from conversations c
where c.user_a is not null
  and not exists (select 1 from conversation_participants cp where cp.conversation_id = c.id and cp.user_id = c.user_a)
union
select c.id, c.user_b from conversations c
where c.user_b is not null
  and not exists (select 1 from conversation_participants cp where cp.conversation_id = c.id and cp.user_id = c.user_b)
on conflict do nothing;

-- Selesai. Setelah ini, coba lagi kirim pesan ke akun yang sebelumnya
-- gagal. Kalau masih gagal, pesan error di layar (toast merah) akan
-- menampilkan detail kode error Postgres — kirimkan screenshot toast
-- tersebut untuk diagnosis lebih lanjut.
