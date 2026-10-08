import { expect, test } from "playwright-test-coverage";

const serviceDocs = {
  endpoints: [
    {
      requiresAuth: true,
      method: "GET",
      path: "/api/user/me",
      description: "Returns the current user.",
      example: "GET /api/user/me",
      response: { id: "user-1" },
    },
  ],
};

test("API docs show endpoint details", async ({ page }) => {
  await page.route("**/api/docs", (route) =>
    route.fulfill({ json: serviceDocs }),
  );

  await page.goto("/docs");

  await expect(
    page.getByRole("heading", { name: "JWT Pizza API" }),
  ).toBeVisible();
  await expect(page.getByText("[GET] /api/user/me")).toBeVisible();
  await expect(page.getByText("Returns the current user.")).toBeVisible();
  await expect(page.getByText("GET /api/user/me")).toBeVisible();
  await expect(page.getByText('"id": "user-1"')).toBeVisible();
});

test("docs route displays the requested API category", async ({ page }) => {
  let docsHost = "";
  await page.route("**/api/docs", async (route) => {
    docsHost = new URL(route.request().url()).hostname;
    await route.fulfill({
      json: {
        endpoints: [
          {
            requiresAuth: false,
            method: "POST",
            path: "/api/order/verify",
            description: "Verifies an order token.",
            example: "POST /api/order/verify",
            response: { message: "valid" },
          },
        ],
      },
    });
  });

  await page.goto("/docs/factory");

  await expect(page.getByText("[POST] /api/order/verify")).toBeVisible();
  await expect(page.getByText("Verifies an order token.")).toBeVisible();
  await expect.poll(() => docsHost).toBe("pizza-factory.cs329.click");
});
