import type { Page } from "@playwright/test";

type MockUser = {
  id?: string;
  name?: string;
  email?: string;
  roles?: { role: string; objectId?: string }[];
};

export async function mockSignedInUser(
  page: Page,
  user: MockUser,
  token: string,
) {
  await page.addInitScript((savedToken) => {
    localStorage.setItem("token", savedToken);
  }, token);
  await page.route("**/api/user/me", (route) =>
    route.fulfill({ json: user }),
  );
}