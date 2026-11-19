# historic.localsearch.ch

## Developing

Once you've installed dependencies with `pnpm install`, add the env file with the login data to the server (modify .env.example for this).

then, start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Testing

The tests run against a small test database, not against production. It holds
3,632 real rows (see [tests/fixtures](tests/fixtures/README.md)).

```bash
# once: start PostgreSQL 15 in Docker on port 55433 and load the fixture
pnpm test:db

pnpm test:unit   # search logic and the fixture itself
pnpm test:e2e    # builds the app and clicks through it in a browser
pnpm test        # both
```

The first `pnpm test:e2e` needs the browser: `pnpm exec playwright install chromium`.

To use the app by hand with the test data, copy `.env.test` to `.env` and run `pnpm dev`.

Without Docker, point `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`
and `DATABASE_PASSWORD` at any PostgreSQL 15 with `pg_trgm` and run `tests/fixtures/load.sh`;
the tests read the same variables.

Every pull request runs lint, type check and both test suites in GitHub Actions
(`.github/workflows/ci.yml`). Vercel also builds a preview of each pull request; the
preview uses the production database.
