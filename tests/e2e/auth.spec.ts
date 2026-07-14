import { expect, test } from "@playwright/test";

// Serial: tests share DB state seeded by global-setup (admin exists; this suite
// provisions counters + a reception user, then exercises every login surface).
test.describe.configure({ mode: "serial" });

const ADMIN = { username: "admin", password: "Str0ngAdminPass" };
const COUNTER_PW = "1";
const RECEPTION = { username: "reception", password: "recpw" };

test("protected routes redirect to login when unauthenticated", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: "screenshots/login.png" });
  await page.goto("/reception");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/counter/console");
  await expect(page).toHaveURL(/\/counter$/);
});

test("admin logs in and provisions counters + shared password + reception user", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="username"]', ADMIN.username);
  await page.fill('input[name="password"]', ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // shared counter password
  await page.getByPlaceholder("New shared counter password").fill(COUNTER_PW);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Shared counter password updated.")).toBeVisible();

  // open 2 counters
  await page.getByPlaceholder("e.g. 6").fill("2");
  await page.getByRole("button", { name: "Open counters" }).click();
  await expect(page.getByText("Counter 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Counter 2", { exact: true })).toBeVisible();

  // create reception user
  await page.getByPlaceholder("Username").fill(RECEPTION.username);
  await page.getByPlaceholder("Password", { exact: true }).fill(RECEPTION.password);
  await page.getByRole("button", { name: "Create reception user" }).click();
  await expect(page.getByText(`Created reception user '${RECEPTION.username}'.`)).toBeVisible();
  await page.screenshot({ path: "screenshots/admin.png", fullPage: true });

  // log out
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="username"]', ADMIN.username);
  await page.fill('input[name="password"]', "nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong username or password.")).toBeVisible();
});

test("reception user can log in", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="username"]', RECEPTION.username);
  await page.fill('input[name="password"]', RECEPTION.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/reception$/);
  await expect(page.getByText(`Reception · ${RECEPTION.username}`)).toBeVisible();
});

test("counter handler logs in with shared password and claims a station", async ({ page }) => {
  await page.goto("/counter");
  await page.getByPlaceholder("Counter password").fill(COUNTER_PW);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/counter\/select$/);

  await expect(page.getByText("Counter 1", { exact: true })).toBeVisible();
  await page
    .locator("form", { hasText: "Counter 1" })
    .getByRole("button", { name: "Select" })
    .click();
  await expect(page).toHaveURL(/\/counter\/console$/);
  await expect(page.getByRole("heading", { name: "Counter 1" })).toBeVisible();
});

test("a second handler can take over a busy station", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/counter");
  await page.getByPlaceholder("Counter password").fill(COUNTER_PW);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/counter\/select$/);

  // Counter 1 is held by the previous test's handler → shows "in use"
  const row = page.locator("form", { hasText: "Counter 1" });
  await row.getByRole("button", { name: "Select" }).click();
  const takeOver = row.getByRole("button", { name: "Take over" });
  await expect(takeOver).toBeVisible();
  await takeOver.click();
  await expect(page).toHaveURL(/\/counter\/console$/);
  await expect(page.getByRole("heading", { name: "Counter 1" })).toBeVisible();
  await ctx.close();
});

test("reception issues tokens and a counter serves the queue in order", async ({ browser }) => {
  // Reception issues two tokens (applicants seeded in global-setup).
  const recCtx = await browser.newContext();
  const rec = await recCtx.newPage();
  await rec.goto("/login");
  await rec.fill('input[name="username"]', RECEPTION.username);
  await rec.fill('input[name="password"]', RECEPTION.password);
  await rec.getByRole("button", { name: "Sign in" }).click();
  await expect(rec).toHaveURL(/\/reception$/);

  await rec.getByPlaceholder(/Search application number/).fill("APP001");
  await rec.getByRole("button", { name: "Generate token" }).click();
  await expect(rec.getByText(/Token 1/)).toBeVisible();
  await rec.getByPlaceholder(/Search application number/).fill("APP002");
  await rec.getByRole("button", { name: "Generate token" }).click();
  await expect(rec.getByText(/Token 2/)).toBeVisible();
  await recCtx.close();

  // A counter serves them FIFO. Use Counter 2 (Counter 1 is held by the take-over test).
  const ctrCtx = await browser.newContext();
  const ctr = await ctrCtx.newPage();
  await ctr.goto("/counter");
  await ctr.getByPlaceholder("Counter password").fill(COUNTER_PW);
  await ctr.getByRole("button", { name: "Continue" }).click();
  await ctr
    .locator("form", { hasText: "Counter 2" })
    .getByRole("button", { name: "Select" })
    .click();
  await expect(ctr).toHaveURL(/\/counter\/console$/);
  await expect(ctr.getByText("No token in hand")).toBeVisible();

  await ctr.getByRole("button", { name: "Next Token" }).click();
  await expect(ctr.getByText("Alice Anand")).toBeVisible(); // token 1 (APP001)
  await ctr.screenshot({ path: "screenshots/console.png" });
  await ctr.getByRole("button", { name: "Next Token" }).click();
  await expect(ctr.getByText("Bharat Bose")).toBeVisible(); // token 2 (APP002)
  await ctr.getByRole("button", { name: "Next Token" }).click();
  await expect(ctr.getByText("No token in hand")).toBeVisible(); // queue drained
  await ctrCtx.close();
});

