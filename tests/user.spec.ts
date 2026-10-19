import { expect, test } from "playwright-test-coverage";

test("new diner can register and open their dashboard", async ({ page }) => {
  const diner = {
    id: "new-diner-1",
    name: "pizza diner",
    email: "pizza-diner@example.test",
    password: "diner-password",
    roles: [{ role: "diner" }],
  };
  const token = "new-diner-token";

  await page.route("**/api/auth", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      name: diner.name,
      email: diner.email,
      password: diner.password,
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
  await page.getByLabel("Password").fill(diner.password);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByRole("link", { name: "pd" })).toBeVisible();
  await page.getByRole("link", { name: "pd" }).click();

  await expect(
    page.getByRole("heading", { name: "Your pizza kitchen" }),
  ).toBeVisible();
  await expect(page.getByText(diner.name, { exact: true })).toBeVisible();
  await expect(page.getByText(diner.email, { exact: true })).toBeVisible();
});
