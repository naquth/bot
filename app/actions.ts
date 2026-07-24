"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MAX_POST_LEN, MAX_BIO_LEN, MAX_DISPLAY_NAME_LEN } from "@/lib/constants";
import type { Profile, PostVisibility } from "@/lib/types";

const MAX_LEN = MAX_POST_LEN;
const VALID_VISIBILITIES: PostVisibility[] = ["public", "followers", "private"];

type CreatePostOptions = {
  parentId?: string;
  image?: { url: string; width: number; height: number };
  video?: { url: string; width: number; height: number; durationSec: number; thumbnailUrl: string };
  quotePostId?: string;
  poll?: { options: string[]; durationHours: number };
  visibility?: PostVisibility;
};

export async function createPost(content: string, options: CreatePostOptions = {}) {
  const { parentId, image, video, quotePostId, poll, visibility = "public" } = options;
  const trimmed = content.trim();
  if (!trimmed && !image && !video && !quotePostId && !poll) {
    return { ok: false, error: "Tulis sesuatu atau lampirkan media." };
  }
  if (trimmed.length > MAX_LEN) return { ok: false, error: "Konten tidak valid." };
  if (image && video) return { ok: false, error: "Tidak bisa lampirkan gambar dan video sekaligus." };
  if (!VALID_VISIBILITIES.includes(visibility)) {
    return { ok: false, error: "Pengaturan privasi tidak valid." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Kamu belum masuk." };

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      content: trimmed,
      parent_id: parentId ?? null,
      image_url: image?.url ?? null,
      image_width: image?.width ?? null,
      image_height: image?.height ?? null,
      video_url: video?.url ?? null,
      video_width: video?.width ?? null,
      video_height: video?.height ?? null,
      video_duration_sec: video?.durationSec ?? null,
      video_thumbnail_url: video?.thumbnailUrl ?? null,
      quote_post_id: quotePostId ?? null,
      visibility,
    })
    .select("id")
    .single();

  if (error) {
    if (error.message?.includes("RATE_LIMIT_EXCEEDED")) {
      return { ok: false, error: "Kamu menulis terlalu cepat. Tunggu sebentar ya." };
    }
    return { ok: false, error: "Gagal mengirim. Coba lagi." };
  }

  const postId = data.id as string;

  if (poll) {
    const trimmedOptions = poll.options.map((o) => o.trim()).filter(Boolean);
    if (trimmedOptions.length >= 2) {
      const closesAt = new Date(Date.now() + poll.durationHours * 60 * 60 * 1000).toISOString();
      const { data: pollRow, error: pollError } = await supabase
        .from("polls")
        .insert({ post_id: postId, closes_at: closesAt })
        .select("id")
        .single();

      if (!pollError) {
        await supabase.from("poll_options").insert(
          trimmedOptions.map((label, i) => ({ poll_id: pollRow.id, label, position: i }))
        );
      }
    }
  }

  revalidatePath("/");
  if (parentId) revalidatePath(`/utas/${parentId}`);
  return { ok: true, id: postId };
}

