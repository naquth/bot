-- Perbaikan: constraint "messages_content_check" yang ada di database saat
-- ini kemungkinan besar dibuat SEBELUM fitur gambar/voice note ada, jadi
-- mewajibkan content non-kosong (mis. `char_length(content) between 1 and
-- 1000`). schema.sql memakai `create table if not exists`, yang TIDAK
-- pernah mengubah constraint pada tabel yang sudah ada, jadi definisi lama
-- itu tetap aktif walau schema.sql sendiri sudah menuliskan versi yang
-- lebih longgar (`check (char_length(content) <= 1000)`).
--
-- Akibatnya: kirim voice note atau gambar TANPA teks (content = '') selalu
-- gagal dengan error Postgres 23514 "violates check constraint
-- messages_content_check", karena content kosong tidak lolos constraint
-- lama. Migration ini drop constraint lama lalu buat ulang sesuai schema.sql
-- (mengizinkan content kosong, cuma membatasi panjang maksimum).
--
-- Aman dijalankan berulang kali (idempotent).

alter table messages drop constraint if exists messages_content_check;
alter table messages add constraint messages_content_check check (char_length(content) <= 1000);
