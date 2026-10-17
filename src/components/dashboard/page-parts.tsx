import type { ReactNode } from "react";
import {
  Card,
  EmptyState,
  Section as KitSection,
  Stat as KitStat,
  StatGrid as KitStatGrid,
  List,
  ListItem,
  PageHeader,
  type Tone,
} from "@/components/app/kit";

/**
 * The member dashboard's original vocabulary, kept as thin aliases over the
 * app kit (`components/app/kit`) so older pages and the new ones look the
 * same. New code imports from the kit directly.
 */

export { TurnFlag } from "@/components/app/kit";

export function PageHead({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <PageHeader title={title} description={description} actions={actions} />
  );
}

export function Section(props: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <KitSection {...props} />;
}

/** A card. One raised plane above the page, never two nested. */
export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <Card padded={padded} className={className}>
      {children}
    </Card>
  );
}

export function Stat(props: {
  label: string;
  value: string | number;
  note?: string;
  tone?: Tone;
  href?: string;
}) {
  return <KitStat {...props} />;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <KitStatGrid>{children}</KitStatGrid>;
}

export function Rows({ children }: { children: ReactNode }) {
  return <List>{children}</List>;
}

export function Row({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ListItem padded={false} className={className}>
      {children}
    </ListItem>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return <EmptyState title={title} body={body} action={action} />;
}