export async function updatePost(postId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > MAX_LEN) return { ok: false as const, error: "Konten tidak valid." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase
    .from("posts")
    .update({ content: trimmed, edited_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("author_id", user.id);

  if (error) return { ok: false as const, error: "Gagal menyimpan perubahan." };

  revalidatePath("/");
  revalidatePath(`/utas/${postId}`);
  return { ok: true as const };
}

export async function updatePostVisibility(postId: string, visibility: PostVisibility) {
  if (!VALID_VISIBILITIES.includes(visibility)) {
    return { ok: false as const, error: "Pengaturan privasi tidak valid." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase
    .from("posts")
    .update({ visibility })
    .eq("id", postId)
    .eq("author_id", user.id);

  if (error) return { ok: false as const, error: "Gagal mengubah privasi post." };

  revalidatePath("/");
  revalidatePath(`/utas/${postId}`);
  return { ok: true as const };
}

export async function deletePost(postId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", user.id);

  if (error) return false;
  revalidatePath("/");
  return true;
}

export async function toggleLike(postId: string, like: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  if (like) {
    const { error } = await supabase
      .from("likes")
      .insert({ post_id: postId, user_id: user.id });
    if (error) return false;
  } else {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
    if (error) return false;
  }

  revalidatePath("/");
  return true;
}

export async function toggleFollow(targetUserId: string, follow: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === targetUserId) return false;

  if (follow) {
    // send_follow_request menangani baik akun publik (langsung follow)
    // maupun akun privat (buat permintaan ikuti yang menunggu approval).
    const { error } = await supabase.rpc("send_follow_request", { target_user_id: targetUserId });
    if (error) return false;
  } else {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", targetUserId);
    if (error) return false;
  }

  revalidatePath(`/profil/[username]`, "page");
  return true;
}

// Kirim/kembalikan status follow untuk akun privat. Dipakai FollowButton
// supaya tahu harus menampilkan "Ikuti", "Diminta", atau "Mengikuti".
export async function sendFollowRequest(targetUserId: string): Promise<"following" | "requested" | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === targetUserId) return null;

  const { data, error } = await supabase.rpc("send_follow_request", { target_user_id: targetUserId });
  if (error) return null;
  revalidatePath(`/profil/[username]`, "page");
  return data as "following" | "requested";
}

export async function cancelFollowRequest(targetUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.rpc("cancel_follow_request", { target_user_id: targetUserId });
  if (error) return false;
  revalidatePath(`/profil/[username]`, "page");
  return true;
}

export async function respondFollowRequest(requesterUserId: string, accept: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.rpc("respond_follow_request", {
    requester_user_id: requesterUserId,
    accept,
  });
  if (error) return false;
  revalidatePath("/aktivitas/permintaan-ikuti");
  revalidatePath("/aktivitas");
  return true;
}

export async function togglePrivateAccount(isPrivate: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("profiles").update({ is_private: isPrivate }).eq("id", user.id);
  if (error) return false;
  revalidatePath("/pengaturan-profil");
  revalidatePath(`/profil/[username]`, "page");
  return true;
}

export async function updateProfile(input: { display_name: string; bio: string; avatar_url?: string | null }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const displayName = input.display_name.trim().slice(0, MAX_DISPLAY_NAME_LEN);
  const bio = input.bio.trim().slice(0, MAX_BIO_LEN);
  if (!displayName) return false;

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, bio, avatar_url: input.avatar_url })
    .eq("id", user.id);

  if (error) return false;
  revalidatePath("/");
  revalidatePath("/pengaturan-profil");
  return true;
}

export async function markNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  await supabase.from("notifications").update({ read: true }).eq("recipient_id", user.id).eq("read", false);
  revalidatePath("/aktivitas");
  return true;
}

export async function loadMorePosts(cursor: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { getFeedPostsBefore } = await import("@/lib/queries/posts");
  return getFeedPostsBefore(supabase, user?.id, cursor, 20);
}

export async function getVideoFeedBeforeAction(cursor: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { getVideoFeedBefore } = await import("@/lib/queries/posts");
  return getVideoFeedBefore(supabase, user?.id, cursor, 10);
}

export async function getPostById(postId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { getPost } = await import("@/lib/queries/posts");
  return getPost(supabase, postId, user?.id);
}

export async function searchPostsAction(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { searchPosts } = await import("@/lib/queries/posts");
  return searchPosts(supabase, trimmed, user?.id);
}

export async function toggleBookmark(postId: string, bookmark: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  if (bookmark) {
    const { error } = await supabase.from("bookmarks").insert({ post_id: postId, user_id: user.id });
    if (error) return false;
  } else {
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
    if (error) return false;
  }

  revalidatePath("/tersimpan");
  return true;
}

