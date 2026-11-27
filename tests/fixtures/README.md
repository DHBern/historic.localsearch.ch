# Test fixture

`records.tsv` holds 3,632 real rows of the production table, chosen so that the
cases the tests need are present:

| What                                   | Why                                                   |
| -------------------------------------- | ----------------------------------------------------- |
| `P-260-1_Zuerich_1880` (all 99 rows)   | the first phone book; entries with fields             |
| `P-260-1_Bern_1882_2`                  | rows with fields and with page text                   |
| `P-260-1_Genève_1902` (all 279 rows)   | volume name with a decomposed accent                  |
| every row with "Hodel" in name or text | 3,092 hits, more than the old 2,500-row cap           |
| `P-260-1_3_1936`, page 900             | Zürich entries with a wrong locality (#19)            |
| `P-260-1_1_1945`, page 400             | 1938–1950: text fragments without fields              |
| `records_reinach.tsv` (6 rows, 1946)   | Reinach in Aargau and Baselland, one volume (#71)     |
| `records_approx.tsv` (6 rows)          | "Hodei" misread for "Hodel": approximate search (#26) |

The phone books are public; the rows are the ones the live site shows.

`./load.sh` creates the table, loads the rows and builds the indexes.
