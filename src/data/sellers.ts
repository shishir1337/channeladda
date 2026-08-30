import type { PlatformId } from "@/data/platforms";

export type Seller = {
  slug: string;
  name: string;
  initials: string;
  country: string;
  /** Out of 5, one decimal. */
  rating: number;
  reviews: number;
  sales: number;
  /** Median first-reply time in minutes. */
  responseMins: number;
  memberSince: string;
  /** Lifetime settled volume in USD, converted at render. */
  volume: number;
  specialties: PlatformId[];
};

/** Profile pictures live in /public/media/sellers. */
export const sellerAvatarSrc = (slug: string) => `/media/sellers/${slug}.svg`;

export const sellers: Seller[] = [
  {
    slug: "arman-karimov",
    name: "Arman Karimov",
    initials: "AK",
    country: "Kazakhstan",
    rating: 4.9,
    reviews: 137,
    sales: 137,
    responseMins: 6,
    memberSince: "2021",
    volume: 1900000,
    specialties: ["youtube", "website"],
  },
  {
    slug: "sofia-rivera",
    name: "Sofia Rivera",
    initials: "SR",
    country: "Spain",
    rating: 5,
    reviews: 89,
    sales: 89,
    responseMins: 11,
    memberSince: "2022",
    volume: 740000,
    specialties: ["instagram"],
  },
  {
    slug: "nadia-hassan",
    name: "Nadia Hassan",
    initials: "NH",
    country: "United Kingdom",
    rating: 4.9,
    reviews: 212,
    sales: 212,
    responseMins: 4,
    memberSince: "2020",
    volume: 2400000,
    specialties: ["youtube", "instagram", "facebook", "website"],
  },
  {
    slug: "priya-sharma",
    name: "Priya Sharma",
    initials: "PS",
    country: "India",
    rating: 5,
    reviews: 18,
    sales: 18,
    responseMins: 9,
    memberSince: "2023",
    volume: 620000,
    specialties: ["instagram", "telegram", "website"],
  },
  {
    slug: "hannah-wells",
    name: "Hannah Wells",
    initials: "HW",
    country: "United States",
    rating: 4.8,
    reviews: 31,
    sales: 31,
    responseMins: 14,
    memberSince: "2022",
    volume: 410000,
    specialties: ["youtube", "instagram", "facebook", "website"],
  },
  {
    slug: "dmitri-volkov",
    name: "Dmitri Volkov",
    initials: "DV",
    country: "Georgia",
    rating: 4.8,
    reviews: 54,
    sales: 54,
    responseMins: 8,
    memberSince: "2021",
    volume: 530000,
    specialties: ["youtube", "telegram"],
  },
  {
    slug: "rehan-malik",
    name: "Rehan Malik",
    initials: "RM",
    country: "Pakistan",
    rating: 4.7,
    reviews: 41,
    sales: 41,
    responseMins: 17,
    memberSince: "2022",
    volume: 295000,
    specialties: ["youtube", "instagram", "telegram"],
  },
  {
    slug: "carlo-diaz",
    name: "Carlo Diaz",
    initials: "CD",
    country: "Philippines",
    rating: 4.8,
    reviews: 96,
    sales: 96,
    responseMins: 12,
    memberSince: "2020",
    volume: 880000,
    specialties: ["youtube", "facebook", "telegram"],
  },
  {
    slug: "mateus-lima",
    name: "Mateus Lima",
    initials: "ML",
    country: "Brazil",
    rating: 4.9,
    reviews: 74,
    sales: 74,
    responseMins: 7,
    memberSince: "2021",
    volume: 1240000,
    specialties: ["youtube", "instagram", "facebook"],
  },
  {
    slug: "vikram-thakur",
    name: "Vikram Thakur",
    initials: "VT",
    country: "India",
    rating: 4.7,
    reviews: 130,
    sales: 130,
    responseMins: 21,
    memberSince: "2019",
    volume: 690000,
    specialties: ["youtube", "facebook", "telegram"],
  },
  {
    slug: "kacper-zielinski",
    name: "Kacper Zielinski",
    initials: "KZ",
    country: "Poland",
    rating: 4.8,
    reviews: 58,
    sales: 58,
    responseMins: 5,
    memberSince: "2022",
    volume: 470000,
    specialties: ["youtube"],
  },
  {
    slug: "lena-brandt",
    name: "Lena Brandt",
    initials: "LB",
    country: "Germany",
    rating: 4.9,
    reviews: 62,
    sales: 62,
    responseMins: 10,
    memberSince: "2021",
    volume: 385000,
    specialties: ["youtube", "instagram"],
  },
  {
    slug: "ishan-gupta",
    name: "Ishan Gupta",
    initials: "IG",
    country: "India",
    rating: 4.6,
    reviews: 27,
    sales: 27,
    responseMins: 26,
    memberSince: "2023",
    volume: 148000,
    specialties: ["facebook", "telegram"],
  },
  {
    slug: "erin-walsh",
    name: "Erin Walsh",
    initials: "EW",
    country: "Canada",
    rating: 4.8,
    reviews: 37,
    sales: 37,
    responseMins: 13,
    memberSince: "2022",
    volume: 226000,
    specialties: ["youtube", "instagram", "website"],
  },
];

export const sellerMap = Object.fromEntries(
  sellers.map((s) => [s.slug, s]),
) as Record<string, Seller>;

/** Highest settled volume first — used on the homepage and the directory. */
export const topSellers = [...sellers].sort((a, b) => b.volume - a.volume);
