import { llmsText } from "@/lib/llms";
import { siteUrl } from "@/lib/site-url";

// Nothing in it changes between deploys: the pages it lists are fixed.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsText(siteUrl()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