export async function getOrCreateConversation(otherUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };
  if (user.id === otherUserId) return { ok: false as const, error: "Tidak bisa memulai percakapan dengan diri sendiri." };

  // Cari DM (bukan grup) yang sudah ada antara kedua user lewat conversation_participants,
  // supaya juga menemukan DM lama (masih pakai user_a/user_b) maupun DM baru.
  const { data: myConvs, error: myConvsError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (myConvsError) {
    console.error("getOrCreateConversation lookup myConvs error:", myConvsError.message, myConvsError.details, myConvsError.hint);
    return { ok: false as const, error: `Gagal memulai percakapan [lookup-1: ${myConvsError.code ?? "?"} ${myConvsError.message}]` };
  }

  const myConvIds = (myConvs ?? []).map((c) => c.conversation_id as string);

  if (myConvIds.length > 0) {
    const { data: shared, error: sharedError } = await supabase
      .from("conversation_participants")
      .select("conversation_id, conversations!inner(id, is_group)")
      .eq("user_id", otherUserId)
      .in("conversation_id", myConvIds);

    if (sharedError) {
      console.error("getOrCreateConversation lookup shared error:", sharedError.message, sharedError.details, sharedError.hint);
      return { ok: false as const, error: `Gagal memulai percakapan [lookup-2: ${sharedError.code ?? "?"} ${sharedError.message}]` };
    }

    const existingDm = (shared ?? []).find((row) => {
      const conv = row.conversations as unknown as { is_group: boolean };
      return !conv.is_group;
    });
    if (existingDm) return { ok: true as const, id: existingDm.conversation_id as string };
  }

  const userA = user.id < otherUserId ? user.id : otherUserId;
  const userB = user.id < otherUserId ? otherUserId : user.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user_a: userA, user_b: userB, created_by: user.id, is_group: false })
    .select("id")
    .single();

  if (error) {
    // Kode 23505 = unique_violation. Ini terjadi kalau baris `conversations` untuk
    // pasangan ini sudah ada (constraint conversations_dm_pair_idx) tapi baris
    // conversation_participants-nya belum lengkap/gagal dibuat di percobaan sebelumnya
    // (baris "yatim"). Alih-alih gagal total, cari baris itu dan lengkapi participants-nya.
    if (error.code === "23505") {
      const { data: orphan, error: orphanError } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_a", userA)
        .eq("user_b", userB)
        .eq("is_group", false)
        .maybeSingle();

      if (orphanError) {
        console.error("getOrCreateConversation find orphan error:", orphanError.message, orphanError.details, orphanError.hint);
        return { ok: false as const, error: `Gagal memulai percakapan [orphan-find: ${orphanError.code ?? "?"} ${orphanError.message}]` };
      }

      if (orphan) {
        const { error: repairError } = await supabase
          .from("conversation_participants")
          .upsert(
            [
              { conversation_id: orphan.id, user_id: userA },
              { conversation_id: orphan.id, user_id: userB },
            ],
            { onConflict: "conversation_id,user_id" }
          );
        if (repairError) {
          console.error("getOrCreateConversation repair participants error:", repairError.message, repairError.details, repairError.hint);
          return { ok: false as const, error: `Gagal memulai percakapan [repair: ${repairError.code ?? "?"} ${repairError.message}]` };
        }
        return { ok: true as const, id: orphan.id as string };
      }

      return { ok: false as const, error: "Gagal memulai percakapan [orphan-not-found: baris duplikat terdeteksi tapi tidak ditemukan]" };
    }
    console.error("getOrCreateConversation insert conversations error:", error.message, error.details, error.hint);
    return { ok: false as const, error: `Gagal memulai percakapan [insert-conv: ${error.code ?? "?"} ${error.message}]` };
  }

  const { error: partError } = await supabase.from("conversation_participants").insert([
    { conversation_id: created.id, user_id: userA },
    { conversation_id: created.id, user_id: userB },
  ]);
  if (partError) {
    console.error("getOrCreateConversation insert participants error:", partError.message, partError.details, partError.hint);
    return { ok: false as const, error: `Gagal memulai percakapan [insert-part: ${partError.code ?? "?"} ${partError.message}]` };
  }

  return { ok: true as const, id: created.id as string };
}

