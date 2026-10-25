import { ImageResponse } from "next/og";
import {
  CERTIFICATE_SIZE,
  CertificateArt,
  certificateText,
} from "@/components/deals/certificate-art";
import { pngToPdf } from "@/lib/png-to-pdf";
import { siteUrl } from "@/lib/site-url";
import { canDownloadCertificate, certificateFor } from "@/server/certificate";
import { getCurrentUser } from "@/server/session";

/** A4 landscape, in points. */
const A4 = { widthPt: 842, heightPt: 595 };

/**
 * A completed deal's certificate, for its buyer or seller: a PDF by default,
 * or the picture itself with `?format=png`, which a phone keeps in its
 * gallery and sends on in a chat.
 *
 * Anybody else gets a 404, the same as a deal that does not exist.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/dashboard/deals/[id]/certificate">,
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.banned || !(await canDownloadCertificate(user, id))) {
    return new Response("Not found", { status: 404 });
  }
  const certificate = await certificateFor(id);
  if (!certificate) return new Response("Not found", { status: 404 });

  const checkAt = `${siteUrl().replace(/^https?:\/\//, "")}/certificate/${certificate.code}`;
  const image = new ImageResponse(
    <CertificateArt certificate={certificate} checkAt={checkAt} />,
    CERTIFICATE_SIZE,
  );

  const name = `channel-adda-certificate-${certificate.reference}`;
  const headers = { "Cache-Control": "private, no-store" };

  if (new URL(request.url).searchParams.get("format") === "png") {
    return new Response(await image.arrayBuffer(), {
      headers: {
        ...headers,
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${name}.png"`,
      },
    });
  }

  const pdf = pngToPdf(
    new Uint8Array(await image.arrayBuffer()),
    A4,
    `Channel Adda certificate ${certificate.reference}`,
    certificateText(certificate, checkAt),
  );
  return new Response(pdf, {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.pdf"`,
    },
  });
}
