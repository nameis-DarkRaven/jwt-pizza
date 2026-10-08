import { test, expect } from "@playwright/test";

test("diner can log in from home page", async ({ page }) => {
  const diner = { email: "d@jwt.com", password: "diner" };
  const token = "token";

  await page.route("**/api/auth", async (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual(diner);

    await route.fulfill({
      json: {
        user: {
          id: "diner",
          name: "Diner",
          email: diner.email,
          roles: [{ role: "diner" }],
        },
        token,
      },
    });
  });

  await page.goto("/");

  const loginLink = page.getByRole("link", { name: "Login" });
  await expect(loginLink).toBeVisible();
  await loginLink.click();

  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await page.getByLabel("Email address").fill(diner.email);
  await page.getByLabel("Password").fill(diner.password);
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Login" })).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("token")))
    .toBe(token);
});
test("invalid credentials show a login error", async ({ page }) => {
  await page.route("**/api/auth", async (route) => {
    expect(route.request().method()).toBe("PUT");
    await route.fulfill({
      status: 401,
      json: { message: "Invalid credentials" },
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email address").fill("d@jwt.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByText(/Invalid credentials/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Logout" })).not.toBeVisible();
});

test("registration requires the required fields", async ({ page }) => {
  await page.goto("/register");

  for (const selector of ["#name", "#email", "#password"]) {
    await expect(page.locator(selector)).toHaveAttribute("required", "");
  }

  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/register$/);
});

test("new diner can register", async ({ page }) => {
  const newDiner = {
    name: "New Test Diner",
    email: "new-diner@example.test",
    password: "test-password",
  };
  const token = "registration-test-token";

  await page.route("**/api/auth", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual(newDiner);

    await route.fulfill({
      json: {
        user: {
          id: "new-test-diner",
          name: newDiner.name,
          email: newDiner.email,
          roles: [{ role: "diner" }],
        },
        token,
      },
    });
  });

  await page.goto("/register");
  await page.getByPlaceholder("Full name").fill(newDiner.name);
  await page.getByPlaceholder("Email address").fill(newDiner.email);
  await page.getByLabel("Password").fill(newDiner.password);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register" })).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("token")))
    .toBe(token);
});

test("logging out clears the session", async ({ page }) => {
  const token = "logout-test-token";
  const diner = {
    id: "test-diner",
    name: "Test Diner",
    email: "d@jwt.com",
    roles: [{ role: "diner" }],
  };

  await page.addInitScript((savedToken) => {
    localStorage.setItem("token", savedToken);
  }, token);

  await page.route("**/api/user/me", async (route) => {
    await route.fulfill({ json: diner });
  });

  await page.route("**/api/auth", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    await route.fulfill({ json: {} });
  });

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();
  await page.getByRole("link", { name: "Logout" }).click();

  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Logout" })).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("token")))
    .toBeNull();
});

test("duplicate registration email is rejected", async ({ page }) => {
  await page.route("**/api/auth", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 409,
      json: { message: "Email already exists" },
    });
  });

  await page.goto("/register");
  await page.getByPlaceholder("Full name").fill("Existing User");
  await page.getByPlaceholder("Email address").fill("duplicate@example.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText(/Email already exists/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Logout" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
});

test("login handles backend outage gracefully", async ({ page }) => {
  await page.route("**/api/auth", async (route) => {
    expect(route.request().method()).toBe("PUT");
    await route.fulfill({
      status: 503,
      json: { message: "Service unavailable" },
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email address").fill("d@jwt.com");
  await page.getByLabel("Password").fill("diner");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByText(/Service unavailable/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Logout" })).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("token")))
    .toBeNull();
});

test("invalid or expired saved token is cleared on startup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "expired-token");
  });

  await page.route("**/api/user/me", async (route) => {
    await route.fulfill({
      status: 401,
      json: { message: "Session expired" },
    });
  });

  await page.goto("/");

  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Logout" })).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("token")))
    .toBeNull();
});

test("unauthorized users cannot access protected pages", async ({ page }) => {
  await page.goto("/diner-dashboard");

  await expect(page.getByText(/dropped a pizza on the floor/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your pizza kitchen" }),
  ).not.toBeVisible();
  await expect(page.getByText(/your pizza kitchen/i)).not.toBeVisible();
});

test("logout still clears local session when backend logout fails", async ({
  page,
}) => {
  const token = "logout-fallback-token";
  const diner = {
    id: "test-diner",
    name: "Test Diner",
    email: "d@jwt.com",
    roles: [{ role: "diner" }],
  };

  await page.addInitScript((savedToken) => {
    localStorage.setItem("token", savedToken);
  }, token);

  await page.route("**/api/user/me", async (route) => {
    await route.fulfill({ json: diner });
  });

  await page.route("**/api/auth", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    await route.fulfill({
      status: 500,
      json: { message: "Server error while logging out" },
    });
  });

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();
  await page.getByRole("link", { name: "Logout" }).click();

  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Logout" })).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("token")))
    .toBeNull();
});

test("malformed email is rejected by browser validation", async ({ page }) => {
  await page.goto("/register");

  const emailInput = page.locator("#email");
  await emailInput.fill("not-an-email");

  await expect(emailInput).toHaveAttribute("type", "email");
  await expect
    .poll(async () => {
      return await emailInput.evaluate((element) => {
        const input = element as HTMLInputElement;
        return input.validity.valid;
      });
    })
    .toBe(false);
});
