/**
 * Staff control over accounts.
 *
 * The interesting cases are all the ones that must be refused. A role system
 * whose guards only exist in the page that draws the buttons is not a role
 * system, and the specific way this one could brick the platform — demoting
 * the last superadmin, leaving nobody able to set fees or appoint staff — is
 * checked here rather than discovered later.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import type { ListingDraft } from "@/lib/listing-form";
import * as adminListings from "@/server/admin-listings";
import * as admin from "@/server/admin-users";
import * as seller from "@/server/seller-listings";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

const tag = Math.floor(Math.random() * 1_000_000);

async function makeUser(role: "USER" | "MODERATOR" | "SUPERADMIN") {
  return db.user.create({
    data: {
      email: `verify-${role.toLowerCase()}-${tag}@channeladda.test`,
      name: `Verify ${role} ${tag}`,
      emailVerified: true,
      role,
    },
    select: { id: true, role: true },
  });
}

function draft(handle: string): ListingDraft {
  return {
    platform: "youtube",
    handle,
    title: "A listing belonging to somebody about to be suspended",
    niche: "Technology",
    country: "United States",
    audience: 40_000,
    monetized: false,
    monthlyRevenue: 0,
    engagement: 4,
    ageYears: 2,
    price: 1000,
    coverUrl: "/uploads/cover/c.png",
    avatarUrl: "/uploads/avatar/a.png",
    transferProfile: "",
    proofs: [
      {
        url: "/uploads/proof/p.png",
        label: "Analytics",
        sha256: "c".repeat(64),
      },
    ],
  };
}

async function main() {
  const madeUsers: string[] = [];
  const madeListings: string[] = [];

  const boss = await db.user.findFirst({
    where: { role: "SUPERADMIN" },
    select: { id: true },
  });
  check("a seeded superadmin to act as", boss !== null);
  if (!boss) process.exit(1);

  const member = await makeUser("USER");
  const moderator = await makeUser("MODERATOR");
  madeUsers.push(member.id, moderator.id);

  console.log("— changing what someone can reach —");
  const promoted = await admin.setUserRole({
    actorId: boss.id,
    userId: member.id,
    role: "MODERATOR",
  });
  check("a superadmin can promote a member", promoted.ok);

  const same = await admin.setUserRole({
    actorId: boss.id,
    userId: member.id,
    role: "MODERATOR",
  });
  check("setting the role it already has is refused", !same.ok);

  const self = await admin.setUserRole({
    actorId: boss.id,
    userId: boss.id,
    role: "USER",
  });
  check("nobody can change their own role", !self.ok);

  console.log("\n— the platform cannot be left without an owner —");
  const superadmins = await db.user.count({ where: { role: "SUPERADMIN" } });
  if (superadmins === 1) {
    const strand = await admin.setUserRole({
      actorId: member.id,
      userId: boss.id,
      role: "USER",
    });
    check(
      "the last superadmin cannot be demoted",
      !strand.ok && strand.reason === "last-superadmin",
      strand.ok ? "IT WENT THROUGH" : strand.reason,
    );
    if (strand.ok) {
      // The guard failed. Put it back before anything else runs.
      await db.user.update({
        where: { id: boss.id },
        data: { role: "SUPERADMIN" },
      });
    }
  } else {
    const second = await makeUser("SUPERADMIN");
    madeUsers.push(second.id);
    const demoted = await admin.setUserRole({
      actorId: boss.id,
      userId: second.id,
      role: "USER",
    });
    check("a superadmin who is not the last one can be demoted", demoted.ok);
  }

  console.log("\n— losing staff access ends the session —");
  await db.session.create({
    data: {
      userId: member.id,
      token: `verify-token-${tag}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  await admin.setUserRole({
    actorId: boss.id,
    userId: member.id,
    role: "USER",
  });
  const leftOver = await db.session.count({ where: { userId: member.id } });
  check("a demoted moderator is signed out", leftOver === 0);

  console.log("\n— suspending —");
  const listingId = await seller.createDraft(member.id, draft(`@susp${tag}`));
  madeListings.push(listingId);
  await seller.startOwnershipCheck(member.id, listingId);
  await seller.submitForReview(member.id, listingId);
  const published = await adminListings.approveListing(listingId);
  check("the fixture listing went live", published.ok);

  const modBansStaff = await admin.setUserBanned({
    actorId: moderator.id,
    actorRole: "MODERATOR",
    userId: boss.id,
    banned: true,
    reason: "trying it on",
  });
  check(
    "a moderator cannot suspend a superadmin",
    !modBansStaff.ok && modBansStaff.reason === "outranked",
    modBansStaff.ok ? "IT WENT THROUGH" : modBansStaff.reason,
  );
  if (modBansStaff.ok) {
    await db.user.update({
      where: { id: boss.id },
      data: { bannedAt: null, banReason: null },
    });
  }

  const banSelf = await admin.setUserBanned({
    actorId: moderator.id,
    actorRole: "MODERATOR",
    userId: moderator.id,
    banned: true,
    reason: "no",
  });
  check("nobody can suspend themselves", !banSelf.ok);

  await db.session.create({
    data: {
      userId: member.id,
      token: `verify-token-2-${tag}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const banned = await admin.setUserBanned({
    actorId: moderator.id,
    actorRole: "MODERATOR",
    userId: member.id,
    banned: true,
    reason: "Asked three buyers to pay by bank transfer",
  });
  check("a moderator can suspend a member", banned.ok);

  const after = await db.user.findUniqueOrThrow({
    where: { id: member.id },
    select: { bannedAt: true, banReason: true },
  });
  check("the suspension is recorded", after.bannedAt !== null);
  check("with the reason", !!after.banReason, after.banReason ?? "");

  const sessions = await db.session.count({ where: { userId: member.id } });
  check("they are signed out", sessions === 0);

  const listing = await db.listing.findUniqueOrThrow({
    where: { id: listingId },
    select: { status: true },
  });
  check(
    "and their live listing is off the market",
    listing.status === "PAUSED",
    listing.status,
  );

  console.log("\n— restoring —");
  const restored = await admin.setUserBanned({
    actorId: moderator.id,
    actorRole: "MODERATOR",
    userId: member.id,
    banned: false,
    reason: null,
  });
  check("a moderator can lift it", restored.ok);
  const back = await db.user.findUniqueOrThrow({
    where: { id: member.id },
    select: { bannedAt: true, banReason: true },
  });
  check("the account is active again", back.bannedAt === null);
  check("and the old reason is cleared", back.banReason === null);

  const stillPaused = await db.listing.findUniqueOrThrow({
    where: { id: listingId },
    select: { status: true },
  });
  check(
    "the listing stays paused until they relist it",
    stillPaused.status === "PAUSED",
    stillPaused.status,
  );

  console.log("\n— finding people —");
  const found = await admin.listUsers({ query: `verify-user-${tag}` });
  check(
    "search finds an account by email",
    found.rows.some((row) => row.id === member.id),
  );
  const staffOnly = await admin.listUsers({ role: "STAFF" });
  check(
    "the staff filter excludes members",
    staffOnly.rows.every((row) => row.role !== "USER"),
  );
  check(
    "and includes the moderator",
    staffOnly.rows.some((row) => row.id === moderator.id) ||
      staffOnly.total > staffOnly.rows.length,
  );

  const detail = await admin.getUserDetail(member.id);
  check("a detail page has something to show", detail !== null);
  check(
    "missing accounts return nothing",
    (await admin.getUserDetail("nope")) === null,
  );

  await db.listing.deleteMany({ where: { id: { in: madeListings } } });
  await db.user.deleteMany({ where: { id: { in: madeUsers } } });

  console.log(
    `\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
