-- Title, second line and wife's family name for volumes that were NOT read again (epic #58, step O-3).
-- The re-reading of 1938-1950 records these values itself (columns kind, title, alliance). For the older volumes
-- they are read out of the printed fields by rule; the printed text is not changed:
--   title     forms of address and titles at the start of the supplement or first-name field (Frau, Wwe., Dr. med.)
--   kind      'zusatz' if the supplement marks the private line of a subscriber (Wohnung, Privat, Appart.)
--   alliance  second half of a double name ("Buser-Hodel" -> Hodel), only if both halves occur often as surnames
--             on their own and neither is a word for a firm or society ("Amez-Droz", "Konsum-Verein" stay)
-- Only rows without any of the three values are touched, so it can be run again. Run it after importing volumes
-- in the old format. On production run it volume by volume (-v vol=<file>) with a VACUUM in between: one
-- statement over the whole table writes about 750,000 rows.
--   psql -v ON_ERROR_STOP=1 -f db/subscriber_info.sql                       all volumes (test database)
--   psql -v ON_ERROR_STOP=1 -v vol=P-260-1_2_1932 -f db/subscriber_info.sql  one volume
\if :{?vol}
\else
  \set vol %
\endif
-- how often a surname must stand alone (20 on production; the small test database sets less)
\if :{?min_count}
\else
  \set min_count 20
\endif
CREATE OR REPLACE FUNCTION pg_temp.o3_title(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim((regexp_match(t,
    '^((?:(?:Frau|Frl\.?|Fräulein|Wwe\.?|Witwe|Mme|Mlles?|Vve|Veuve|Sig\.ra|Sig\.na|Ved\.|Dr\.?(?: ?(?:med|phil|jur|iur|ing|rer|sc|theol|dent|vet|h\. ?c|oec|chem|pol|nat)\.?)*|Prof\.?|Pfr\.?|Dott\.?|Avv\.?)(?:,? +|,|$))+)'))[1], ' ,'), '')
$$;
--   o3_subline(text): true if the supplement marks the private line of a subscriber
CREATE OR REPLACE FUNCTION pg_temp.o3_subline(t text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT t ~* '^(Wohn(g|ung)\.?|Privat(wohn(g|ung))?\.?|Priv\.|Appart(ement)?\.?|Domicile|Dom\.|Abitazione|Abit\.)(,| |$)'
$$;

-- surnames that stand alone often enough to be one half of a double name; no words for firms and societies
CREATE TEMP TABLE o3_surnames AS
  SELECT entityname1 AS name FROM records
   WHERE entityname1 ~ '^[[:upper:]][[:alpha:]'']{2,}$'
     AND entityname1 !~* '^(Verband|Verein|Club|Klub|Union|Gesellschaft|Genossenschaft|Bank|Hotel|Hôtel|Garage|Bureau|Büro|Fabrik|Zentrale|Werke?|Institut|Schule|Kasse|Verwaltung|Office|Service|Dienst|Haus|Halle|Hof|Bad|Anstalt|Amt|Post|Bahn|Station|Zeitung|Verlag|Laden|Handlung|Geschäft|Magazin|Apotheke|Drogerie|Salon|Depot|Lager|Kommission|Sekretariat|Direktion|Société|Compagnie|Agence|Banque|Café|Restaurant|Pension|Kino|Theater|Konsum|Auto|Telephon|Elektro|Radio|Central|General|National|Suisse|Schweiz)$'
   GROUP BY 1 HAVING count(*) >= :min_count;
CREATE UNIQUE INDEX ON o3_surnames (name);
ANALYZE o3_surnames;
  UPDATE records r SET
         title = x.title, kind = CASE WHEN x.subline THEN 'zusatz' END, alliance = x.alliance
    FROM (SELECT r2.ctid AS id,
                 coalesce(pg_temp.o3_title(r2.supplement), pg_temp.o3_title(r2.entityname2)) AS title,
                 pg_temp.o3_subline(r2.supplement) AS subline,
                 CASE WHEN a.name IS NOT NULL AND b.name IS NOT NULL THEN m.parts[2] END AS alliance
            FROM records r2
            LEFT JOIN LATERAL (SELECT regexp_match(r2.entityname1, '^([[:upper:]][[:alpha:]'']{2,})-([[:upper:]][[:alpha:]'']{2,})$') AS parts) m ON true
            LEFT JOIN o3_surnames a ON a.name = m.parts[1]
            LEFT JOIN o3_surnames b ON b.name = m.parts[2]
           WHERE r2.file LIKE :'vol' AND r2.entityname1 IS NOT NULL AND r2.kind IS NULL AND r2.title IS NULL AND r2.alliance IS NULL) x
   WHERE r.ctid = x.id AND r.file LIKE :'vol' AND (x.title IS NOT NULL OR x.subline OR x.alliance IS NOT NULL);
