import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings-form";
import { getAuditTrail } from "@/server/audit";
import { requireSuperadmin } from "@/server/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Platform settings",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  await requireSuperadmin();
  const settings = await getSettings();
  const trail = await getAuditTrail(
    { entity: "user", entityId: "platform-settings" },
    10,
  );

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Superadmin only
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg">
        Platform settings
      </h1>
      <p className="mt-2 text-muted">
        {settings.updatedAt && settings.updatedByName
          ? `Last changed by ${settings.updatedByName} on ${settings.updatedAt.toLocaleDateString("en-GB")}.`
          : "Never changed since launch."}
      </p>

      <div className="mt-8">
        <SettingsForm
          current={{
            buyerFeeBp: settings.buyerFeeBp,
            sellerFeeBp: settings.sellerFeeBp,
            escrowRequiredAbove: settings.escrowRequiredAbove,
            offerExpiryHours: settings.offerExpiryHours,
          }}
        />
      </div>

      {trail.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-lg font-bold text-fg">
            Change history
          </h2>
          <ul className="mt-3 grid gap-px overflow-hidden rounded-panel border border-line bg-line">
            {trail.map((row) => {
              const before = row.before as {
                buyerFeeBp?: number;
                sellerFeeBp?: number;
              } | null;
              const after = row.after as {
                buyerFeeBp?: number;
                sellerFeeBp?: number;
              } | null;
              return (
                <li key={row.id} className="bg-surface px-4 py-3 text-sm">
                  <span className="font-medium text-fg">
                    {row.actorName ?? "Someone"}
                  </span>{" "}
                  <span className="text-muted">changed the fees</span>
                  {before && after ? (
                    <span className="text-subtle tabular-nums">
                      {" "}
                      — buyer {(before.buyerFeeBp ?? 0) / 100}% →{" "}
                      {(after.buyerFeeBp ?? 0) / 100}%, seller{" "}
                      {(before.sellerFeeBp ?? 0) / 100}% →{" "}
                      {(after.sellerFeeBp ?? 0) / 100}%
                    </span>
                  ) : null}
                  <span className="block text-xs text-subtle">
                    {row.createdAt.toLocaleString("en-GB")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
