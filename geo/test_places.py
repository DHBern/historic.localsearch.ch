"""Checks of the place resolver.  python3 -m unittest discover -s geo"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import collections, contextlib, csv, io, sys, tempfile
import build_places
from build_places import Resolver, confidence, net_parts, by_network
import build_streets

R = Resolver()


def where(raw):
    cand, how = R.resolve(raw)
    return (R.mun[cand["bfs_today"].split(";")[0]][0], cand["canton"], how) if cand else (None, None, how)


class Places(unittest.TestCase):
    def test_a_string_the_register_does_not_know_is_read_another_way(self):              # #27
        self.assertEqual(where("Allmenden siehe Erlenbach i.")[::2], ("Erlenbach im Simmental", "exchange-only"))
        self.assertEqual(where("La Toulière (voir sous Charmoille)")[2], "exchange-only")
        self.assertEqual(where("Stammheim, Ober-")[1:], ("ZH", "name"))                  # Oberstammheim
        self.assertEqual(where("Tour-de-Peilz, La")[1], "VD")
        self.assertEqual(where("Moutier Jura Bernois")[1:], ("BE", "name+canton"))
        self.assertEqual(where("Gossau St. Galien")[1], "SG")
        self.assertEqual(where("Scuol / Schuls")[1], "GR")
        self.assertEqual(where("Langnau i.")[0], "Langnau im Emmental")
        self.assertEqual(where("Schaan Fürstentum Liechtenstein")[2], "out-of-region")

    def test_another_reading_is_not_forced(self):                                        # #27
        self.assertEqual(where("Bussy s. Ms")[2], "unknown")             # "s." is "sur" here, no reference
        self.assertEqual(where("Bach i.")[2], "unknown")                 # no single place goes on with "i..."
        self.assertEqual(where("Frau")[2], "unknown")

    def test_a_hamlet_is_placed_if_it_is_the_only_one_of_its_name(self):                 # #27
        self.assertEqual(where("Kronbühl"), ("Wittenbach", "SG", "weiler"))
        self.assertEqual(where("Räterschen")[:2], ("Elsau", "ZH"))
        self.assertEqual(where("Medikon (Oberwetzikon)"), ("Wetzikon (ZH)", "ZH", "weiler+exchange"))
        self.assertEqual(build_places.confidence("weiler"), "medium")
        self.assertEqual(where("Klösterli, siehe Neukirch i.")[::2], ("Egnach", "exchange-only"))   # ten hamlets of the name
        self.assertEqual(where("Vorstadt")[2], "unknown")                # many of them, nothing to decide by
        self.assertEqual(where("Oberbottigen, Netz Riedbach")[:2], ("Bern", "BE"))   # both decided by hand (#27)
        # nothing the register placed before is touched: the hamlets are asked last
        self.assertEqual(where("Marin-Epagnier")[2], "name")

    def test_a_canton_is_not_given_up_for_an_abbreviated_longer_name(self):              # #73
        self.assertEqual(where("Biel Be")[1], "BE")                                      # not Biel-Benken
        self.assertEqual(where("Brienz, B.")[:2], ("Brienz (BE)", "BE"))                 # not Brienz/Brinzauls
        self.assertEqual(where("Beinwil a. S.")[:2], ("Beinwil am See", "AG"))           # "S." is no canton here
        self.assertEqual(where("Oberhofen a. Th.")[0], "Oberhofen am Thunersee")

    def test_the_area_of_a_volume_is_its_places_with_a_margin(self):                     # #73
        counts = {"Bern": 3000, "Thun": 300, "Spiez": 50, "Wileroltigen": 5, "Kerzers": 5, "Erlenbach": 5, "Lugano": 3,
                  "Kerzcers": 2}
        with tempfile.TemporaryDirectory() as d:
            with open(d + "/c.tsv", "w", encoding="utf-8") as f:
                for loc, n in counts.items(): f.write(f"{loc}\tv\t1947\t{n}\n")
            argv, sys.argv = sys.argv, ["build_places.py", d + "/c.tsv", d]
            try:
                with contextlib.redirect_stdout(io.StringIO()): build_places.main()
            finally: sys.argv = argv
            got = {r["locality"]: (r["municipality"], r["canton"], r["method"])
                   for r in csv.DictReader(open(d + "/places.tsv", encoding="utf-8"), delimiter="\t", quoting=csv.QUOTE_NONE)}
        self.assertEqual(got["Kerzers"], ("Kerzers", "FR", "name"))                      # Fribourg, next to the Bern places
        self.assertEqual(got["Erlenbach"], ("Erlenbach im Simmental", "BE", "namensanfang+volume"))   # not the one in Zürich
        self.assertEqual(got["Lugano"][2], "out-of-region")                              # far away stays out
        self.assertEqual(got["Kerzcers"][2], "out-of-region")                             # no similar spelling on the edge

    def test_network_of_the_entry(self):                                                 # #71
        self.assertEqual(net_parts("Aarg."), ("AG", "", "Aarg"))
        self.assertEqual(net_parts("(AARG.) 064"), ("AG", "064", "AARG"))
        self.assertEqual(net_parts("St. G."), ("SG", "", "St. G"))
        self.assertEqual(net_parts("061"), ("", "061", ""))
        self.assertEqual(net_parts("Gr")[0], "")                                         # "Gruppe", not Graubünden
        self.assertEqual(net_parts("Egnach"), ("", "", "Egnach"))

    def test_a_name_twice_in_a_volume_is_decided_by_the_network(self):                   # #71
        cand, how = R.resolve("Reinach"); alts = list(R.alts)
        self.assertEqual(how, "ambiguous")
        basel = R.resolve("Basel")[0]
        first = {"Reinach": (None, "ambiguous", alts), "Basel": (basel, "name", [])}
        final = [("Reinach", "v", 1946, 9, None, "ambiguous"), ("Basel", "v", 1946, 40, basel, "name")]
        with tempfile.TemporaryDirectory() as d:
            with open(d + "/n.tsv", "w", encoding="utf-8") as f:
                f.write("Reinach\tv\tAarg.\t3\nReinach\tv\tBld.\t2\nReinach\tv\t061\t3\nReinach\tv\t099\t1\nBasel\tv\t061\t40\n")
            rep = by_network(R, d + "/n.tsv", final, first, d, collections.defaultdict(collections.Counter))
            got = {l.split("\t")[2]: (l.split("\t")[6], l.split("\t")[11]) for l in open(d + "/places_net_load.tsv", encoding="utf-8")}
        self.assertEqual(got, {"Aarg.": ("AG", "name+canton"), "Bld.": ("BL", "name+canton"), "061": ("BL", "name+code")})
        self.assertEqual((rep["placed"], rep["open code"]), (8, 1))                      # an unknown code decides nothing
        self.assertEqual(confidence("name+code"), "medium")

    def test_entries_without_a_network_go_to_the_far_larger_place(self):                 # #71
        R.resolve("Teufen"); alts = list(R.alts)
        first = {"Teufen": (None, "ambiguous", alts)}
        final = [("Teufen", f"P-260-1_3_{y}", y, n, None, "ambiguous") for y, n in ((1940, 400), (1946, 420), (1941, 10))]
        weight = collections.defaultdict(lambda: collections.Counter({"ZH": 500, "AR": 500}))
        with tempfile.TemporaryDirectory() as d:
            with open(d + "/n.tsv", "w", encoding="utf-8") as f:
                f.write("Teufen\tP-260-1_3_1946\tApp.\t400\nTeufen\tP-260-1_3_1946\tZch.\t20\n")
            rep = by_network(R, d + "/n.tsv", final, first, d, weight)
            got = {(l.split("\t")[1][-4:], l.split("\t")[2]): (l.split("\t")[6], l.split("\t")[11]) for l in open(d + "/places_net_load.tsv", encoding="utf-8")}
        self.assertEqual(got[("1940", "")], ("AR", "name+size"))                         # 400 entries: not the hamlet of 20
        self.assertNotIn(("1941", ""), got)                                              # 10 entries could be either
        self.assertEqual(rep["method name+size"], 400)
        self.assertEqual(confidence("name+size"), "medium")

    def test_names_decided_by_hand(self):                                                # #27, ref/printed_names.csv
        self.assertEqual(where("Schönbühl"), ("Urtenen-Schönbühl", "BE", "alias"))
        self.assertEqual(where("Rigi"), ("Arth", "SZ", "alias"))
        self.assertEqual(where("Klus")[:2], ("Balsthal", "SO"))
        self.assertEqual(where("Frutt, Netz Melchthal")[:2], ("Kerns", "OW"))             # not the Frutt in Nidwalden
        self.assertEqual(where("Stein a. Rh.")[:2], ("Stein am Rhein", "SH"))             # no canton "A. Rh." read into it
        self.assertEqual(where("Oberwil B.-L.")[1:], ("BL", "name+canton"))
        self.assertEqual(where("Wangen a. Aare")[:2], ("Wangen an der Aare", "BE"))
        self.assertEqual(where("Frauenfeld Gruppe")[:2], ("Frauenfeld", "TG"))            # the heading went on
        for r in csv.DictReader(open(build_places.REF / "printed_names.csv", encoding="utf-8")):
            cand, how = R.resolve(r["printed"])
            self.assertTrue(cand and cand["canton"] == r["canton"] and how == "alias", r["printed"])

    def test_a_hamlet_near_the_exchange_is_better_than_the_exchange(self):               # #27
        self.assertEqual(where("Kunkels (Vättis)"), ("Tamins", "GR", "weiler+exchange"))
        self.assertEqual(confidence("weiler+exchange"), "medium")

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
        self.assertEqual(where("Lengnau B. Biel")[:2], ("Lengnau (BE)", "BE"))            # #72: a capital B.
        self.assertEqual(where("Lengnau, bei Biel")[:2], ("Lengnau (BE)", "BE"))
        self.assertEqual(where("Rickenbach b. W'thur")[:2], ("Rickenbach (ZH)", "ZH"))
        self.assertEqual(where("Rothenfluh, B. L.")[:2], ("Rothenfluh", "BL"))            # Baselland, no "bei"

    def test_bei_with_an_unknown_hamlet_is_shown_at_the_town(self):                       # #72
        self.assertEqual(where("Papiermühle b. Bern"), ("Ittigen", "BE", "alias+exchange"))   # decided by hand (#27)
        self.assertEqual(where("Reichenbach b. Bern"), ("Bern", "BE", "bei-only"))        # not the one in the Kandertal
        self.assertEqual(where("Glaris b. Davos"), ("Davos", "GR", "alias+exchange"))    # Davos Glaris, by hand (#27)
        self.assertEqual(where("Stalden b. Brugg"), ("Brugg", "AG", "bei-only"))          # Brugg, not Brügg
        self.assertEqual(where("Weiern b. Züberwangen (Zuzwil)")[:2], ("Zuzwil (SG)", "SG"))
        self.assertEqual(where("Kronbühl b. St. Galien"), ("St. Gallen", "SG", "unscharf+bei-only"))
        self.assertEqual(confidence("bei-only"), "medium")
        self.assertEqual(confidence("unscharf+bei-only"), "low")
        # a similar spelling far from the exchange is no find: the entry stays at the exchange
        self.assertEqual(where("Schwanden b. Goldbach (Lützelflüh-Goldbach)")[:2], ("Lützelflüh", "BE"))
        self.assertEqual(where("Ottikon b. Gossau (Gossau, Zch.)")[:2], ("Gossau (ZH)", "ZH"))   # no Ottikon bei Kemptthal

    def test_exchange_with_a_joined_name(self):                                           # #72
        self.assertEqual(where("Oberdettigen (Wohlen b. B.)"), ("Wohlen bei Bern", "BE", "weiler+exchange"))   # the hamlet is known
        self.assertEqual(where("Grimmialp (Erlenbach i. S.)")[:2], ("Erlenbach im Simmental", "BE"))
        self.assertEqual(where("Ebligen (Brienz, B.)")[:2], ("Oberried am Brienzersee", "BE"))   # the hamlet itself
        self.assertEqual(where("Husen b. Lengnau (Lengnau, A.)")[1], "AG")

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
