import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { isWebAuthEnabled } from "@/lib/web-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Coding Agent",
  description: "Developer console for approved issue-to-PR automation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell authEnabled={isWebAuthEnabled()}>{children}</AppShell>
      </body>
    </html>
  );
}
