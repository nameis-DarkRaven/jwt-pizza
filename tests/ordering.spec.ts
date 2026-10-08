import { expect, test } from "playwright-test-coverage";
import type { Page } from "@playwright/test";
import { mockSignedInUser } from "./testHelpers";

const pizzas = [
  {
    id: "pizza-1",
    title: "Margherita",
    description: "Tomato and mozzarella",
    image: "margherita.jpg",
    price: 12,
  },
  {
    id: "pizza-2",
    title: "Olive",
    description: "Olives and herbs",
    image: "olive.jpg",
    price: 8,
  },
];
const diner = { id: "diner-1", roles: [{ role: "diner" }] };

async function mockMenu(page: Page) {
  await page.route("**/api/order/menu", (route) =>
    route.fulfill({ json: pizzas }),
  );
  await page.route("**/api/franchise?page=0&limit=20&name=**", (route) =>
    route.fulfill({
      json: {
        franchises: [
          {
            id: "franchise-1",
            name: "Central Pizza",
            stores: [{ id: "store-1", name: "Central Store" }],
          },
        ],
        more: false,
      },
    }),
  );
}

async function addPizzaAndCheckout(page: Page) {
  await page.goto("/menu");
  await page.locator("button").filter({ hasText: "Margherita" }).click();
  await page.locator("select").selectOption("store-1");
  await page.getByRole("button", { name: "Checkout" }).click();
}

test("menu displays pizzas and available stores", async ({ page }) => {
  await mockMenu(page);

  await page.goto("/menu");

  await expect(page.getByText("Margherita", { exact: true })).toBeVisible();
  await expect(page.getByText("Olive", { exact: true })).toBeVisible();
  await expect(page.locator("select")).toContainText("Central Store");
});

test("checkout stays disabled until a store and pizza are selected", async ({
  page,
}) => {
  await mockMenu(page);
  await page.goto("/menu");

  const checkout = page.getByRole("button", { name: "Checkout" });
  await expect(checkout).toBeDisabled();
  await page.locator("select").selectOption("store-1");
  await expect(checkout).toBeDisabled();
  await page.locator("button").filter({ hasText: "Margherita" }).click();
  await expect(checkout).toBeEnabled();
});

test("selecting a pizza updates the selected pizza count", async ({ page }) => {
  await mockMenu(page);
  await page.goto("/menu");

  await page.locator("button").filter({ hasText: "Margherita" }).click();
  await page.locator("button").filter({ hasText: "Olive" }).click();

  await expect(page.getByText("Selected pizzas: 2")).toBeVisible();
});

test("checkout shows the selected pizza and total", async ({ page }) => {
  await mockMenu(page);
  await mockSignedInUser(page, diner, "diner-token");
  await page.goto("/menu");
  await page.locator("button").filter({ hasText: "Margherita" }).click();
  await page.locator("button").filter({ hasText: "Olive" }).click();
  await page.locator("select").selectOption("store-1");
  await page.getByRole("button", { name: "Checkout" }).click();

  await expect(page).toHaveURL(/\/payment$/);
  await expect(page.getByRole("cell", { name: "Margherita" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Olive" })).toBeVisible();
  await expect(page.locator("tfoot").getByRole("cell").first()).toHaveText(
    "2 pies",
  );
  await expect(page.locator("tfoot").getByRole("cell").last()).toHaveText(
    "20 ₿",
  );
});

test("canceling payment returns to the menu with the order intact", async ({
  page,
}) => {
  await mockMenu(page);
  await mockSignedInUser(page, diner, "diner-token");
  await addPizzaAndCheckout(page);

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.getByText("Selected pizzas: 1")).toBeVisible();
  await expect(page.locator("select")).toHaveValue("store-1");
});

test("payment sends the order to the delivery page", async ({ page }) => {
  await mockMenu(page);
  await mockSignedInUser(page, diner, "diner-token");
  let postedOrder: unknown;
  await page.route("**/api/order", async (route) => {
    if (route.request().method() === "POST") {
      postedOrder = route.request().postDataJSON();
      await route.fulfill({
        json: {
          order: {
            id: "order-1",
            items: [{ description: "Margherita", price: 12 }],
          },
          jwt: "signed-order-token",
        },
      });
    } else {
      await route.fulfill({ json: { orders: [] } });
    }
  });
  await addPizzaAndCheckout(page);
  await page.getByRole("button", { name: "Pay now" }).click();

  await expect(page).toHaveURL(/\/delivery$/);
  await expect(page.getByText("signed-order-token")).toBeVisible();
  await expect
    .poll(() => postedOrder)
    .toMatchObject({
      storeId: "store-1",
      franchiseId: "franchise-1",
      items: [{ menuId: "pizza-1", description: "Margherita", price: 12 }],
    });
});

test("delivery verifies the order JWT", async ({ page }) => {
  await mockMenu(page);
  await mockSignedInUser(page, diner, "diner-token");
  await page.route("**/api/order", async (route) =>
    route.fulfill({
      json: {
        order: {
          id: "order-1",
          items: [{ description: "Margherita", price: 12 }],
        },
        jwt: "signed-order-token",
      },
    }),
  );
  let verifiedToken: unknown;
  await page.route("**/api/order/verify", async (route) => {
    verifiedToken = route.request().postDataJSON().jwt;
    await route.fulfill({ json: { message: "valid", payload: "order-1" } });
  });
  await addPizzaAndCheckout(page);
  await page.getByRole("button", { name: "Pay now" }).click();
  await page.getByRole("button", { name: "Verify" }).click();

  await expect.poll(() => verifiedToken).toBe("signed-order-token");
  await expect(
    page.getByRole("heading", { name: /JWT Pizza - valid/ }),
  ).toBeVisible();
});

test("Order more returns to the menu", async ({ page }) => {
  await page.goto("/delivery");

  await page.getByRole("button", { name: "Order more" }).click();

  await expect(page).toHaveURL(/\/menu$/);
});

test("payment prompts an unauthenticated user to log in", async ({ page }) => {
  await mockMenu(page);
  await addPizzaAndCheckout(page);

  await expect(page).toHaveURL(/\/payment\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("rejected JWT verification is reported as invalid", async ({ page }) => {
  let submittedToken: unknown;
  await page.route("**/api/order/verify", async (route) => {
    submittedToken = route.request().postDataJSON().jwt;
    await route.fulfill({ status: 401, json: { message: "Invalid token" } });
  });

  await page.goto("/delivery");
  await page.getByRole("button", { name: "Verify" }).click();

  await expect.poll(() => submittedToken).toBe("error");
  await expect(
    page.getByRole("heading", { name: /JWT Pizza - Invalid token/ }),
  ).toBeVisible();
});