const MAX_GROUP_MEMBERS = 100;
const MAX_GROUP_NAME_LEN = 50;

export async function createGroupConversation(name: string, memberIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false as const, error: "Nama grup tidak boleh kosong." };
  if (trimmedName.length > MAX_GROUP_NAME_LEN) return { ok: false as const, error: "Nama grup terlalu panjang." };

  const uniqueMembers = [...new Set(memberIds.filter((id) => id !== user.id))];
  if (uniqueMembers.length < 2) return { ok: false as const, error: "Pilih minimal 2 anggota lain untuk membuat grup." };
  if (uniqueMembers.length + 1 > MAX_GROUP_MEMBERS) {
    return { ok: false as const, error: `Grup maksimal ${MAX_GROUP_MEMBERS} anggota.` };
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ is_group: true, name: trimmedName, created_by: user.id })
    .select("id")
    .single();

  if (error) {
    console.error("createGroupConversation insert conversations error:", error.message, error.details, error.hint);
    return { ok: false as const, error: "Gagal membuat grup." };
  }

  const participantRows = [
    { conversation_id: created.id, user_id: user.id, is_admin: true },
    ...uniqueMembers.map((id) => ({ conversation_id: created.id, user_id: id, is_admin: false })),
  ];

  const { error: partError } = await supabase.from("conversation_participants").insert(participantRows);
  if (partError) {
    console.error("createGroupConversation insert participants error:", partError.message, partError.details, partError.hint);
    return { ok: false as const, error: "Gagal menambahkan anggota grup." };
  }

  revalidatePath("/pesan");
  return { ok: true as const, id: created.id as string };
}

export async function renameGroup(conversationId: string, name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Nama grup tidak boleh kosong." };
  if (trimmed.length > MAX_GROUP_NAME_LEN) return { ok: false as const, error: "Nama grup terlalu panjang." };

  const { error } = await supabase.from("conversations").update({ name: trimmed }).eq("id", conversationId).eq("is_group", true);
  if (error) return { ok: false as const, error: "Gagal mengganti nama grup. Pastikan kamu admin grup ini." };

  revalidatePath(`/pesan/${conversationId}`);
  revalidatePath("/pesan");
  return { ok: true as const };
}

export async function updateGroupAvatar(conversationId: string, avatarUrl: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase.from("conversations").update({ avatar_url: avatarUrl }).eq("id", conversationId).eq("is_group", true);
  if (error) return { ok: false as const, error: "Gagal mengganti foto grup." };

  revalidatePath(`/pesan/${conversationId}`);
  revalidatePath("/pesan");
  return { ok: true as const };
}

export async function addGroupParticipants(conversationId: string, memberIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const uniqueMembers = [...new Set(memberIds)];
  if (uniqueMembers.length === 0) return { ok: false as const, error: "Pilih minimal 1 orang." };

  const { count } = await supabase
    .from("conversation_participants")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if ((count ?? 0) + uniqueMembers.length > MAX_GROUP_MEMBERS) {
    return { ok: false as const, error: `Grup maksimal ${MAX_GROUP_MEMBERS} anggota.` };
  }

  const { error } = await supabase
    .from("conversation_participants")
    .insert(uniqueMembers.map((id) => ({ conversation_id: conversationId, user_id: id, is_admin: false })));

  if (error) return { ok: false as const, error: "Gagal menambahkan anggota. Pastikan kamu admin grup ini." };

  revalidatePath(`/pesan/${conversationId}`);
  return { ok: true as const };
}

export async function removeGroupParticipant(conversationId: string, memberId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", memberId);

  if (error) return { ok: false as const, error: "Gagal mengeluarkan anggota." };

  revalidatePath(`/pesan/${conversationId}`);
  return { ok: true as const };
}

