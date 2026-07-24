"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "@/app/actions";
import { useUnread } from "@/components/unread-provider";

export function MarkReadOnMount() {
  const { resetNotifications } = useUnread();

  useEffect(() => {
    const timeout = setTimeout(() => {
      markNotificationsRead();
      resetNotifications();
    }, 1200);
    return () => clearTimeout(timeout);
  }, [resetNotifications]);

  return null;
}
