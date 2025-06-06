describe('Google Homepage', () => {
  beforeAll(async () => {
    await page.goto('https://www.google.com');
  });

  it('should display the Google logo', async () => {
    const logo = await page.$('img[alt="Google"]');
    expect(logo).toBeTruthy();
  });

  it('should have a search input field', async () => {
    const searchInput = await page.$('textarea[name="q"], input[name="q"]');
    expect(searchInput).toBeTruthy();
  });

  it('should have the title "Google"', async () => {
    const title = await page.title();
    expect(title).toBe('Google');
  });

  it('should contain text "Google" on the page', async () => {
    const content = await page.content();
    expect(content).toContain('Google');
  });
});