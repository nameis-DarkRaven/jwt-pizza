import { expect, test } from "playwright-test-coverage";
import type { Page } from "@playwright/test";
import { mockSignedInUser } from "./testHelpers";

const franchisee = {
  id: "franchisee-1",
  name: "Test Owner",
  email: "owner@example.test",
  roles: [{ role: "franchisee", objectId: "franchise-1" }],
};
const franchise = {
  id: "franchise-1",
  name: "Central Pizza",
  stores: [{ id: "store-1", name: "Central Store", totalRevenue: 31 }],
};

async function loadFranchisee(page: Page) {
  const currentFranchise = structuredClone(franchise);
  const deletions: string[] = [];
  await mockSignedInUser(page, franchisee, "franchisee-token");
  await page.route("**/api/franchise/franchisee-1", (route) =>
    route.fulfill({ json: [currentFranchise] }),
  );
  await page.route(
    "**/api/franchise/franchise-1/store/store-1",
    async (route) => {
      if (route.request().method() === "DELETE") {
        deletions.push(new URL(route.request().url()).pathname);
        currentFranchise.stores = currentFranchise.stores.filter(
          (store) => store.id !== "store-1",
        );
      }
      await route.fulfill({ json: null });
    },
  );
  return { currentFranchise, deletions };
}

test("franchisee dashboard shows its stores", async ({ page }) => {
  await loadFranchisee(page);

  await page.goto("/franchise-dashboard");

  await expect(
    page.getByRole("heading", { name: "Central Pizza" }),
  ).toBeVisible();
  await expect(page.getByText("Central Store")).toBeVisible();
  await expect(page.getByText("31 ₿")).toBeVisible();
});

test("franchisee can create a store", async ({ page }) => {
  const api = await loadFranchisee(page);
  let postedStore: unknown;
  await page.route("**/api/franchise/franchise-1/store", async (route) => {
    expect(route.request().method()).toBe("POST");
    postedStore = route.request().postDataJSON();
    const createdStore = {
      id: "store-2",
      name: "New Store",
      totalRevenue: 0,
    };
    api.currentFranchise.stores.push(createdStore);
    await route.fulfill({ json: createdStore });
  });

  await page.goto("/franchise-dashboard");
  await page.getByRole("button", { name: "Create store" }).click();
  await page.getByPlaceholder("store name").fill("New Store");
  await page.getByRole("button", { name: "Create" }).click();

  await expect.poll(() => postedStore).toEqual({ id: "", name: "New Store" });
  await expect(page).toHaveURL(/\/franchise-dashboard$/);
  await expect(page.getByRole("row", { name: /New Store/ })).toBeVisible();
});

test("canceling store closure keeps the store", async ({ page }) => {
  const api = await loadFranchisee(page);

  await page.goto("/franchise-dashboard");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("heading", { name: "Sorry to see you go" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page).toHaveURL(/\/franchise-dashboard$/);
  await expect(page.getByText("Central Store")).toBeVisible();
  expect(api.deletions).toEqual([]);
});

test("confirming store closure removes the store", async ({ page }) => {
  const api = await loadFranchisee(page);

  await page.goto("/franchise-dashboard");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("heading", { name: "Sorry to see you go" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await expect(api.deletions).toContain(
    "/api/franchise/franchise-1/store/store-1",
  );
  await expect(page).toHaveURL(/\/franchise-dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Central Pizza" }),
  ).toBeVisible();
  await expect(page.getByText("Central Store")).not.toBeVisible();
});