export async function leaveGroup(conversationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  if (error) return { ok: false as const, error: "Gagal keluar dari grup." };

  revalidatePath("/pesan");
  return { ok: true as const };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  image?: { url: string; width: number; height: number },
  audio?: { url: string; durationSec: number }
) {
  const trimmed = content.trim();
  if (!trimmed && !image && !audio) return { ok: false as const, error: "Tulis pesan atau lampirkan sesuatu." };
  if (trimmed.length > 1000) return { ok: false as const, error: "Pesan tidak valid." };
  if (image && audio) return { ok: false as const, error: "Tidak bisa lampirkan gambar dan voice note sekaligus." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: trimmed,
    image_url: image?.url ?? null,
    image_width: image?.width ?? null,
    image_height: image?.height ?? null,
    audio_url: audio?.url ?? null,
    audio_duration_sec: audio?.durationSec ?? null,
  });

  if (error) {
    // Sebelumnya error di sini SELALU diganti jadi pesan generik "Gagal
    // mengirim pesan." tanpa detail apa pun — baik untuk user maupun log
    // server, sehingga penyebab asli (mis. RLS menolak karena user bukan
    // participant, FK conversation_id tidak valid, dsb) tidak pernah
    // terlihat sama sekali. Log lengkap ke server + detail kode ke user,
    // konsisten dengan pola yang sudah dipakai getOrCreateConversation.
    console.error("sendMessage insert error:", error.code, error.message, error.details, error.hint);
    return { ok: false as const, error: `Gagal mengirim pesan [${error.code ?? "?"}: ${error.message}]` };
  }

  revalidatePath(`/pesan/${conversationId}`);
  revalidatePath("/pesan");
  return { ok: true as const };
}

/**
 * Voice note disimpan di bucket privat (bukan public), jadi butuh signed URL
 * untuk diputar. Dipanggil dari client tiap kali bubble voice note dirender
 * di ChatThread. RLS storage tetap jadi lapis pertahanan utama — signed URL
 * di sini cuma exchange token setelah RLS mengizinkan select pada objek.
 */
export async function getVoiceNoteUrl(audioPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.storage.from("voice-notes").createSignedUrl(audioPath, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function markMessagesRead(conversationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  await supabase
    .from("messages")
    .update({ read: true })
    .eq("conversation_id", conversationId)
    .eq("read", false)
    .neq("sender_id", user.id);

  revalidatePath("/pesan");
  return true;
}

export async function deleteMessage(messageId: string, conversationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("messages").delete().eq("id", messageId).eq("sender_id", user.id);
  if (error) return false;

  revalidatePath(`/pesan/${conversationId}`);
  revalidatePath("/pesan");
  return true;
}

export async function getUnreadMessageCountAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { getUnreadMessageCount } = await import("@/lib/queries/posts");
  return getUnreadMessageCount(supabase, user.id);
}

// Dipakai UnreadProvider untuk mengambil jumlah notifikasi belum dibaca
// setelah mount di client, bukan lagi di RootLayout. Ini mencegah query
// notifikasi memblokir/menunda render setiap segmen halaman (lihat juga
// getUnreadMessageCountAction di atas).
export async function getUnreadNotificationCountAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { getUnreadCount } = await import("@/lib/queries/posts");
  return getUnreadCount(supabase, user.id);
}

// Dipakai provider panggilan global untuk tahu percakapan mana saja yang
// harus didengarkan sinyal telepon masuknya. Hanya mengembalikan DM 1-ke-1
// (bukan grup) karena grup call belum didukung.
export async function getMyCallableConversationIds(): Promise<
  { ok: true; ids: string[] } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Belum masuk" };

  const { data, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id, conversations!inner(is_group)")
    .eq("user_id", user.id)
    .eq("conversations.is_group", false);

  if (error) {
    console.error("[call] gagal mengambil daftar conversation:", error);
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: true, ids: [] };
  return { ok: true, ids: data.map((row) => row.conversation_id as string) };
}

export type ReportReason = "spam" | "harassment" | "hate_speech" | "violence" | "nudity" | "misinformation" | "other";

export async function reportPost(postId: string, reason: ReportReason, detail: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_post_id: postId,
    reason,
    detail: detail.trim().slice(0, 500),
  });

  if (error) return { ok: false as const, error: "Gagal mengirim laporan." };
  return { ok: true as const };
}

