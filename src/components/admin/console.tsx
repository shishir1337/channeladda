import { SearchXIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  Card,
  EmptyState,
  AllClear as KitAllClear,
  Facts as KitFacts,
  List,
  ListItem,
  PageHeader,
  Section,
  Stat,
  StatGrid,
  TableCard,
  type Tone,
} from "@/components/app/kit";
import { cn } from "@/lib/utils";

/**
 * The staff console's original vocabulary, kept as thin aliases over the app
 * kit (`components/app/kit`) so every desk and every member page share one
 * look. Staff still get what a member never sees — ageing chips, queue counts,
 * severity — through the same parts. New code imports from the kit directly.
 */

export type { Tone } from "@/components/app/kit";
export {
  Amount,
  Fact,
  FilterBar,
  FilterLink,
  MetaItem,
  Reference,
  Td,
  Th,
} from "@/components/app/kit";

export function ConsoleHeader({
  title,
  description,
  actions,
  meta,
}: {
  /** No longer drawn: the top bar already says which desk this is. */
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      description={description}
      actions={actions}
      meta={meta}
    />
  );
}

export function MetricGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <StatGrid className={className}>{children}</StatGrid>;
}

export function Metric(props: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  chip?: ReactNode;
  tone?: Tone;
  href?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return <Stat {...props} />;
}

export function ConsoleSection({
  className,
  ...props
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  count?: number;
  tone?: Tone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <Section className={cn("first:mt-8", className)} {...props} />;
}

export function Panel({
  children,
  tone = "neutral",
  padded = true,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  padded?: boolean;
  className?: string;
}) {
  return (
    <Card tone={tone} padded={padded} className={className}>
      {children}
    </Card>
  );
}

export function Rows({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <List className={className}>{children}</List>;
}

export function RowItem({
  children,
  flag,
  className,
}: {
  children: ReactNode;
  flag?: Tone;
  className?: string;
}) {
  return (
    <ListItem padded={false} flag={flag} className={className}>
      {children}
    </ListItem>
  );
}

/** The identifying line of a row: title, then the tags that qualify it. */
export function RowHead({
  title,
  reference,
  tags,
  right,
}: {
  title: ReactNode;
  reference?: string;
  tags?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium text-fg">
          {title}
        </p>
        {tags ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {tags}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {reference ? (
          <span className="font-mono text-[0.6875rem] text-subtle">
            {reference}
          </span>
        ) : null}
        {right}
      </div>
    </div>
  );
}

export function TableScroller({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <TableCard className={className}>{children}</TableCard>;
}

export function AllClear({
  title,
  body,
}: {
  title: string;
  body: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return <KitAllClear title={title} body={body} />;
}

/** Nothing to show, and that is neither good nor bad — a filter came back dry. */
export function Nothing({
  title,
  body,
  action,
  icon = SearchXIcon,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return <EmptyState icon={icon} title={title} body={body} action={action} />;
}

export function Facts({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <KitFacts columns={columns} className={className}>
      {children}
    </KitFacts>
  );
}
