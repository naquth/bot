"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { Check, AlertCircle } from "lucide-react";

type Toast = { id: number; message: string; variant: "success" | "error" };

const ToastContext = createContext<{ showToast: (message: string, variant?: "success" | "error") => void } | null>(
  null
);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, variant: "success" | "error" = "success") => {
    const id = idRef.current++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-24 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-slide-up pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-[#151517] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
          >
            {t.variant === "success" ? (
              <Check size={16} className="text-white" />
            ) : (
              <AlertCircle size={16} className="text-[var(--color-like)]" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
