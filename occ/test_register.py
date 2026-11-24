"""Checks of the occupation register.  python3 -m unittest discover -s occ"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from register import REG, match


class Register(unittest.TestCase):
    def test_spellings_abbreviations_and_languages_meet(self):
        for text in ("Landwirt", "Landw.", "agric.", "agriculteur", "agricoltore", "Gutsbesitzer"):
            self.assertEqual(match(text), ["landwirt"], text)
        for text in ("Hebamme", "sage-femme", "levatrice"):
            self.assertEqual(match(text), ["hebamme"], text)
        for text in ("Kfm.", "Kaufmann", "négt", "négociant", "negoziante"):
            self.assertEqual(match(text), ["kaufmann"], text)

    def test_occupation_and_trade_are_kept_apart(self):
        self.assertEqual(match("Metzger"), ["metzger"])
        self.assertEqual(match("Metzgerei"), ["metzgerei"])
        self.assertEqual(match("Bäckerei u. Konditorei"), ["baeckerei", "konditorei"])

    def test_narrow_occupations_are_not_swallowed(self):
        self.assertEqual(match("Zahnarzt"), ["zahnarzt"])
        self.assertEqual(match("Tierarzt"), ["tierarzt"])
        self.assertEqual(match("Bezirksarzt"), ["arzt"])
        self.assertEqual(match("Goldschmied"), ["goldschmied"])

    def test_addresses_notes_and_second_lines_are_skipped(self):
        self.assertEqual(match("Bäckerstr. 12"), [])
        self.assertEqual(match("Wohnung"), [])
        self.assertEqual(match("Kfm., Wohnung, Bahnhofstr. 3"), ["kaufmann"])
        self.assertEqual(match("Dr. med., prakt. Arzt (wenn keine Antwort 23.456)"), ["arzt"])
        self.assertEqual(match("Rest. Bahnhof"), ["gasthaus"])
        self.assertEqual(match("Mme, sage-femme, Chamufens"), ["hebamme"])

    def test_no_occupation_in_names_and_firm_endings(self):
        for text in ("& Cie", "fils", "Söhne", "Hans", "Carouge"):
            self.assertEqual(match(text), [], text)

    def test_a_family_name_is_no_occupation(self):
        self.assertEqual(match("Müller"), ["mueller"])
        self.assertEqual(match("Landw. u. Müller"), ["landwirt", "mueller"])
        for text in ("A. Müller", "Müller & Co", "vorm. Müller C.", "Chalet Müller", "Huber-Müller", "Nachf. J. Maurer"):
            self.assertEqual(match(text), [], text)
        self.assertEqual(match("Coiffure pour dames et messieurs (Müller, R.)"), [])
        self.assertEqual(match("J. Maurermeister"), ["baumeister"])
        self.assertEqual(match("Wagnerei u. Sportgesch."), ["wagner"])

    def test_words_that_only_look_like_an_occupation(self):
        # check of 24.11.2026 on production
        self.assertEqual(match("docteur, chem. du Mont-Blanc, 6"), ["arzt"])
        self.assertEqual(match("Dr. chem."), ["chemiker"])
        self.assertEqual(match("Färberei u. chem. Waschanstalt"), ["weberei", "waescherei"])
        self.assertEqual(match("eidg. dipl. Zahnarzt"), ["zahnarzt"])
        self.assertEqual(match("eidg. Beamter"), ["beamter"])
        self.assertEqual(match("E. Fabrikvertreter Gummi-Prod. en gros"), ["vertreter"])
        self.assertEqual(match("Fabrikant"), ["fabrikant"])
        self.assertEqual(match("Stellvertreter"), [])
        self.assertEqual(match("timbres-poste pr collect."), [])
        self.assertEqual(match("Rest. z. Post"), ["gasthaus"])
        self.assertEqual(match("Post u. Telegraph"), ["post"])
        self.assertEqual(match("Dr. med., Röntgeninstitut"), ["arzt"])
        self.assertEqual(match("Töchterinstitut"), ["schule"])
        self.assertEqual(match("Vorsteher d. Schweiz. Volksbank, Agentur Seefeld"), ["bank", "agentur"])
        self.assertEqual(match("Ortsvorsteher"), ["behoerde"])
        self.assertEqual(match("Bücherrevisor"), ["angestellter"])
        self.assertEqual(match("Textilwaren"), ["tuchhandlung"])
        self.assertEqual(match("Drechsler"), ["drechsler"])
        self.assertEqual(match("Küfer"), ["kuefer"])

    def test_a_public_call_station_is_no_post_office(self):
        # decision of 24.11.2026: a call station is a telephone line, not a trade
        for text in ("öffentl. Sprechstation", "öff. Sprechstat.", "Gemeindesprechstation", "öffentl.",
                     "station publique", "stazione pubblica", "téléphone public"):
            self.assertEqual(match(text), [], text)
        self.assertEqual(match("Gemeindesprechstation, Wirt"), ["wirt"])
        self.assertEqual(match("öffentl. Post u. Telegraph"), ["post"])
        self.assertEqual(match("Telegr. öff. Sprechstat."), ["post"])
        self.assertEqual(match("Postbureau"), ["post"])

    def test_the_register_is_well_formed(self):
        classes = {"medizin", "gast", "bank", "recht", "verkehr", "uhren", "textil", "lebensmittel", "bau", "industrie",
                   "druck", "bildung", "handwerk", "handel", "privat", "land"}
        self.assertEqual(len({r["id"] for r in REG}), len(REG))
        for r in REG:
            self.assertIn(r["class"], classes, r["id"])
            self.assertIn(r["kind"], ("beruf", "gewerbe"), r["id"])
            self.assertTrue(r["de"] and r["fr"] and r["it"], r["id"])
            self.assertRegex(r["id"], r"^[a-z_]+$")


if __name__ == "__main__":
    unittest.main()
