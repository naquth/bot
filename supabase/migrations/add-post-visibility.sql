-- Fitur Privasi Postingan
-- Aman dijalankan berulang kali (idempotent).
--
-- Menambahkan tiga level visibilitas post:
--   'public'    — semua orang bisa lihat (perilaku default/lama)
--   'followers' — hanya orang yang MENGIKUTI penulis yang bisa lihat
--   'private'   — hanya penulis sendiri yang bisa lihat
--
-- PENTING — kenapa ini harus ditegakkan lewat RLS, bukan cuma filter di
-- query aplikasi: RLS sebelumnya untuk posts adalah "for select using
-- (true)" alias bisa dibaca SIAPA SAJA lewat REST API langsung, terlepas
-- dari filter apa pun yang dilakukan di kode aplikasi. Kalau privasi cuma
-- ditegakkan di lib/queries/posts.ts, siapa pun yang tahu anon key project
-- (publik, ada di kode client manapun) tetap bisa membaca post "privat"
-- langsung lewat Supabase REST API tanpa lewat aplikasi sama sekali. RLS
-- adalah satu-satunya lapisan yang benar-benar tidak bisa dilewati.

alter table posts add column if not exists visibility text not null default 'public';

do $$
begin
  alter table posts add constraint posts_visibility_check
    check (visibility in ('public', 'followers', 'private'));
exception
  when duplicate_object then null;
end $$;

-- Draft juga perlu menyimpan pilihan visibilitas yang sedang disusun user,
-- supaya kalau draft dilanjutkan nanti, pilihannya tidak balik ke default.
alter table post_drafts add column if not exists visibility text not null default 'public';

do $$
begin
  alter table post_drafts add constraint post_drafts_visibility_check
    check (visibility in ('public', 'followers', 'private'));
exception
  when duplicate_object then null;
end $$;

create index if not exists posts_visibility_idx on posts(visibility);

-- Fungsi security definer untuk cek apakah p_viewer_id boleh melihat post
-- milik p_author_id dengan visibilitas p_visibility. security definer
-- dipakai (bukan subquery langsung di policy) mengikuti pola yang sama
-- seperti is_conversation_participant — supaya evaluasi relasi follows
-- tidak ikut kena RLS follows itu sendiri saat dipanggil dari dalam policy
-- posts, dan supaya logikanya reusable & gampang diuji satu tempat.
create or replace function can_view_post(p_author_id uuid, p_visibility text, p_viewer_id uuid)
returns boolean as $$
  select case
    -- Penulis selalu bisa melihat postingannya sendiri, apa pun visibilitasnya.
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

-- Balasan (reply, ditandai lewat parent_id) WAJIB ikut tunduk pada
-- visibilitas SEMUA post di rantai induknya (induk, induk-dari-induk,
-- dst), bukan cuma visibilitasnya sendiri. Tanpa ini, seseorang bisa
-- membalas post privat orang lain (kalau reply-nya sendiri diset
-- 'public') dan balasannya jadi jendela untuk mengintip percakapan yang
-- seharusnya privat. Pakai CTE iteratif dengan batas 50 level supaya
-- rantai reply yang sangat panjang tidak memicu query tak terkendali.
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
  select coalesce(
    bool_and(can_view_post(author_id, visibility, p_viewer_id)),
    true -- tidak ada baris sama sekali (post sudah dihapus) — jangan blokir
  )
  from ancestor_chain;
$$ language sql security definer stable set search_path = public;

drop policy if exists "Post dapat dilihat semua orang" on posts;
create policy "Post dapat dilihat sesuai visibilitas" on posts
  for select using (
    can_view_post(author_id, visibility, auth.uid())
    and (parent_id is null or can_view_post_thread(parent_id, auth.uid()))
  );