export async function reportUser(userId: string, reason: ReportReason, detail: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };
  if (user.id === userId) return { ok: false as const, error: "Tidak bisa melaporkan diri sendiri." };

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_user_id: userId,
    reason,
    detail: detail.trim().slice(0, 500),
  });

  if (error) return { ok: false as const, error: "Gagal mengirim laporan." };
  return { ok: true as const };
}

export async function toggleBlock(targetUserId: string, block: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  if (user.id === targetUserId) return false;

  if (block) {
    const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: targetUserId });
    if (error) return false;
  } else {
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", targetUserId);
    if (error) return false;
  }

  revalidatePath("/");
  revalidatePath(`/profil`);
  return true;
}

export async function getBlockedUserIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id);
  return (data ?? []).map((b) => b.blocked_id as string);
}

export async function incrementPostView(postId: string) {
  const supabase = await createClient();
  await supabase.rpc("increment_post_view", { target_post_id: postId });
}

export async function toggleMute(targetUserId: string, mute: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  if (user.id === targetUserId) return false;

  if (mute) {
    const { error } = await supabase.from("mutes").insert({ muter_id: user.id, muted_id: targetUserId });
    if (error) return false;
  } else {
    const { error } = await supabase.from("mutes").delete().eq("muter_id", user.id).eq("muted_id", targetUserId);
    if (error) return false;
  }

  revalidatePath("/");
  return true;
}

export async function getMutedUserIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase.from("mutes").select("muted_id").eq("muter_id", user.id);
  return (data ?? []).map((m) => m.muted_id as string);
}

export async function exportUserData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  // Kumpulkan semua data milik user dari tabel-tabel yang RLS-nya sudah
  // membatasi ke baris milik user ini sendiri — setiap query di sini aman
  // dipanggil dengan anon/authenticated key karena tunduk pada RLS yang sama
  // seperti dipakai di seluruh aplikasi (bukan bypass apapun).
  const [profile, posts, likes, bookmarks, follows, following, notifications, ownReports] = await Promise.all([
    supabase.from("profiles").select("username, display_name, bio, avatar_url, created_at").eq("id", user.id).single(),
    supabase.from("posts").select("id, content, image_url, created_at, edited_at").eq("author_id", user.id),
    supabase.from("likes").select("post_id, created_at").eq("user_id", user.id),
    supabase.from("bookmarks").select("post_id, created_at").eq("user_id", user.id),
    supabase.from("follows").select("following_id, created_at").eq("follower_id", user.id),
    supabase.from("follows").select("follower_id, created_at").eq("following_id", user.id),
    supabase.from("notifications").select("type, created_at").eq("recipient_id", user.id),
    supabase.from("reports").select("reason, detail, status, created_at").eq("reporter_id", user.id),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    profile: profile.data ?? null,
    posts: posts.data ?? [],
    likes: likes.data ?? [],
    bookmarks: bookmarks.data ?? [],
    following: follows.data ?? [],
    followers: following.data ?? [],
    notifications: notifications.data ?? [],
    reports_submitted: ownReports.data ?? [],
  };

  return { ok: true as const, data: exportData };
}

export async function deleteOwnAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { ok: false as const, error: "Gagal menghapus akun. Coba lagi atau hubungi dukungan." };

  await supabase.auth.signOut();
  return { ok: true as const };
}

export async function votePoll(pollId: string, optionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase
    .from("poll_votes")
    .insert({ poll_id: pollId, option_id: optionId, voter_id: user.id });

  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Kamu sudah memilih di poll ini." };
    return { ok: false as const, error: "Gagal mengirim suara." };
  }

  return { ok: true as const };
}

