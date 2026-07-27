"use client";

import { SessionProvider as AuthProvider } from "next-auth/react";

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthProvider refetchInterval={0}>{children}</AuthProvider>;
}
