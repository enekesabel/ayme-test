# Publishing Guide for @qaide/test

This guide walks you through publishing `@qaide/test` to npm for the first time and managing future releases.

## Prerequisites

- Node.js 20+ installed
- pnpm installed
- An npm account

---

## Part 1: Initial Setup (One-time)

### Step 1: Create an npm Account

1. Go to [npmjs.com/signup](https://www.npmjs.com/signup)
2. Create an account (you can use GitHub OAuth for convenience)
3. Verify your email address

### Step 2: Create the @qaide Organization

For scoped packages like `@qaide/test`, you need an npm organization:

1. Log in to [npmjs.com](https://www.npmjs.com)
2. Click your profile icon → "Add Organization"
3. Enter organization name: `qaide`
4. Choose a plan:
   - **Free**: Unlimited public packages (recommended for open source)
   - **Paid**: If you want private packages later
5. Complete the setup

> **Note**: Organization names are first-come-first-served. If "qaide" is taken, you'll need an alternative (e.g., `qaide-hq`, `qaide-dev`).

### Step 3: Log in to npm from Terminal

```bash
npm login
```

You'll be prompted for:
- Username
- Password
- Email
- One-time password (if 2FA is enabled)

Verify you're logged in:

```bash
npm whoami
```

### Step 4: Verify Organization Access

```bash
npm org ls qaide
```

This should show you as a member.

---

## Part 2: Publishing

### Before Publishing Checklist

- [ ] Update version in `package.json` if needed
- [ ] README.md is complete and accurate
- [ ] LICENSE file is present
- [ ] All tests pass (if you add tests later)
- [ ] Build succeeds: `pnpm build`

### First-Time Publish

For scoped packages, you need to explicitly make it public:

```bash
# From the repository root
cd .

# Build the package
pnpm build

# Publish (--access public is required for scoped packages on free tier)
npm publish --access public
```

### Verifying Publication

After publishing:
1. Visit https://www.npmjs.com/package/@qaide/test
2. Try installing in another project: `npm install @qaide/test`

---

## Part 3: Releasing Updates

### Semantic Versioning

Follow [semver](https://semver.org/) for version numbers:
- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features, backward compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward compatible

### Release Process

1. **Update the version**:
   ```bash
   # Patch release (bug fixes)
   npm version patch
   
   # Minor release (new features)
   npm version minor
   
   # Major release (breaking changes)
   npm version major
   ```

2. **Build the package**:
   ```bash
   pnpm build
   ```

3. **Publish**:
   ```bash
   npm publish
   ```

4. **Push git tags** (if using git):
   ```bash
   git push --tags
   ```

---

## Part 4: Advanced Topics

### Setting Up npm Token for CI/CD

For automated publishing (GitHub Actions, etc.):

1. Generate a token on npmjs.com:
   - Profile → Access Tokens → Generate New Token
   - Choose "Automation" type
   - Copy the token

2. Add to your CI secrets (e.g., GitHub):
   - Repository Settings → Secrets → New repository secret
   - Name: `NPM_TOKEN`
   - Value: (paste token)

3. Use in CI workflow:
   ```yaml
   - name: Publish to npm
     run: npm publish
     env:
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```

### Deprecating a Version

If you publish a broken version:

```bash
npm deprecate @qaide/test@1.0.0 "This version has a critical bug, please upgrade"
```

### Unpublishing (Use with Caution!)

You can only unpublish within 72 hours of publishing:

```bash
npm unpublish @qaide/test@1.0.0
```

> ⚠️ **Warning**: Unpublishing can break other people's projects. Prefer deprecation.

### Two-Factor Authentication (Recommended)

Enable 2FA for security:
1. Profile → Account → Two-Factor Authentication
2. Enable for "Authorization and Publishing"

---

## Part 5: Package.json Reference

Key fields for npm publishing (already configured):

```json
{
  "name": "@qaide/test",                    // Scoped package name
  "version": "0.1.0-beta.0",              // Current version
  "type": "module",                        // ESM by default
  "files": ["dist"],                       // What gets published
  "exports": {                             // Subpath exports (no bare import)
    "./primitives": { "import": { ... }, "require": { ... } },
    "./playwright": { "import": { ... }, "require": { ... } },
    "./playwright/pom": { "import": { ... }, "require": { ... } },
    "./playwright/reporter": { "import": { ... }, "require": { ... } }
  },
  "peerDependencies": {                    // User must install these
    "@playwright/test": ">=1.40.0"
  },
  "license": "MIT",                        // Open source license
  "repository": { ... },                   // Link to source code
  "keywords": [ ... ]                      // Help with npm search
}
```

---

## Quick Reference Commands

```bash
# Build the package
pnpm build

# Publish (first time)
npm publish --access public

# Publish (subsequent)
npm publish

# Bump version
npm version patch|minor|major

# Check what will be published
npm pack --dry-run

# View published package info
npm info @qaide/test
```

---

## Troubleshooting

### "You must sign up for private packages"
Add `--access public` to your publish command.

### "npm ERR! 403 Forbidden"
- Check you're logged in: `npm whoami`
- Check you have org access: `npm org ls qaide`
- Verify the package name isn't taken: `npm info @qaide/test`

### "npm ERR! 402 Payment Required"
Scoped packages default to private. Use `--access public`.

### Organization name "qaide" is taken
Choose an alternative like:
- `@qaide-dev/test`
- `@qaide-hq/test`
- `@useqaide/test`

Then update `package.json` accordingly.

---

## Next Steps After First Publish

1. **Add badges to README**:
   ```markdown
   [![npm version](https://badge.fury.io/js/%40qaide%2Ftest.svg)](https://www.npmjs.com/package/@qaide/test)
   ```

2. **Set up GitHub Actions** for automated testing and publishing

3. **Create a CHANGELOG.md** to track changes

4. **Add more documentation** as the API grows

---

Happy publishing! 🚀