export async function togglePinPost(postId: string, pin: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  if (pin) {
    // Lepas pin dari post lain milik user ini dulu (satu akun cuma boleh 1 pin,
    // ditegakkan juga lewat partial unique index di database sebagai jaring pengaman).
    await supabase.from("posts").update({ pinned_at: null }).eq("author_id", user.id).not("pinned_at", "is", null);
  }

  const { error } = await supabase
    .from("posts")
    .update({ pinned_at: pin ? new Date().toISOString() : null })
    .eq("id", postId)
    .eq("author_id", user.id);

  if (error) return { ok: false as const, error: "Gagal mengubah status pin." };

  revalidatePath("/profil");
  return { ok: true as const };
}

export type ReportRow = {
  id: string;
  reason: string;
  detail: string;
  status: "pending" | "reviewed" | "dismissed";
  created_at: string;
  reporter: { username: string; display_name: string } | null;
  reported_post: { id: string; content: string; author: { username: string } } | null;
  reported_user: { id: string; username: string; display_name: string } | null;
};

export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  return data?.is_admin === true;
}

export async function getReports(status: "pending" | "reviewed" | "dismissed" = "pending"): Promise<ReportRow[]> {
  const supabase = await createClient();

  // RLS "Admin dapat lihat semua laporan" akan menolak baris kalau user bukan
  // admin, jadi hasilnya otomatis kosong untuk non-admin — tapi tetap cek
  // eksplisit di sisi aplikasi supaya halaman admin tidak coba render apapun.
  if (!(await isCurrentUserAdmin())) return [];

  const { data, error } = await supabase
    .from("reports")
    .select(
      `id, reason, detail, status, created_at,
       reporter:profiles!reports_reporter_id_fkey(username, display_name),
       reported_post:posts!reports_reported_post_id_fkey(id, content, author:profiles!posts_author_id_fkey(username)),
       reported_user:profiles!reports_reported_user_id_fkey(id, username, display_name)`
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[getReports] gagal mengambil laporan:", error.message, error.details, error.hint);
    return [];
  }

  return (data ?? []) as unknown as ReportRow[];
}

export async function updateReportStatus(reportId: string, status: "reviewed" | "dismissed") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_report_status", { report_id: reportId, new_status: status });
  if (error) return { ok: false as const, error: "Gagal memperbarui status laporan." };
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function adminDeletePost(postId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_post", { target_post_id: postId });
  if (error) return { ok: false as const, error: "Gagal menghapus utas." };
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const };
}

export async function adminSetVerified(targetUserId: string, verified: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_verified", { target_user_id: targetUserId, new_status: verified });
  if (error) return false;

  revalidatePath("/profil");
  return true;
}

// ============================================================
// STORIES
// ============================================================

type CreateStoryOptions = {
  image?: { url: string; width: number; height: number };
  video?: { url: string; width: number; height: number; durationSec: number };
  caption?: string;
  bgColor?: string;
};

