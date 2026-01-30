"use client";

import { useEffect, useState } from "react";

export function ErudaProvider({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Hanya load Eruda di environment development agar tidak muncul di production
    if (process.env.NODE_ENV === "development") {
      import("eruda").then((eruda) => eruda.default.init());
    }
  }, []);

  if (!isMounted) return null;

  return <>{children}</>;
}