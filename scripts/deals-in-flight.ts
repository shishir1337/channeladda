/**
 * Lists every running deal whose steps are not the current template's.
 *
 * A deal's steps are written when it opens, so a deal opened before a
 * template changed keeps the old steps while the code reads the new ones by
 * position, and the two disagree about who does what — so the code refuses
 * every step on such a deal, and staff can only end it from a dispute. Run
 * this on the server after pulling and before restarting:
 *
 *   pnpm deals:in-flight
 *
 * It reads and prints only; it changes nothing. It selects only columns
 * that existed before the change, so it runs before the migrations do.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";
import { usesCurrentSteps } from "@/lib/deal-templates";

async function main() {
  const running = await db.order.findMany({
    where: { status: { notIn: [...TERMINAL_STATUSES] } },
    orderBy: { createdAt: "asc" },
    select: {
      reference: true,
      mode: true,
      status: true,
      createdAt: true,
      steps: {
        orderBy: { position: "asc" },
        select: { label: true, completedAt: true },
      },
    },
  });

  const old = running.filter(
    (order) =>
      !usesCurrentSteps(
        order.mode,
        order.steps.map((step) => step.label),
      ),
  );

  console.log(
    `${running.length} running deal${running.length === 1 ? "" : "s"}, ${old.length} on the old steps.`,
  );
  for (const order of old) {
    const done = order.steps.filter((step) => step.completedAt).length;
    console.log(
      `  ${order.reference}  ${order.mode.padEnd(7)}  ${order.status.padEnd(22)}  ${done}/${order.steps.length} steps  opened ${order.createdAt.toISOString().slice(0, 10)}`,
    );
  }
  if (old.length > 0) {
    console.log(
      "\nAfter the restart nobody can press a step on these: staff can only end them from a dispute. Finish them before restarting if you can, or tell the developer.",
    );
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
