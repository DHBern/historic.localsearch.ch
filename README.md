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

## Tables built from `records`

Two small tables are derived from `records` and have to be rebuilt after every import or correction of it. Both
scripts replace the whole content and can be run again at any time.

| Table                                                                             | Read by                                                                  | Rebuild                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `volumes`                                                                         | the coverage page (`/coverage`)                                          | `psql -v ON_ERROR_STOP=1 -f db/volumes.sql`                                     |
| `books`, `book_files`                                                             | the limit of a search to a book (#50)                                    | `psql -v ON_ERROR_STOP=1 -f db/books.sql`, after `db/volumes.sql`               |
| `place_codes`, `code_years`                                                       | the limit of a search to an area code (#50)                              | `psql -v ON_ERROR_STOP=1 -f db/area_codes.sql`, after `geo/build.sh`            |
| `place_year`, `municipalities`                                                    | the map of the network per year (`/map`, #6)                             | `psql -v ON_ERROR_STOP=1 -f db/place_year.sql`, after `geo/build.sh`            |
| `places`                                                                          | the map of search results (epic #42)                                     | `geo/build.sh`                                                                  |
| `streets`                                                                         | street points on that map, for the towns in `geo/street_towns.txt` (#46) | `geo/build.sh` (same run)                                                       |
| columns `title`, `kind`, `alliance` of `records`, for volumes in the old format   | the field search (wife's family name, second lines)                      | `psql -f db/subscriber_info.sql`, volume by volume on production (see the file) |
| `occupation_register`, `occupation_map` and the column `occupations` of `records` | the occupation search (#58)                                              | `occ/build.sh`, then `occ/fill_all.sh` (volume by volume)                       |

`geo/build.sh` needs `psql` and `python3` (standard library only) and takes the connection from the usual `PG*`
variables. It exports the locality strings per volume, resolves them to municipalities of today with
`geo/build_places.py`, and loads the result with `db/places.sql`. The place register it uses lies in `geo/ref/`:
the official directory of localities of swisstopo and the municipalities of 1914 from the historicised register
of the Federal Statistical Office, both taken from [vernetzte-schweiz](https://github.com/thodel/vernetzte-schweiz)
(`data/ref`, CC0), as is the name matching in `geo/gazetteer.py` (MIT). What the builder could not place, and why,
is in `geo/out/places.tsv` after a run.

Street points come from the official directory of streets of swisstopo (source: Federal Office of Topography
swisstopo). `geo/ref/streets_official.csv` holds the streets of the listed towns only; after adding a town, download
the directory and run `python3 geo/ref_streets.py <file>`, then `geo/build.sh`.

The occupation register is `occ/register.tsv`: one row per normalised occupation or trade, with one of 16 coarse
classes, its name in German, French and Italian, and a pattern of stems and abbreviations. `occ/register.py` matches
it against the supplement field; `python3 -m unittest discover -s occ` checks it. To add or correct an occupation,
edit the table, run the tests, then `occ/build.sh` and `occ/fill_all.sh`.
