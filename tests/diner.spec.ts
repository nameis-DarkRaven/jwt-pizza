import { expect, test } from "playwright-test-coverage";
import { mockSignedInUser } from "./testHelpers";

const profile = {
  id: "diner-1",
  name: "Test Diner",
  email: "diner@example.test",
  roles: [{ role: "diner" }],
};

test("diner can open their dashboard from the menu", async ({ page }) => {
  await mockSignedInUser(page, profile, "diner-token");
  await page.route("**/api/order/menu", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/franchise?page=0&limit=20&name=**", (route) =>
    route.fulfill({ json: { franchises: [], more: false } }),
  );
  await page.route("**/api/order", (route) =>
    route.fulfill({ json: { orders: [] } }),
  );

  await page.goto("/menu");
  await page.getByRole("link", { name: "TD" }).click();

  await expect(page).toHaveURL(/\/diner-dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Your pizza kitchen" }),
  ).toBeVisible();
  await expect(page.getByText(profile.name, { exact: true })).toBeVisible();
});

test("signed-in user can access their profile without role claims", async ({
  page,
}) => {
  const user = {
    id: "diner-1",
    name: "Test Diner",
    email: "diner@example.test",
  };
  await mockSignedInUser(page, user, "diner-token");
  await page.route("**/api/order", (route) =>
    route.fulfill({ json: { orders: [] } }),
  );

  await page.goto("/diner-dashboard");

  await expect(
    page.getByRole("heading", { name: "Your pizza kitchen" }),
  ).toBeVisible();
  await expect(page.getByText("Test Diner", { exact: true })).toBeVisible();
  await expect(
    page.getByText("diner@example.test", { exact: true }),
  ).toBeVisible();
});

test("diner session restores before the dashboard shows access denied", async ({
  page,
}) => {
  let finishUserRequest: () => void = () => {};
  const userRequestGate = new Promise<void>((resolve) => {
    finishUserRequest = resolve;
  });
  await page.addInitScript(() => {
    localStorage.setItem("token", "slow-diner-token");
  });
  await page.route("**/api/user/me", async (route) => {
    await userRequestGate;
    await route.fulfill({ json: profile });
  });
  await page.route("**/api/order", (route) =>
    route.fulfill({ json: { orders: [] } }),
  );

  await page.goto("/diner-dashboard");
  await page.waitForRequest("**/api/user/me");

  await expect(page.getByRole("status")).toHaveText("Loading account...");
  await expect(
    page.getByText(/dropped a pizza on the floor/i),
  ).not.toBeVisible();
  finishUserRequest();
  await expect(
    page.getByRole("heading", { name: "Your pizza kitchen" }),
  ).toBeVisible();
});

test("diner dashboard shows order history", async ({ page }) => {
  await mockSignedInUser(page, profile, "diner-token");
  await page.route("**/api/order", (route) =>
    route.fulfill({
      json: {
        orders: [
          {
            id: "order-1",
            date: "2026-09-01T12:00:00.000Z",
            items: [
              { menuId: "pizza-1", description: "Margherita", price: 12 },
              { menuId: "pizza-2", description: "Olive", price: 8 },
            ],
          },
        ],
      },
    }),
  );

  await page.goto("/diner-dashboard");

  await expect(
    page.getByText("Here is your history of all the good times."),
  ).toBeVisible();
  await expect(page.getByText("order-1")).toBeVisible();
  await expect(page.getByText("20 ₿")).toBeVisible();
  await expect(page.getByRole("link", { name: "Buy one" })).not.toBeVisible();
});

test("diner without orders sees the 'Buy one' link", async ({ page }) => {
  await mockSignedInUser(page, profile, "diner-token");
  await page.route("**/api/order", (route) =>
    route.fulfill({ json: { orders: [] } }),
  );

  await page.goto("/diner-dashboard");

  await expect(
    page.getByText(/How have you lived this long without having a pizza/i),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Buy one" })).toHaveAttribute(
    "href",
    "/menu",
  );
});
