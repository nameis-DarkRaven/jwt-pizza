import { expect, test } from "playwright-test-coverage";

test("homepage is displayed correctly", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "The web's best pizza" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Global" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register" })).toBeVisible();
});

test("'Order now' opens the menu", async ({ page }) => {
  await page.route("**/api/order/menu", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/franchise?page=0&limit=20&name=**", (route) =>
    route.fulfill({ json: { franchises: [], more: false } }),
  );
  await page.goto("/");

  await page.getByRole("button", { name: "Order now" }).click();

  await expect(page).toHaveURL(/\/menu$/);
  await expect(
    page.getByRole("heading", { name: "Awesome is a click away" }),
  ).toBeVisible();
});

const footerDestinations = [
  { name: "About", url: /\/about$/, heading: "The secret sauce" },
  { name: "History", url: /\/history$/, heading: "Mama Rucci, my my" },
];

for (const destination of footerDestinations) {
  test(`footer navigation opens ${destination.name}`, async ({ page }) => {
    await page.goto("/");

    await page
      .locator("footer")
      .getByRole("link", { name: destination.name })
      .click();

    await expect(page).toHaveURL(destination.url);
    await expect(
      page.getByRole("heading", { name: destination.heading }),
    ).toBeVisible();
  });
}

test("unknown URL shows the not-found page", async ({ page }) => {
  await page.goto("/not-a-real-page");

  await expect(page.getByText(/dropped a pizza on the floor/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The web's best pizza" }),
  ).not.toBeVisible();
});