export async function createStory(options: CreateStoryOptions) {
  const { image, video, caption, bgColor } = options;
  if (!image && !video) return { ok: false as const, error: "Lampirkan foto atau video dulu ya." };
  if (image && video) return { ok: false as const, error: "Tidak bisa lampirkan gambar dan video sekaligus." };

  const trimmedCaption = (caption ?? "").trim().slice(0, 200);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase.from("stories").insert({
    author_id: user.id,
    image_url: image?.url ?? null,
    image_width: image?.width ?? null,
    image_height: image?.height ?? null,
    video_url: video?.url ?? null,
    video_width: video?.width ?? null,
    video_height: video?.height ?? null,
    video_duration_sec: video?.durationSec ?? null,
    caption: trimmedCaption,
    bg_color: bgColor ?? "#000000",
  });

  if (error) {
    console.error("[createStory] gagal membuat story:", error.message);
    return { ok: false as const, error: "Gagal mengunggah story. Coba lagi." };
  }

  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteStory(storyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase.from("stories").delete().eq("id", storyId).eq("author_id", user.id);
  if (error) return { ok: false as const, error: "Gagal menghapus story." };

  revalidatePath("/");
  return { ok: true as const };
}

export async function recordStoryView(storyId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_story_view", { target_story_id: storyId });
  if (error) console.error("[recordStoryView] gagal mencatat view:", error.message);
  return { ok: !error };
}

export async function getStoryViewers(storyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: story } = await supabase.from("stories").select("author_id").eq("id", storyId).maybeSingle();
  if (!story || story.author_id !== user.id) return [];

  const { data, error } = await supabase
    .from("story_views")
    .select("created_at, viewer:profiles!story_views_viewer_id_fkey(id, username, display_name, avatar_url, is_verified)")
    .eq("story_id", storyId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as unknown as { created_at: string; viewer: Profile }[];
}

// ============================================================
// DRAFT POSTINGAN
// ============================================================

const MAX_DRAFTS_PER_USER = 25;

type SaveDraftOptions = {
  draftId?: string;
  image?: { url: string; width: number; height: number };
  video?: { url: string; width: number; height: number; durationSec: number; thumbnailUrl: string };
  poll?: { options: string[]; durationHours: number };
  parentId?: string;
  quotePostId?: string;
  visibility?: PostVisibility;
};

export async function saveDraft(content: string, options: SaveDraftOptions = {}) {
  const { draftId, image, video, poll, parentId, quotePostId, visibility = "public" } = options;
  const trimmed = content.trim();

  if (!trimmed && !image && !video && !poll) {
    return { ok: false as const, error: "Draft kosong tidak disimpan." };
  }
  if (trimmed.length > MAX_LEN) return { ok: false as const, error: "Konten terlalu panjang." };
  if (image && video) return { ok: false as const, error: "Tidak bisa lampirkan gambar dan video sekaligus." };
  if (!VALID_VISIBILITIES.includes(visibility)) {
    return { ok: false as const, error: "Pengaturan privasi tidak valid." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const row = {
    author_id: user.id,
    content: trimmed,
    image_url: image?.url ?? null,
    image_width: image?.width ?? null,
    image_height: image?.height ?? null,
    video_url: video?.url ?? null,
    video_width: video?.width ?? null,
    video_height: video?.height ?? null,
    video_duration_sec: video?.durationSec ?? null,
    video_thumbnail_url: video?.thumbnailUrl ?? null,
    poll_options: poll ? poll.options : null,
    poll_duration_hours: poll ? poll.durationHours : null,
    visibility,
    parent_id: parentId ?? null,
    quote_post_id: quotePostId ?? null,
  };

  if (draftId) {
    const { data, error } = await supabase
      .from("post_drafts")
      .update(row)
      .eq("id", draftId)
      .eq("author_id", user.id)
      .select("id, updated_at")
      .single();

    if (error || !data) return { ok: false as const, error: "Gagal menyimpan draft." };
    revalidatePath("/tulis/draft");
    return { ok: true as const, draftId: data.id as string, updatedAt: data.updated_at as string };
  }

  const { count } = await supabase
    .from("post_drafts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id);

  if ((count ?? 0) >= MAX_DRAFTS_PER_USER) {
    return { ok: false as const, error: `Maksimal ${MAX_DRAFTS_PER_USER} draft. Hapus draft lama dulu.` };
  }

  const { data, error } = await supabase
    .from("post_drafts")
    .insert(row)
    .select("id, updated_at")
    .single();

  if (error || !data) return { ok: false as const, error: "Gagal menyimpan draft." };
  revalidatePath("/tulis/draft");
  return { ok: true as const, draftId: data.id as string, updatedAt: data.updated_at as string };
}

export async function deleteDraft(draftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Kamu belum masuk." };

  const { error } = await supabase
    .from("post_drafts")
    .delete()
    .eq("id", draftId)
    .eq("author_id", user.id);

  if (error) return { ok: false as const, error: "Gagal menghapus draft." };
  revalidatePath("/tulis/draft");
  return { ok: true as const };
}

export async function publishDraft(
  draftId: string,
  content: string,
  options: CreatePostOptions = {}
) {
  const result = await createPost(content, options);
  if (!result.ok) return result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("post_drafts").delete().eq("id", draftId).eq("author_id", user.id);
  }
  revalidatePath("/tulis/draft");
  return result;
}
