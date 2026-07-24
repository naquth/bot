import Link from "next/link";

const URL_PATTERN = /^https?:\/\/[^\s]+$/;
const MENTION_PATTERN = /^@([a-zA-Z0-9_]{3,20})$/;
const HASHTAG_PATTERN = /^#([a-zA-Z0-9_]{1,50})$/;

export function PostText({ content }: { content: string }) {
  if (!content.trim()) return null;

  const parts = content.split(/(\s+)/).reduce<string[]>((acc, chunk) => {
    if (acc.length === 0) return [chunk];
    acc.push(chunk);
    return acc;
  }, []);

  return (
    <p className="mt-1 whitespace-pre-wrap break-words text-[15.5px] leading-[1.5] tracking-[-0.006em] text-white">
      {parts.map((part, i) => {
        if (URL_PATTERN.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={(e) => e.stopPropagation()}
              className="text-white underline decoration-[var(--color-text-faint)] underline-offset-2 active:decoration-white"
            >
              {part}
            </a>
          );
        }

        const mentionMatch = part.match(MENTION_PATTERN);
        if (mentionMatch) {
          return (
            <Link
              key={i}
              href={`/profil/${mentionMatch[1]}`}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-white underline decoration-[var(--color-text-faint)] underline-offset-2 active:decoration-white"
            >
              {part}
            </Link>
          );
        }

        const hashtagMatch = part.match(HASHTAG_PATTERN);
        if (hashtagMatch) {
          return (
            <Link
              key={i}
              href={`/tag/${hashtagMatch[1].toLowerCase()}`}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-white underline decoration-[var(--color-text-faint)] underline-offset-2 active:decoration-white"
            >
              {part}
            </Link>
          );
        }

        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
