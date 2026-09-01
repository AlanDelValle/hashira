import { expect, test, type Page } from '@playwright/test';

/**
 * Register → create a project → draw a wall → reload → the wall is still there.
 *
 * The one path that touches everything: session authentication, the projects API, the canvas
 * and its input controller, the command bus, autosave, and the document coming back out of a
 * jsonb column intact. Each of those is tested on its own elsewhere; none of those tests can
 * tell you that a person can draw a wall and still have it tomorrow.
 *
 * The drawing is never inspected as pixels. What the canvas shows is checked through the
 * things around it that name what is on the sheet — the empty-sheet message, and the
 * properties panel once something is selected — because a screenshot comparison would fail
 * for every reason except the one that matters.
 */

test('a wall drawn in a new project is still there after a reload', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.test`;

    await register(page, email);
    await createProject(page, 'Ground floor');

    const canvas = page.locator('canvas').first();

    await expect(page.getByText('This sheet is empty.')).toBeVisible();

    await drawAWall(page);

    await expect(page.getByText('This sheet is empty.')).toBeHidden();

    // Autosave debounces, so the reload has to wait for it rather than race it — which is the
    // whole point of the path: the wall has to survive leaving the browser, not just the tool.
    await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible({
        timeout: 15_000,
    });

    await page.reload();

    await expect(page.getByText('This sheet is empty.')).toBeHidden();

    /*
     * The drawing is framed to fit when it opens, so the centre of the canvas is the centre of
     * what was drawn — which for one wall is a point on it. Clicking there selects it, and the
     * properties panel is where the drawing says what it is holding.
     */
    const box = await canvas.boundingBox();

    expect(box).not.toBeNull();

    if (box === null) return;

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // Scoped to the panel: "Wall" is also the name of the tool that drew it, and the question
    // here is what the drawing is holding, not what is on the toolbar.
    const properties = page.getByRole('complementary', { name: 'Drawing' });

    await expect(properties.getByText('Wall', { exact: true })).toBeVisible();
});

async function register(page: Page, email: string): Promise<void> {
    await page.goto('/register');

    await page.getByLabel('Name').fill('Ada');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('drafting-table');
    await page.getByLabel('Confirm password').fill('drafting-table');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/projects$/);
}

async function createProject(page: Page, name: string): Promise<void> {
    await page.getByRole('button', { name: 'New project' }).first().click();
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create' }).click();

    // The editor route is the project id, so landing on it is the drawing having been created.
    await expect(page).toHaveURL(/\/projects\/[0-9A-Za-z]+$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
}

/**
 * Two clicks with the wall tool, and Escape to stop.
 *
 * Walls are drawn as a chain — each click ends one and starts the next from the same corner —
 * so a wall is two clicks and then saying you are done.
 */
async function drawAWall(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Wall' }).click();

    const box = await page.locator('canvas').first().boundingBox();

    expect(box).not.toBeNull();

    if (box === null) return;

    const y = box.y + box.height / 2;

    await page.mouse.click(box.x + box.width / 2 - 200, y);
    await page.mouse.click(box.x + box.width / 2 + 200, y);
    await page.keyboard.press('Escape');
}
