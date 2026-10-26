import {
  ActivityIcon,
  ArrowLeftRightIcon,
  AtSignIcon,
  AwardIcon,
  BadgeCheckIcon,
  BanIcon,
  BanknoteArrowDownIcon,
  BanknoteArrowUpIcon,
  BanknoteIcon,
  BellIcon,
  CalendarClockIcon,
  CalendarIcon,
  CameraIcon,
  CheckCheckIcon,
  CheckCircle2Icon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDollarSignIcon,
  CircleXIcon,
  ClapperboardIcon,
  ClockIcon,
  CoinsIcon,
  CompassIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileCheck2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FingerprintIcon,
  FlagIcon,
  FlameIcon,
  GavelIcon,
  GemIcon,
  GlobeIcon,
  HandCoinsIcon,
  HandshakeIcon,
  HeartIcon,
  HistoryIcon,
  HourglassIcon,
  ImageIcon,
  ImagePlusIcon,
  InboxIcon,
  InfoIcon,
  KeyIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  LinkIcon,
  LockIcon,
  MailCheckIcon,
  MailIcon,
  MailOpenIcon,
  MailWarningIcon,
  MapPinIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
  NotebookPenIcon,
  OctagonAlertIcon,
  PhoneIcon,
  PiggyBankIcon,
  ReceiptIcon,
  ReceiptTextIcon,
  ScaleIcon,
  SearchCheckIcon,
  SendIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShoppingBagIcon,
  SmartphoneIcon,
  StarIcon,
  StoreIcon,
  TagIcon,
  TimerIcon,
  TrashIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  UserRoundCheckIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
  WorkflowIcon,
  ZapIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Every icon that means something has a colour, and the same icon has the
 * same colour wherever it appears: money is green on the wallet, on a deal
 * and in the sidebar alike. The owner found every icon the same grey, which
 * made them something to read rather than something to spot.
 *
 * Controls — arrows, chevrons, close, search, copy, menu — are left out on
 * purpose and stay grey: colour is for what a thing is, not for buttons.
 */
export type Hue =
  | "sky"
  | "cyan"
  | "blue"
  | "indigo"
  | "violet"
  | "pink"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal";

/** The icon in its colour, on a light page or a dark one (`dark` reaches the always-dark sidebar too). */
export const HUE_TEXT: Record<Hue, string> = {
  sky: "text-sky-600 dark:text-sky-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  blue: "text-blue-600 dark:text-blue-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  violet: "text-violet-600 dark:text-violet-400",
  pink: "text-pink-600 dark:text-pink-400",
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-600 dark:text-orange-400",
  amber: "text-amber-600 dark:text-amber-400",
  yellow: "text-yellow-600 dark:text-yellow-400",
  lime: "text-lime-600 dark:text-lime-400",
  green: "text-green-600 dark:text-green-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  teal: "text-teal-600 dark:text-teal-400",
};

/** A tile behind the icon: a wash of its colour, a hairline of it, the icon on top. */
export const HUE_TILE: Record<Hue, string> = {
  sky: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  blue: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  indigo:
    "border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  violet:
    "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  pink: "border-pink-500/20 bg-pink-500/10 text-pink-600 dark:text-pink-400",
  red: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
  orange:
    "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  amber:
    "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  yellow:
    "border-yellow-500/25 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  lime: "border-lime-500/25 bg-lime-500/10 text-lime-600 dark:text-lime-400",
  green:
    "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400",
  emerald:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  teal: "border-teal-500/20 bg-teal-500/10 text-teal-600 dark:text-teal-400",
};

/** What each colour stands for, so a new icon joins the family that fits it. */
const FAMILIES: Record<Hue, Icon[]> = {
  // Overview, growth, explanations.
  sky: [
    LayoutDashboardIcon,
    TrendingUpIcon,
    ActivityIcon,
    CompassIcon,
    InfoIcon,
  ],
  // Places and links: where a thing lives.
  cyan: [
    GlobeIcon,
    MapPinIcon,
    LinkIcon,
    WorkflowIcon,
    DatabaseIcon,
    SearchCheckIcon,
  ],
  // Talking: chat, mail, phones.
  blue: [
    MessageSquareIcon,
    MessagesSquareIcon,
    MailIcon,
    MailOpenIcon,
    MailCheckIcon,
    AtSignIcon,
    SendIcon,
    InboxIcon,
    PhoneIcon,
    SmartphoneIcon,
  ],
  // Paperwork and the staff side.
  indigo: [
    ShieldIcon,
    ScaleIcon,
    FileTextIcon,
    FileCheck2Icon,
    FileSpreadsheetIcon,
    NotebookPenIcon,
  ],
  // Offers and what a listing is tagged with.
  violet: [HandshakeIcon, TagIcon, GemIcon],
  // People and pictures.
  pink: [
    UsersIcon,
    UserRoundIcon,
    UserPlusIcon,
    UserRoundCheckIcon,
    HeartIcon,
    CameraIcon,
    ImageIcon,
    ImagePlusIcon,
    ClapperboardIcon,
  ],
  // Something has gone wrong, or is about to be undone.
  red: [
    GavelIcon,
    BanIcon,
    ShieldAlertIcon,
    OctagonAlertIcon,
    TrashIcon,
    CircleXIcon,
    FlagIcon,
  ],
  // Look at this: alerts and warnings.
  orange: [
    BellIcon,
    MegaphoneIcon,
    TriangleAlertIcon,
    CircleAlertIcon,
    MailWarningIcon,
    FlameIcon,
  ],
  // Deals and time: the handover, the waits, the fast lane.
  amber: [
    ArrowLeftRightIcon,
    ClockIcon,
    TimerIcon,
    HourglassIcon,
    CalendarIcon,
    CalendarClockIcon,
    HistoryIcon,
    ZapIcon,
  ],
  // Points and standing.
  yellow: [StarIcon, AwardIcon],
  // Help.
  lime: [LifeBuoyIcon],
  // Money.
  green: [
    WalletIcon,
    CoinsIcon,
    CircleDollarSignIcon,
    BanknoteIcon,
    BanknoteArrowDownIcon,
    BanknoteArrowUpIcon,
    HandCoinsIcon,
    PiggyBankIcon,
    ReceiptIcon,
    ReceiptTextIcon,
    CreditCardIcon,
    LandmarkIcon,
  ],
  // Listings, and things that are done or verified.
  emerald: [
    StoreIcon,
    ShoppingBagIcon,
    BadgeCheckIcon,
    CheckIcon,
    CheckCircle2Icon,
    CircleCheckIcon,
    CheckCheckIcon,
  ],
  // Safety: locks, keys, security settings.
  teal: [
    ShieldCheckIcon,
    LockIcon,
    KeyIcon,
    KeyRoundIcon,
    FingerprintIcon,
    SettingsIcon,
  ],
};

const BY_ICON = new Map<Icon, Hue>(
  (Object.entries(FAMILIES) as [Hue, Icon[]][]).flatMap(([hue, icons]) =>
    icons.map((icon) => [icon, hue] as const),
  ),
);

/** The colour an icon stands for, or null for a control that stays grey. */
export function hueOf(icon: Icon): Hue | null {
  return BY_ICON.get(icon) ?? null;
}

/** Classes for the icon on its own: its colour, or `fallback` for a control. */
export function iconText(icon: Icon, fallback = "text-subtle"): string {
  const hue = hueOf(icon);
  return hue ? HUE_TEXT[hue] : fallback;
}

/** Classes for a bordered tile holding the icon: tinted, or `fallback` for a control. */
export function iconTile(
  icon: Icon,
  fallback = "border-line bg-surface-2 text-muted",
): string {
  const hue = hueOf(icon);
  return hue ? HUE_TILE[hue] : fallback;
}
