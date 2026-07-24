import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type PageHeaderProps = {
  title: string;
  backHref?: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, backHref, action }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-[56px] items-center border-b border-[var(--color-border)] bg-black/85 px-2 backdrop-blur-xl backdrop-saturate-150">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Kembali"
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-[var(--color-surface-3)]"
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </Link>
      ) : (
        <div className="w-10" />
      )}
      <h1 className="flex-1 text-center font-display text-[16.5px] font-bold tracking-[-0.01em]">
        {title}
      </h1>
      <div className="flex min-w-10 items-center justify-end">{action}</div>
    </header>
  );
}
