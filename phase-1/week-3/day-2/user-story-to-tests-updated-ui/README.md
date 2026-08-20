# AI Extension Playwright TypeScript Runtime

A Playwright-based browser automation testing suite with TypeScript support, integrated with an AI code generator extension for automated test generation.

## Overview

This project provides a clean, maintainable Playwright + TypeScript runtime environment for running browser automation tests. It is designed to work seamlessly with the AI Extension code generator, which automatically produces Playwright test specs from captured DOM elements.

### Key Features

- **TypeScript First**: Full TypeScript support with strict type checking
- **Playwright**: Modern browser automation with Chromium, Firefox, and WebKit support
- **Test Organization**: Structured test directory with example specs
- **Headless & Headed Modes**: Run tests headless or with visual inspection
- **Test UI**: Interactive test exploration mode

## Prerequisites

- Node.js (v18 or later recommended)
- npm (comes with Node.js)

## Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Install Playwright browsers**:
   ```bash
   npx playwright install
   ```

   To install browsers with system dependencies (recommended on Linux):
   ```bash
   npx playwright install --with-deps
   ```

## Running Tests

### Run all tests (headless mode)
```bash
npm test
```

### Run tests with browser visible
```bash
npm run test:headed
```

### Run tests in interactive UI mode
```bash
npm run test:ui
```

### List all available tests
```bash
npx playwright test --list
```

### Run specific test file
```bash
npx playwright test tests/example.spec.ts
```

### Run tests in debug mode
```bash
npx playwright test --debug
```

## Project Structure

```
.
├── tests/                    # Test files directory
│   └── example.spec.ts      # Example Playwright test
├── playwright.config.ts     # Playwright configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Project dependencies and scripts
└── README.md              # This file
```

## Configuration

### Playwright Configuration

Edit `playwright.config.ts` to:
- Change the base URL for your application
- Configure timeouts and retry policies
- Add additional browser projects (Firefox, WebKit, etc.)
- Customize reporter output

### TypeScript Configuration

Edit `tsconfig.json` to adjust compiler options, including:
- Target ECMAScript version
- Module resolution strategy
- Strict type checking options

## Writing Tests

### Basic Test Example

```typescript
import { test, expect } from '@playwright/test';

test('user can navigate to homepage', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Example/);
});
```

### Locators

Playwright supports multiple locator strategies:

```typescript
// By role
await page.getByRole('button', { name: 'Submit' }).click();

// By label
await page.getByLabel('Username').fill('user');

// By placeholder
await page.getByPlaceholder('Enter password').fill('pass');

// By text
await page.getByText('Welcome').isVisible();

// CSS selector
await page.locator('.submit-btn').click();

// XPath
await page.locator('//button[@id="submit"]').click();
```

## CI/CD Integration

These tests are ready to run in continuous integration environments. Example GitHub Actions workflow:

```yaml
name: Playwright Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npx playwright install --with-deps
      - run: npm test
```

## Generated Tests from AI Extension

When using the AI Extension code generator:

1. Select DOM elements on the target page
2. Choose "TypeScript" and "Playwright" in the extension settings
3. Generate code from the captured DOM
4. Copy generated test file to `tests/` directory
5. Run tests with `npm test`

## Troubleshooting

### Browser Installation Issues

If you encounter browser installation errors:

```bash
# Clean cache
rm -rf node_modules .playwright

# Reinstall everything
npm install
npx playwright install --with-deps
```

### Timeout Errors

Adjust timeouts in `playwright.config.ts`:

```typescript
use: {
  timeout: 30_000,  // 30 seconds for each action
}
```

### Test Failures

Run in debug mode to step through tests:

```bash
npx playwright test --debug
```

## Best Practices

1. **Use semantic locators**: Prefer role, label, and text-based locators over CSS/XPath
2. **Wait explicitly**: Use Playwright's built-in waiting instead of hardcoded `sleep()`
3. **Test user workflows**: Focus on end-to-end user scenarios
4. **Keep tests isolated**: Each test should be independent
5. **Use fixtures**: Share common setup/teardown logic with Playwright fixtures

## Dependencies

- **@playwright/test**: ^1.49.1 - Playwright testing framework
- **@types/node**: ^22.10.2 - TypeScript Node.js types
- **typescript**: ^5.6.3 - TypeScript compiler

## License

See LICENSE file for details.

## Support

For issues or questions:
- Check [Playwright documentation](https://playwright.dev)
- Review test examples in `tests/` directory
- Consult the AI Extension documentation for code generation workflows

## Next Steps

1. Customize `playwright.config.ts` for your application's base URL
2. Replace `tests/example.spec.ts` with your own tests
3. Commit changes to version control
4. Set up CI/CD pipeline for automated testing

---

**Last Updated**: 2026-08-18
