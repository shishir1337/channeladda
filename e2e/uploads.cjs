/**
 * Local file uploads.
 *
 * Plain HTTP rather than a browser: what matters here is what the endpoint
 * accepts, and a browser would politely refuse to send most of the interesting
 * cases.
 */
const B = process.env.BASE || "http://localhost:3000";
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  ${x}` : ""}`);
};

const SEEDED = {
  email: "admin@channeladda.com",
  password: "channeladda-dev-2026",
};

/** A real 1x1 PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const GIF = Buffer.from("R0lGODlhAQABAAAAACw=", "base64");

async function signIn() {
  const res = await fetch(`${B}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: B },
    body: JSON.stringify(SEEDED),
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

function form(bytes, name, type, kind = "cover") {
  const fd = new FormData();
  fd.set("kind", kind);
  fd.set("file", new File([bytes], name, { type }), name);
  return fd;
}

async function post(fd, cookie) {
  const res = await fetch(`${B}/api/uploads`, {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body: fd,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

(async () => {
  // ---- signed out ---------------------------------------------------------
  let r = await post(form(PNG, "a.png", "image/png"));
  ok("a stranger cannot upload", r.status === 401, String(r.status));

  const cookie = await signIn();
  ok("signed in for the rest", cookie.includes("channeladda"));

  // ---- the happy path -----------------------------------------------------
  // A distinctive name, so it is obvious if any of it survives into the key.
  r = await post(form(PNG, "my-own-filename.png", "image/png"), cookie);
  ok(
    "a real PNG is accepted",
    r.status === 200 && !!r.body.url,
    String(r.status),
  );
  const url = r.body.url;
  ok(
    "the stored name is generated, not the one supplied",
    typeof url === "string" &&
      !url.includes("my-own-filename") &&
      url.startsWith("/uploads/cover/") &&
      /^[0-9a-f]{32}[.]png$/.test(url.split("/").pop()),
    url,
  );

  const fetched = await fetch(B + url);
  ok(
    "the file can be read back",
    fetched.status === 200,
    String(fetched.status),
  );
  ok(
    "served as the type it actually is",
    fetched.headers.get("content-type") === "image/png",
    fetched.headers.get("content-type"),
  );
  ok(
    "browsers are told not to sniff the type",
    fetched.headers.get("x-content-type-options") === "nosniff",
  );
  ok(
    "the bytes come back unchanged",
    Buffer.from(await fetched.arrayBuffer()).equals(PNG),
  );

  r = await post(form(GIF, "x.gif", "image/gif"), cookie);
  ok("GIF is accepted too", r.status === 200, String(r.status));

  // ---- lying about the type ----------------------------------------------
  r = await post(
    form(Buffer.from("<?php system($_GET[0]); ?>"), "shell.png", "image/png"),
    cookie,
  );
  ok(
    "a script wearing a .png name is refused",
    r.status === 422,
    `${r.status} ${r.body.error ?? ""}`,
  );

  r = await post(
    form(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
      "x.svg",
      "image/svg+xml",
    ),
    cookie,
  );
  ok(
    "SVG is refused — it can carry script",
    r.status === 422,
    `${r.status} ${r.body.error ?? ""}`,
  );

  r = await post(form(Buffer.alloc(0), "empty.png", "image/png"), cookie);
  ok("an empty file is refused", r.status === 422, String(r.status));

  // ---- size ---------------------------------------------------------------
  const huge = Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]);
  r = await post(form(huge, "huge.png", "image/png"), cookie);
  ok(
    "a file over the limit is refused",
    r.status === 413 || r.status === 422,
    String(r.status),
  );

  // ---- bad requests -------------------------------------------------------
  r = await post(form(PNG, "a.png", "image/png", "../../etc"), cookie);
  ok("an unknown upload kind is refused", r.status === 400, String(r.status));

  const noFile = new FormData();
  noFile.set("kind", "cover");
  r = await post(noFile, cookie);
  ok("a request with no file is refused", r.status === 400, String(r.status));

  // ---- reading files back -------------------------------------------------
  for (const bad of [
    "/uploads/cover/../../../package.json",
    "/uploads/cover/nope.png",
    "/uploads/evil/00000000000000000000000000000000.png",
    "/uploads/cover/00000000000000000000000000000000.svg",
  ]) {
    const res = await fetch(B + bad, { redirect: "manual" });
    ok(`${bad} is not served`, res.status === 404, String(res.status));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(0);
})();
