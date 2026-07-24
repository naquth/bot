-- Fitur Draft Postingan
-- Aman dijalankan berulang kali (idempotent).
--
-- PENTING: draft TIDAK disimpan di tabel `posts` karena policy select
-- pada `posts` bersifat "for select using (true)" alias bisa dibaca
-- semua orang. Draft harus privat milik penulisnya sendiri, jadi kita
-- pakai tabel terpisah dengan RLS yang hanya mengizinkan pemiliknya.

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
  parent_id uuid references posts(id) on delete set null,
  quote_post_id uuid references posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_no_image_and_video check (not (image_url is not null and video_url is not null))
);

create index if not exists post_drafts_author_updated_idx
  on post_drafts (author_id, updated_at desc);

-- Batasi jumlah draft per user supaya tabel tidak membengkak tak terbatas.
-- Ditegakkan di application layer (server action), bukan di DB, supaya
-- pesan error bisa ramah untuk pengguna.

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

-- Trigger updated_at otomatis
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
