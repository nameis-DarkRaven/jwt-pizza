import { expect, test } from "playwright-test-coverage";
import type { Page } from "@playwright/test";
import { mockSignedInUser } from "./testHelpers";

const diner = {
  id: "new-diner-1",
  name: "pizza diner",
  email: "pizza-diner@example.test",
  roles: [{ role: "diner" }],
};

async function openDinerDashboard(page: Page) {
  await mockSignedInUser(page, diner, "new-diner-token");
  await page.route("**/api/order", (route) =>
    route.fulfill({ json: { orders: [] } }),
  );
  await page.goto("/diner-dashboard");
}

async function openDashboardWithMutableUser(
  page: Page,
  initialUser = diner,
  initialPassword = "diner-password",
) {
  let storedUser = { ...initialUser };
  let storedPassword = initialPassword;
  let storedToken = "new-diner-token";
  let updateRequest: Record<string, unknown> | undefined;

  await page.addInitScript((token) => {
    localStorage.setItem("token", token);
  }, storedToken);
  await page.route("**/api/user/me", (route) =>
    route.fulfill({ json: storedUser }),
  );
  await page.route("**/api/order", (route) =>
    route.fulfill({ json: { orders: [] } }),
  );
  await page.route("**/api/user/new-diner-1", async (route) => {
    expect(route.request().method()).toBe("PUT");
    const requestBody = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    updateRequest = requestBody;
    const { password, ...safeUserFields } = requestBody;
    storedUser = { ...storedUser, ...safeUserFields } as typeof storedUser;
    if (typeof password === "string" && password.length > 0) {
      storedPassword = password;
    }
    storedToken = "updated-diner-token";
    await route.fulfill({
      json: { user: storedUser, token: storedToken },
    });
  });
  await page.route("**/api/auth", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ json: { message: "logout successful" } });
      return;
    }

    const credentials = route.request().postDataJSON();
    expect(credentials).toEqual({
      email: storedUser.email,
      password: storedPassword,
    });
    await route.fulfill({
      json: { user: storedUser, token: storedToken },
    });
  });

  await page.goto("/diner-dashboard");
  return {
    get updateRequest() {
      return updateRequest;
    },
    get storedUser() {
      return storedUser;
    },
  };
}

async function logoutAndLogin(page: Page, email: string, password: string) {
  await page.getByRole("link", { name: "Logout" }).click();
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "pd" }).click();
  await expect(
    page.getByRole("heading", { name: "Your pizza kitchen" }),
  ).toBeVisible();
}

test("new diner can register and open their dashboard", async ({ page }) => {
  const password = "diner-password";
  const token = "new-diner-token";

  await page.route("**/api/auth", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      name: diner.name,
      email: diner.email,
      password,
    });
    await route.fulfill({ json: { user: diner, token } });
  });
  await page.route("**/api/order", (route) =>
    route.fulfill({ json: { orders: [] } }),
  );

  await page.goto("/");
  await page.getByRole("link", { name: "Register" }).click();
  await page.getByPlaceholder("Full name").fill(diner.name);
  await page.getByPlaceholder("Email address").fill(diner.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByRole("link", { name: "pd" })).toBeVisible();
  await page.getByRole("link", { name: "pd" }).click();

  await expect(
    page.getByRole("heading", { name: "Your pizza kitchen" }),
  ).toBeVisible();
  await expect(page.getByText(diner.name, { exact: true })).toBeVisible();
  await expect(page.getByText(diner.email, { exact: true })).toBeVisible();
});

test("diner can open and close the edit profile dialog", async ({ page }) => {
  await openDinerDashboard(page);

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit user" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue(diner.name);
  await expect(page.getByLabel("Email address")).toHaveValue(diner.email);
  await expect(page.getByLabel("Password")).toHaveValue("");
  await page.getByRole("button", { name: "Close edit user dialog" }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });
  await expect(page.getByText(diner.name, { exact: true })).toBeVisible();
});

test("updating the diner name updates the dashboard", async ({ page }) => {
  const updatedDiner = { ...diner, name: "pizza dinerx" };
  const api = await openDashboardWithMutableUser(page);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("pizza dinerx");
  await page.getByRole("button", { name: "Update" }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });

  await expect
    .poll(() => api.updateRequest)
    .toEqual({
      id: diner.id,
      name: updatedDiner.name,
      email: diner.email,
      roles: diner.roles,
    });
  await expect(page.getByText("pizza dinerx", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("token")))
    .toBe("updated-diner-token");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("pizza dinerx");
  await expect(page.getByLabel("Password")).toHaveValue("");
  await page.getByRole("button", { name: "Close edit user dialog" }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });
  await logoutAndLogin(page, diner.email, "diner-password");
  await expect(page.getByText("pizza dinerx", { exact: true })).toBeVisible();
});

test("updating diner email persists after re-login", async ({ page }) => {
  const updatedEmail = "pizza-dinerx@example.test";
  const api = await openDashboardWithMutableUser(page);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Email address").fill(updatedEmail);
  await page.getByRole("button", { name: "Update" }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });

  await expect.poll(() => api.updateRequest?.email).toBe(updatedEmail);
  await expect(page.getByText(updatedEmail, { exact: true })).toBeVisible();
  await logoutAndLogin(page, updatedEmail, "diner-password");
  await expect(page.getByText(updatedEmail, { exact: true })).toBeVisible();
});

test("updating diner password persists after re-login", async ({ page }) => {
  const updatedPassword = "diner-password-x";
  const api = await openDashboardWithMutableUser(page);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Password").fill(updatedPassword);
  await page.getByRole("button", { name: "Update" }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });

  await expect.poll(() => api.updateRequest?.password).toBe(updatedPassword);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Password")).toHaveValue("");
  await page.getByRole("button", { name: "Close edit user dialog" }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });
  await logoutAndLogin(page, diner.email, updatedPassword);
  await expect(page.getByText(diner.name, { exact: true })).toBeVisible();
});

test("editing a franchisee profile preserves its role", async ({ page }) => {
  const franchisee = {
    ...diner,
    roles: [{ role: "franchisee", objectId: "franchise-1" }],
  };
  const api = await openDashboardWithMutableUser(page, franchisee);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Pizza Owner");
  await page.getByRole("button", { name: "Update" }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });

  await expect.poll(() => api.updateRequest?.roles).toEqual(franchisee.roles);
  await expect(page.getByText("Pizza Owner", { exact: true })).toBeVisible();
  await expect(page.getByText("Franchisee on franchise-1")).toBeVisible();
});

test("failed profile update keeps the dialog and saved profile unchanged", async ({
  page,
}) => {
  await openDinerDashboard(page);
  await page.route("**/api/user/new-diner-1", (route) =>
    route.fulfill({ status: 500, json: { message: "internal error" } }),
  );

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("unsaved name");
  await page.getByRole("button", { name: "Update" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Unable to update your profile. Please try again.",
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(diner.name, { exact: true })).toBeVisible();
  await expect(page.getByText("unsaved name", { exact: true })).toHaveCount(0);
});
