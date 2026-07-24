"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { StoryComposer } from "@/components/story-composer";
import { StoryViewer } from "@/components/story-viewer";
import type { StoryGroup, Profile } from "@/lib/types";

export function StoryTray({
  groups,
  currentUser,
}: {
  groups: StoryGroup[];
  currentUser: Profile | null;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerGroupIndex, setViewerGroupIndex] = useState<number | null>(null);

  if (!currentUser) return null;

  const myGroup = groups.find((g) => g.author.id === currentUser.id);
  const otherGroups = groups.filter((g) => g.author.id !== currentUser.id);

  return (
    <div className="border-b border-[var(--color-border)] px-3 py-3">
      <div className="flex gap-4 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Story milik sendiri / tombol tambah */}
        <button
          onClick={() => (myGroup ? setViewerGroupIndex(groups.indexOf(myGroup)) : setComposerOpen(true))}
          className="flex shrink-0 flex-col items-center gap-1.5"
        >
          <div className="relative">
            <div
              className={
                myGroup
                  ? myGroup.allViewed
                    ? "rounded-full bg-[var(--color-border-strong)] p-[2px]"
                    : "rounded-full bg-gradient-to-tr from-[#F5384F] via-[#FF7A45] to-[#FFC44D] p-[2px]"
                  : ""
              }
            >
              <div className={myGroup ? "rounded-full bg-black p-[2px]" : ""}>
                <Avatar
                  username={currentUser.username}
                  displayName={currentUser.display_name}
                  avatarUrl={currentUser.avatar_url}
                  size="md"
                />
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setComposerOpen(true);
              }}
              aria-label="Tambah story"
              className="absolute -bottom-0.5 -right-0.5 flex h-[19px] w-[19px] items-center justify-center rounded-full bg-white ring-2 ring-black transition-transform active:scale-90"
            >
              <Plus size={12} strokeWidth={3} className="text-black" />
            </button>
          </div>
          <span className="max-w-[64px] truncate text-[11.5px] font-medium text-[var(--color-text-dim)]">
            Story kamu
          </span>
        </button>

        {otherGroups.map((group) => (
          <button
            key={group.author.id}
            onClick={() => setViewerGroupIndex(groups.indexOf(group))}
            className="flex shrink-0 flex-col items-center gap-1.5"
          >
            <div
              className={
                group.allViewed
                  ? "rounded-full bg-[var(--color-border-strong)] p-[2px]"
                  : "rounded-full bg-gradient-to-tr from-[#F5384F] via-[#FF7A45] to-[#FFC44D] p-[2px]"
              }
            >
              <div className="rounded-full bg-black p-[2px]">
                <Avatar
                  username={group.author.username}
                  displayName={group.author.display_name}
                  avatarUrl={group.author.avatar_url}
                  size="md"
                />
              </div>
            </div>
            <span className="max-w-[64px] truncate text-[11.5px] font-medium text-[var(--color-text-dim)]">
              {group.author.username}
            </span>
          </button>
        ))}
      </div>

      {composerOpen && <StoryComposer userId={currentUser.id} onClose={() => setComposerOpen(false)} />}

      {viewerGroupIndex !== null && (
        <StoryViewer
          groups={groups}
          initialGroupIndex={viewerGroupIndex}
          currentUserId={currentUser.id}
          onClose={() => setViewerGroupIndex(null)}
        />
      )}
    </div>
  );
}