test("the display wall updates live (SSE) when a counter serves a token", async ({ browser }) => {
  // Admin grabs the display link and opens a fresh counter.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await admin.goto("/login");
  await admin.fill('input[name="username"]', ADMIN.username);
  await admin.fill('input[name="password"]', ADMIN.password);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  const displayPath = await admin.locator('a[href^="/display/"]').first().getAttribute("href");
  expect(displayPath).toBeTruthy();
  await admin.getByPlaceholder(/Add a custom counter/).fill("Counter 3");
  await admin.getByRole("button", { name: "Add" }).click();
  await expect(admin.getByText("Added Counter 3.")).toBeVisible();
  await adminCtx.close();

  // Open the wall (unauthenticated — gated by the display key).
  const wallCtx = await browser.newContext();
  const wall = await wallCtx.newPage();
  await wall.goto(displayPath!);
  await expect(wall.getByRole("heading", { name: /now serving/i })).toBeVisible();

  // Reception issues a token for APP003.
  const recCtx = await browser.newContext();
  const rec = await recCtx.newPage();
  await rec.goto("/login");
  await rec.fill('input[name="username"]', RECEPTION.username);
  await rec.fill('input[name="password"]', RECEPTION.password);
  await rec.getByRole("button", { name: "Sign in" }).click();
  await rec.getByPlaceholder(/Search application number/).fill("APP003");
  await rec.getByRole("button", { name: "Generate token" }).click();
  await expect(rec.getByText(/Token/)).toBeVisible();
  await recCtx.close();

  // A counter serves it.
  const ctrCtx = await browser.newContext();
  const ctr = await ctrCtx.newPage();
  await ctr.goto("/counter");
  await ctr.getByPlaceholder("Counter password").fill(COUNTER_PW);
  await ctr.getByRole("button", { name: "Continue" }).click();
  await ctr
    .locator("form", { hasText: "Counter 3" })
    .getByRole("button", { name: "Select" })
    .click();
  await ctr.getByRole("button", { name: "Next Token" }).click();
  await expect(ctr.getByText("Chetan Chopra")).toBeVisible();
  await ctrCtx.close();

  // The wall reflects it live via SSE (no reload) — Counter 3's call appears.
  await expect(wall.getByText("Counter 3").first()).toBeVisible({ timeout: 8000 });
  await wall.screenshot({ path: "screenshots/wall.png" });
  await wallCtx.close();
});

test("admin replaces the applicant roster via CSV import", async ({ page, browser }) => {
  page.on("dialog", (d) => d.accept()); // accept the commit confirm()
  await page.goto("/login");
  await page.fill('input[name="username"]', ADMIN.username);
  await page.fill('input[name="password"]', ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.locator('input[type="file"]').setInputFiles({
    name: "roster.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Application No,Name\nZ999,Zeta Zed\nZ998,Yara Young\n"),
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const commit = page.getByRole("button", { name: /Commit replace \(2\)/ });
  await expect(commit).toBeVisible();
  await commit.click();
  await expect(page.getByText(/Roster replaced/)).toBeVisible();

  // Reception can now issue for a new applicant, and the old roster is gone.
  const recCtx = await browser.newContext();
  const rec = await recCtx.newPage();
  await rec.goto("/login");
  await rec.fill('input[name="username"]', RECEPTION.username);
  await rec.fill('input[name="password"]', RECEPTION.password);
  await rec.getByRole("button", { name: "Sign in" }).click();
  await rec.getByPlaceholder(/Search application number/).fill("Z999");
  await rec.getByRole("button", { name: "Generate token" }).click();
  await expect(rec.getByText(/Token/)).toBeVisible();
  await rec.getByPlaceholder(/Search application number/).fill("APP001");
  await rec.getByRole("button", { name: "Generate token" }).click();
  await expect(rec.getByText(/isn't in the roster/)).toBeVisible();
  await recCtx.close();
});
