import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { getAllTabs, getArchivedTabs } from "@/lib/content";
import { getRefreshState } from "@/lib/refresh-state";
import { getConfig } from "@/lib/config.mjs";
import path from "node:path";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: getConfig().title,
    description: "A local Markdown workspace with inline editing.",
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tabs = getAllTabs();
  const archive = getArchivedTabs();
  const refresh = getRefreshState();
  const { root, title, sidebarLabel, contentDir } = getConfig();
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen">
          <Sidebar
            tabs={tabs}
            archive={archive}
            refresh={refresh}
            title={title}
            label={sidebarLabel}
            contentDirectory={path.relative(root, contentDir)}
          />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
