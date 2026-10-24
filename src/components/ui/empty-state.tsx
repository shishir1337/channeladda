import { SearchXIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { iconTile } from "@/components/ui/icon-hue";
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
        "flex flex-col items-center rounded-panel border border-dashed border-line-strong bg-surface px-6 py-14 text-center sm:py-20 app:border-solid app:border-line app:py-12 app:shadow-xs app:sm:py-12",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-2xl border app:size-10 app:rounded-lg",
          iconTile(
            Icon,
            "border-transparent bg-surface-2 text-subtle app:border-line app:bg-surface app:text-muted app:shadow-xs",
          ),
        )}
      >
        <Icon aria-hidden="true" className="size-6 app:size-[1.15rem]" />
      </span>
      <h2 className="mt-5 font-display text-lg font-semibold sm:text-xl app:mt-4 app:text-sm app:sm:text-sm">
        {title}
      </h2>
      {description ? (
        <p className="mt-2.5 max-w-md text-[0.9375rem] leading-relaxed text-muted app:mt-1 app:max-w-[46ch] app:text-[0.8125rem]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-7 app:mt-5">{action}</div> : null}
    </div>
  );
}
