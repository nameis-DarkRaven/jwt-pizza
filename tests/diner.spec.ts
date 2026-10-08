import { expect, test } from "@playwright/test";
import { mockSignedInUser } from "./testHelpers";

const profile = {
  id: "diner-1",
  name: "Test Diner",
  email: "diner@example.test",
  roles: [{ role: "diner" }],
};

test("diner dashboard shows the signed-in user's profile", async ({ page }) => {
  await mockSignedInUser(page, profile, "diner-token");
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
  await expect(page.getByText("diner", { exact: true })).toBeVisible();
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
