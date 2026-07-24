"use client";

import { useState, useEffect, useRef } from "react";
import { PostCard } from "@/components/post-card";
import { ReplyComposer } from "@/components/reply-composer";
import { AiThreadSummary } from "@/components/ai-thread-summary";
import { getPostById } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import type { Post } from "@/lib/types";

export function ThreadView({
  initialPost,
  initialReplies,
  currentUserId,
  myProfile,
}: {
  initialPost: Post;
  initialReplies: Post[];
  currentUserId?: string;
  myProfile?: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}) {
  const [post, setPost] = useState(initialPost);
  const [replies, setReplies] = useState(initialReplies);
  const knownReplyIds = useRef(new Set(initialReplies.map((r) => r.id)));

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`thread:${post.id}`)
      // Balasan baru masuk otomatis
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts", filter: `parent_id=eq.${post.id}` },
        async (payload) => {
          const newReply = payload.new as { id: string; author_id: string };
          if (knownReplyIds.current.has(newReply.id)) return;
          if (newReply.author_id === currentUserId) return; // sudah muncul lewat composer sendiri
          knownReplyIds.current.add(newReply.id);
          const fetched = await getPostById(newReply.id);
          if (fetched) {
            setReplies((prev) => [...prev, fetched]);
            setPost((p) => ({ ...p, reply_count: p.reply_count + 1 }));
          }
        }
      )
      // Balasan dihapus
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts", filter: `parent_id=eq.${post.id}` },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setReplies((prev) => prev.filter((r) => r.id !== deletedId));
          setPost((p) => ({ ...p, reply_count: Math.max(0, p.reply_count - 1) }));
        }
      )
      // Like baru/batal di post utama, sync ulang jumlahnya
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "likes", filter: `post_id=eq.${post.id}` },
        async () => {
          const fresh = await getPostById(post.id);
          if (fresh) setPost((p) => ({ ...fresh, liked_by_me: p.liked_by_me }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [post.id, currentUserId]);

  function handleReplyDeleted(id: string) {
    setReplies((prev) => prev.filter((r) => r.id !== id));
    setPost((p) => ({ ...p, reply_count: Math.max(0, p.reply_count - 1) }));
  }

  async function handleReplied(newPostId: string) {
    knownReplyIds.current.add(newPostId);
    const fetched = await getPostById(newPostId);
    if (fetched) {
      setReplies((prev) => [...prev, fetched]);
      setPost((p) => ({ ...p, reply_count: p.reply_count + 1 }));
    }
  }

  return (
    <>
      <PostCard post={post} currentUserId={currentUserId} clickable={false} />

      {currentUserId && myProfile && (
        <ReplyComposer
          parentId={post.id}
          authorId={myProfile.id}
          authorUsername={myProfile.username}
          authorDisplayName={myProfile.display_name}
          authorAvatarUrl={myProfile.avatar_url}
          onReplied={handleReplied}
        />
      )}

      {replies.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="text-[14.5px] text-[var(--color-text-dim)]">Belum ada balasan.</p>
        </div>
      ) : (
        <>
          <AiThreadSummary postId={post.id} />
          {replies.map((reply) => (
            <PostCard key={reply.id} post={reply} currentUserId={currentUserId} onDeleted={handleReplyDeleted} />
          ))}
        </>
      )}
    </>
  );
}
