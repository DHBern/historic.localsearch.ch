"""Checks of the place resolver.  python3 -m unittest discover -s geo"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_places import Resolver, confidence
import build_streets

R = Resolver()


def where(raw):
    cand, how = R.resolve(raw)
    return (R.mun[cand["bfs_today"].split(";")[0]][0], cand["canton"], how) if cand else (None, None, how)


class Places(unittest.TestCase):
    def test_plain_and_upper_case(self):
        self.assertEqual(where("Zürich")[:2], ("Zürich", "ZH"))
        self.assertEqual(where("GENÈVE")[:2], ("Genève", "GE"))

    def test_canton_hint(self):
        self.assertEqual(where("Buchs St. G.")[1], "SG")
        self.assertEqual(where("Teufen Appenzell")[1], "AR")
        self.assertEqual(where("Haslen, App. I.-Rh. (Teufen)")[1], "AI")
        # the abbreviations of the volumes of 1938-1950
        self.assertEqual(where("Lachen Schw")[:2], ("Lachen", "SZ"))
        self.assertEqual(where("Oberwil Bld")[:2], ("Oberwil (BL)", "BL"))
        self.assertEqual(where("Altdorf Uri")[:2], ("Altdorf (UR)", "UR"))

    def test_bei_names_the_town_nearby(self):
        self.assertEqual(where("Lengnau b. Biel")[:2], ("Lengnau (BE)", "BE"))
        self.assertEqual(where("Rohrbach b. Huttwil")[:2], ("Rohrbach", "BE"))
        self.assertEqual(where("Staad bei Rorschach")[:2], ("Thal", "SG"))
        self.assertEqual(where("Muri b. Bern"), ("Muri bei Bern", "BE", "name"))          # a name of its own
        self.assertEqual(where("Papiermühle b. Bern")[2], "unknown")                      # not shown in Bern

    def test_spelling_as_printed(self):
        self.assertEqual(where("Brugg")[:2], ("Brugg", "AG"))
        self.assertEqual(where("Brügg")[:2], ("Brügg", "BE"))
        self.assertEqual(where("Aegerten Netz Brugg")[:2], ("Aegerten", "BE"))            # the exchange is Brügg
        self.assertEqual(where("St-Aubin")[2], "ambiguous")

    def test_edge_of_a_postcode_area_is_no_second_place(self):
        self.assertEqual(where("Engelberg")[:2], ("Engelberg", "OW"))
        self.assertEqual(where("Urnäsch")[:2], ("Urnäsch", "AR"))
        self.assertEqual(where("Teufen")[2], "ambiguous")                                 # Appenzell or Zürich
        self.assertEqual(where("Altdorf")[:2], ("Altdorf (UR)", "UR"))
        self.assertEqual(where("Altdorf (Schaffh.)")[1], "SH")
        self.assertEqual(where("Bürglen, U. (Altdorf)")[:2], ("Bürglen (UR)", "UR"))

    def test_exchange_picks_the_near_place(self):
        self.assertEqual(where("Trimstein, Netz Worb"), ("Münsingen", "BE", "name+exchange"))
        # the hamlet is not in the register: shown at its exchange
        self.assertEqual(where("Göscheneralp (Andermatt)"), ("Andermatt", "UR", "exchange-only"))

    def test_abbreviation_and_alias(self):
        self.assertEqual(where("Langnau i. E.")[0], "Langnau im Emmental")
        self.assertEqual(where("Muri b. Bern")[0], "Muri bei Bern")
        self.assertEqual(where("Biel-Bienne")[:2], ("Biel/Bienne", "BE"))

    def test_one_town_over_two_municipalities_is_one_place(self):
        self.assertEqual(where("Olten")[:2], ("Olten", "SO"))
        # a postcode area over several municipalities: the one that holds most of it
        self.assertEqual(where("Corcelles Ntel")[:2], ("Neuchâtel", "NE"))
        self.assertEqual(where("Gümligen")[:2], ("Muri bei Bern", "BE"))
        self.assertEqual(where("Glattbrugg")[:2], ("Opfikon", "ZH"))

    def test_places_known_only_with_their_canton(self):
        self.assertEqual(where("St-Aubin Ntel")[:2], ("La Grande Béroche", "NE"))
        self.assertEqual(where("Bémont Ntel")[:2], ("La Brévine", "NE"))
        self.assertEqual(where("St-Martin Ntel")[:2], ("Val-de-Ruz", "NE"))
        self.assertEqual(where("St-Aubin")[2], "ambiguous")           # Fribourg or Neuchâtel

    def test_the_exchange_with_its_canton(self):
        # two exchanges of one name: the canton printed with it decides
        self.assertEqual(where("Fresens (St-Aubin, N.)")[:2], ("La Grande Béroche", "NE"))
        self.assertEqual(where("Dreibrunnen (Wil, St. G.)"), ("Wil (SG)", "SG", "exchange-only"))
        # an abbreviation in brackets is the canton, a town in brackets is the exchange
        self.assertEqual(where("Wald (Zch.)")[:2], ("Wald (ZH)", "ZH"))
        self.assertEqual(where("Littau (Luzern)")[:2], ("Luzern", "LU"))
        self.assertEqual(where("Hilterfingen (Oberhofen a. Th.)")[:2], ("Hilterfingen", "BE"))   # am Thunersee, not Thurgau

    def test_near_the_exchange_is_not_the_nearest_sliver(self):
        self.assertEqual(where("Ostermundigen (Bern)")[:2], ("Ostermundigen", "BE"))
        self.assertEqual(where("St. Margarethen (Münchwilen, Th.)")[:2], ("Münchwilen (TG)", "TG"))
        self.assertEqual(where("Eriswil (Huttwil)")[:2], ("Eriswil", "BE"))

    def test_two_municipalities_of_one_name_side_by_side(self):
        # Erlinsbach AG and Erlinsbach SO (until 2005 Nieder- and Obererlinsbach) touch each other
        self.assertEqual(where("Erlinsbach")[:2], ("Erlinsbach (AG)", "AG"))
        self.assertEqual(where("Erlinsbach (Aarau)")[:2], ("Erlinsbach (AG)", "AG"))
        self.assertEqual(where("Niedererlinsbach (Aarau)")[:2], ("Erlinsbach (SO)", "SO"))

    def test_no_guessing(self):
        self.assertEqual(where("Kilchberg")[2], "ambiguous")          # Baselland or Zürich: the volume decides
        self.assertEqual(where("Fernkennzahl")[2], "unknown")
        self.assertEqual(where("Schaan Fürstentum Liechtenstein")[0], None)

    def test_a_similar_name_must_be_near_its_exchange(self):
        # Dättwil (Baden) resembles "Dätwil", but is far from Andelfingen
        self.assertEqual(where("Dätwil (Andelfingen)")[2], "exchange-only")

    def test_confidence(self):
        self.assertEqual([confidence(h) for h in ("name+canton", "name+volume", "unscharf+exchange")], ["high", "medium", "low"])


class Streets(unittest.TestCase):
    def test_the_street_name_in_a_street_field(self):
        c = build_streets.clean
        self.assertEqual(c("Forchstr. 381"), "Forchstrasse")
        self.assertEqual(c("Bahnhofstrasse 21 1/2"), "Bahnhofstrasse")
        self.assertEqual(c("Weiher- weg 54"), "Weiherweg")
        self.assertEqual(c("Briner-str. 1"), "Brinerstrasse")
        self.assertEqual(c("Junkerng. 50"), "Junkerngasse")
        self.assertEqual(c("Landenbergstr. 11/Kyburg- strasse"), "Landenbergstrasse")
        self.assertEqual(c("Stauffacherstr. 3"), "Stauffacherstrasse")
        self.assertIsNone(c("Zollstr. 24, W'thur"))          # a street of another place

    def test_spelling_does_not_matter_for_the_match(self):
        k = build_streets.key
        self.assertEqual(k("Forchstrasse"), k("Forchstr."))
        self.assertEqual(k("St. Jakobstrasse"), k("St.Jakob-Strasse"))

    def test_the_register_has_points_in_the_town(self):
        zh = build_streets.register()["261"]
        name, lat, lon = zh[build_streets.key("Bahnhofstrasse")]
        self.assertEqual(name, "Bahnhofstrasse")
        self.assertTrue(47.3 < lat < 47.45 and 8.4 < lon < 8.65)
        # every listed town has its streets
        reg = build_streets.register()
        self.assertEqual(reg["2701"][build_streets.key("Güterstr.")][0], "Güterstrasse")
        self.assertEqual(reg["351"][build_streets.key("Schwarztorstrasse")][0], "Schwarztorstrasse")


if __name__ == "__main__":
    unittest.main()
