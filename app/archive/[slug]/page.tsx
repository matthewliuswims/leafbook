import { notFound } from "next/navigation";
import { getRequestedNote } from "@/lib/content";
import { TabContent } from "@/components/tab-content";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const tab = await getRequestedNote(true);
  if (!tab) notFound();

  return (
    <TabContent
      slug={tab.slug}
      title={tab.title}
      todo={tab.todo}
      initialBody={tab.body}
      copyButtons={tab.copyButtons}
      isArchive
    />
  );
}
