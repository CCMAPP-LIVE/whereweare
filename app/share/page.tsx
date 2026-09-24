import ShareToQuickAdd from "@/components/ShareToQuickAdd";

export const dynamic = "force-dynamic";

/**
 * Web Share Target (see app/manifest.ts): sharing text to the installed app
 * lands here. Hand it to the quick-add panel and go to the calendar.
 */
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const text = [pick("title"), pick("text"), pick("url")].filter(Boolean).join("\n").slice(0, 5000);
  return <ShareToQuickAdd text={text} />;
}
