import { SearchXIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

/** Shown wherever a list can legitimately come back with nothing in it. */
export function EmptyState({
  icon: Icon = SearchXIcon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-panel border border-dashed border-line-strong bg-surface px-6 py-14 text-center sm:py-20",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-subtle">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="mt-5 font-display text-lg font-semibold sm:text-xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-2.5 max-w-md text-[0.9375rem] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-7">{action}</div> : null}
    </div>
  );
}
