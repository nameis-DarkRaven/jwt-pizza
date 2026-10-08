import { expect, test, type Page } from "@playwright/test";
import { mockSignedInUser } from "./testHelpers";

const admin = {
  id: "admin-1",
  name: "Test Admin",
  email: "admin@example.test",
  roles: [{ role: "admin" }],
};

const franchises = [
  {
    id: "franchise-1",
    name: "North Pizza",
    admins: [
      { id: "franchisee-1", name: "Alex Owner", email: "alex@example.test" },
    ],
    stores: [{ id: "store-1", name: "North Store", totalRevenue: 42 }],
  },
  { id: "franchise-2", name: "South Pizza", admins: [], stores: [] },
  { id: "franchise-3", name: "East Pizza", admins: [], stores: [] },
  { id: "franchise-4", name: "West Pizza", admins: [], stores: [] },
];

async function mockFranchises(page: Page) {
  const currentFranchises = structuredClone(franchises);
  const filters: string[] = [];
  const deletions: string[] = [];

  await page.route("**/api/franchise**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "DELETE") {
      deletions.push(url.pathname);
      const path = url.pathname.split("/").filter(Boolean);
      if (path.length === 5) {
        const franchise = currentFranchises.find((item) => item.id === path[2]);
        if (franchise) {
          franchise.stores = franchise.stores.filter(
            (store) => store.id !== path[4],
          );
        }
      } else if (path.length === 3) {
        const index = currentFranchises.findIndex(
          (item) => item.id === path[2],
        );
        if (index !== -1) currentFranchises.splice(index, 1);
      }
      await route.fulfill({ json: {} });
      return;
    }

    const pageNumber = Number(url.searchParams.get("page") || 0);
    const pageSize = Number(url.searchParams.get("limit") || 10);
    const filter = url.searchParams.get("name") || "*";
    if (method !== "GET") {
      await route.fulfill({ json: {} });
      return;
    }
    filters.push(filter);
    const searchText = filter.replace(/\*/g, "").toLowerCase();
    const matchingFranchises = currentFranchises.filter((item) =>
      item.name.toLowerCase().includes(searchText),
    );
    await route.fulfill({
      json: {
        franchises: matchingFranchises.slice(
          pageNumber * pageSize,
          (pageNumber + 1) * pageSize,
        ),
        more: (pageNumber + 1) * pageSize < matchingFranchises.length,
      },
    });
  });

  return { filters, deletions };
}

test("admin dashboard shows franchises and stores", async ({ page }) => {
  await mockSignedInUser(page, admin, "admin-token");
  await mockFranchises(page);

  await page.goto("/admin-dashboard");

  await expect(
    page.getByRole("heading", { name: "Mama Ricci's kitchen" }),
  ).toBeVisible();
  await expect(page.getByText("North Pizza")).toBeVisible();
  await expect(page.getByText("Alex Owner")).toBeVisible();
  await expect(page.getByText("North Store")).toBeVisible();
  await expect(page.getByText("42 ₿")).toBeVisible();
});

test("filtering franchises shows matching results", async ({ page }) => {
  await mockSignedInUser(page, admin, "admin-token");
  const api = await mockFranchises(page);
  await page.goto("/admin-dashboard");

  await page.getByPlaceholder("Filter franchises").fill("North");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("North Pizza")).toBeVisible();
  await expect(page.getByText("South Pizza")).not.toBeVisible();
  await expect.poll(() => api.filters).toContain("*North*");
});

test("franchise pagination advances when another page exists", async ({
  page,
}) => {
  await mockSignedInUser(page, admin, "admin-token");
  await mockFranchises(page);
  await page.goto("/admin-dashboard");

  await page.getByRole("button", { name: "»" }).click();

  await expect(page.getByText("West Pizza")).toBeVisible();
  await expect(page.getByText("North Pizza")).not.toBeVisible();
});

test("admin can create a franchise", async ({ page }) => {
  await mockSignedInUser(page, admin, "admin-token");
  await mockFranchises(page);
  let created: unknown;
  await page.route("**/api/franchise", async (route) => {
    if (route.request().method() === "POST") {
      created = route.request().postDataJSON();
    }
    await route.fulfill({ json: {} });
  });
  await page.goto("/admin-dashboard");
  await page.getByRole("button", { name: "Add Franchise" }).click();

  await page.getByPlaceholder("franchise name").fill("East Pizza");
  await page
    .getByPlaceholder("franchisee admin email")
    .fill("owner@example.test");
  await page.getByRole("button", { name: "Create" }).click();

  await expect
    .poll(() => created)
    .toEqual({
      id: "",
      name: "East Pizza",
      stores: [],
      admins: [{ email: "owner@example.test" }],
    });
  await expect(page).toHaveURL(/\/admin-dashboard$/);
});

test("canceling franchise closure keeps the franchise", async ({ page }) => {
  await mockSignedInUser(page, admin, "admin-token");
  const api = await mockFranchises(page);
  await page.goto("/admin-dashboard");
  await page.getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await expect(page.getByText("North Pizza")).toBeVisible();
  expect(api.deletions).toEqual([]);
});

test("confirming franchise closure removes the franchise and its stores", async ({
  page,
}) => {
  await mockSignedInUser(page, admin, "admin-token");
  const api = await mockFranchises(page);
  await page.goto("/admin-dashboard");
  await page
    .getByRole("row", { name: /North Pizza/ })
    .getByRole("button", { name: "Close" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sorry to see you go" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await expect(api.deletions).toContain("/api/franchise/franchise-1");
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await expect(page.getByText("North Pizza")).not.toBeVisible();
  await expect(page.getByText("North Store")).not.toBeVisible();
});

test("admin can close a store", async ({ page }) => {
  await mockSignedInUser(page, admin, "admin-token");
  const api = await mockFranchises(page);
  await page.goto("/admin-dashboard");
  await page
    .getByRole("row", { name: /North Store/ })
    .getByRole("button", { name: "Close" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sorry to see you go" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await expect(api.deletions).toContain(
    "/api/franchise/franchise-1/store/store-1",
  );
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await expect(page.getByText("North Store")).not.toBeVisible();
  await expect(page.getByText("North Pizza")).toBeVisible();
});
