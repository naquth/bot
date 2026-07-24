-- Fitur Telepon & Video Call
-- Aman dijalankan berulang kali (idempotent).
--
-- Panggilan tidak butuh tabel baru: sinyal WebRTC (offer/answer/ICE
-- candidate/ring/hangup) dikirim lewat Supabase Realtime Broadcast pada
-- channel bertopik `calls:{conversation_id}`, sifatnya sekali lewat
-- (ephemeral) — tidak perlu disimpan di database.
--
-- PENTING: secara default, siapa saja yang tahu nama topik broadcast bisa
-- join channel-nya (realtime broadcast tidak otomatis tunduk RLS tabel
-- manapun). Supaya orang di luar percakapan tidak bisa menguping/ikut
-- campur sinyal panggilan, kita aktifkan Realtime Authorization: broadcast
-- di channel bertopik `calls:<uuid>` hanya diizinkan untuk user yang
-- memang menjadi partisipan percakapan tersebut.
--
-- CATATAN: table `realtime.messages` dimiliki oleh sistem Supabase Realtime
-- sendiri (bukan role `postgres` project ini), dan RLS-nya SUDAH otomatis
-- aktif secara default sejak awal — karena itu kita TIDAK boleh (dan tidak
-- perlu) menjalankan `alter table realtime.messages enable row level
-- security`. Mencoba menjalankannya akan gagal dengan error
-- "must be owner of table messages" (SQLSTATE 42501). Yang boleh dan perlu
-- kita lakukan hanyalah membuat policy baru di tabel tersebut lewat
-- CREATE POLICY di bawah ini.

drop policy if exists "Partisipan percakapan dapat memakai channel call" on realtime.messages;
create policy "Partisipan percakapan dapat memakai channel call" on realtime.messages
  for select using (
    realtime.topic() like 'calls:%'
    and is_conversation_participant(
      substring(realtime.topic() from 7)::uuid,
      auth.uid()
    )
  );

drop policy if exists "Partisipan percakapan dapat broadcast ke channel call" on realtime.messages;
create policy "Partisipan percakapan dapat broadcast ke channel call" on realtime.messages
  for insert with check (
    realtime.topic() like 'calls:%'
    and is_conversation_participant(
      substring(realtime.topic() from 7)::uuid,
      auth.uid()
    )
  );

-- LANGKAH MANUAL TAMBAHAN (tidak bisa lewat SQL): buka dashboard Supabase
-- → Project Settings → Realtime, lalu nonaktifkan "Allow public access".
-- Tanpa ini, channel tetap bisa diakses tanpa melalui policy di atas kalau
-- client join dengan config { private: false } — kode aplikasi (lihat
-- lib/webrtc/call-signaling.ts) sudah selalu set { private: true }, tapi
-- pengaturan dashboard ini tetap jadi lapisan pertahanan kedua yang
-- dianjurkan resmi oleh Supabase.
