"""Unit tests for the accent-combination rules in scripts/build_lexicon.py.

Run: /path/to/venv/bin/python -m unittest discover -s test -p 'test_*.py'   (from pitch/)
The integration tests at the bottom need fugashi + unidic-lite and are skipped without them.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import build_lexicon as bl  # noqa: E402


def part(surface, pos1, kana, aType=None, aConType="*", pos2="一般", pron=None):
    return {"surface": surface, "pos1": pos1, "pos2": pos2, "kana": kana,
            "pron": pron if pron is not None else kana,
            "aType": aType, "aConType": aConType}


class NounRules(unittest.TestCase):
    """UniDic manual table 10 (N1 = 3 morae, M1 = 1, M2 = 2)."""

    def test_table(self):
        self.assertEqual(bl.combine_noun("C1", 3, 1, 2), 5)  # N1 + M2
        self.assertEqual(bl.combine_noun("C2", 3, 1, 2), 4)  # N1 + 1
        self.assertEqual(bl.combine_noun("C3", 3, 1, 2), 3)  # N1
        self.assertEqual(bl.combine_noun("C4", 3, 1, 2), 0)  # flat
        self.assertEqual(bl.combine_noun("C5", 3, 1, 2), 1)  # M1

    def test_c1_needs_second_accent(self):
        self.assertIsNone(bl.combine_noun("C1", 3, 1, None))
        self.assertEqual(bl.combine_noun("C3", 3, 1, None), 3)

    def test_unknown_code(self):
        self.assertIsNone(bl.combine_noun("F2", 3, 1, 2))


class PrefixRules(unittest.TestCase):
    """UniDic manual table 11 (prefix N1 = 1, word N2 = 3)."""

    def test_p1(self):
        self.assertEqual(bl.combine_prefix("P1", 1, None, 3, 0), 0)
        self.assertEqual(bl.combine_prefix("P1", 1, None, 3, 3), 0)  # odaka counts as flat
        self.assertEqual(bl.combine_prefix("P1", 1, None, 3, 1), 2)

    def test_p2(self):
        self.assertEqual(bl.combine_prefix("P2", 1, None, 3, 0), 2)
        self.assertEqual(bl.combine_prefix("P2", 1, None, 3, 3), 2)
        self.assertEqual(bl.combine_prefix("P2", 1, None, 3, 2), 3)

    def test_p4_p6_p13_p14(self):
        self.assertEqual(bl.combine_prefix("P4", 2, 1, 3, 0), 3)
        self.assertEqual(bl.combine_prefix("P4", 2, 1, 3, 2), 1)
        self.assertEqual(bl.combine_prefix("P6", 3, None, 2, 1), 0)
        self.assertEqual(bl.combine_prefix("P13", 2, 1, 3, 2), 1)
        self.assertEqual(bl.combine_prefix("P14", 2, 1, 3, 0), 1)
        self.assertEqual(bl.combine_prefix("P14", 2, 1, 3, 2), 4)


class ConRuleParsing(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(bl.con_rule("C3", "名詞"), "C3")

    def test_pos_conditioned(self):
        acon = "動詞%F2@0,名詞%F1,形容詞%F2@-1"
        self.assertEqual(bl.con_rule(acon, "名詞"), "F1")
        self.assertEqual(bl.con_rule(acon, "動詞"), "F2@0")
        self.assertIsNone(bl.con_rule(acon, "副詞"))

    def test_missing(self):
        self.assertIsNone(bl.con_rule("*", "名詞"))
        self.assertIsNone(bl.con_rule("", "名詞"))


class SpecialMora(unittest.TestCase):
    def test_flags_use_pron_for_long_vowels(self):
        self.assertEqual(bl.special_flags("タンジョウ", "タンジョー"), [False, True, False, True])
        self.assertEqual(bl.special_flags("ミッ", "ミッ"), [False, True])

    def test_shift(self):
        flags = [False, True, False, True, False]  # た ん じょ う び
        self.assertEqual(bl.shift_off_special(4, flags), 3)
        self.assertEqual(bl.shift_off_special(2, flags), 1)
        self.assertEqual(bl.shift_off_special(3, flags), 3)
        self.assertEqual(bl.shift_off_special(0, flags), 0)
        self.assertEqual(bl.shift_off_special(5, flags), 5)


class CombineParts(unittest.TestCase):
    def test_noun_plus_suffix_c3(self):
        # 図書(1) + 館[C3] → N1 = 2
        ks, rule = bl.combine_parts([
            part("図書", "名詞", "トショ", [1], "C3"),
            part("館", "接尾辞", "カン", None, "C3", pos2="名詞的"),
        ])
        self.assertEqual(ks, [2])
        self.assertEqual(rule, "図書(1) + 館[C3]")

    def test_long_vowel_shift(self):
        # 誕生(0) + 日[C3] → 4 lands on the long-vowel mora → 3
        ks, _ = bl.combine_parts([
            part("誕生", "名詞", "タンジョウ", [0], "C2", pron="タンジョー"),
            part("日", "名詞", "ヒ", [0, 1], "C3"),
        ])
        self.assertEqual(ks, [3])

    def test_prefix(self):
        # お[P2] + 菓子(1) → N1 + M2 = 2;  お[P2] + 茶(0) → N1 + 1 = 2
        ks, rule = bl.combine_parts([part("お", "接頭辞", "オ", None, "P2"), part("菓子", "名詞", "カシ", [1], "C1")])
        self.assertEqual((ks, rule), ([2], "お[P2] + 菓子(1)"))
        ks, _ = bl.combine_parts([part("ご", "接頭辞", "ゴ", None, "P1"), part("飯", "名詞", "ハン", [0], "C3")])
        self.assertEqual(ks, [0])

    def test_several_atypes_keep_order(self):
        # 歯(1) + ブラシ[C1](2,1)... use a C1 tail with two values
        ks, _ = bl.combine_parts([part("歯", "名詞", "ハ", [1], "C3"), part("ブラシ", "名詞", "ブラシ", [1, 2], "C1")])
        self.assertEqual(ks, [2, 3])

    def test_three_parts_c4(self):
        ks, _ = bl.combine_parts([
            part("お", "接頭辞", "オ", None, "P2"),
            part("客", "名詞", "キャク", [0], "C3"),
            part("さん", "接尾辞", "サン", None, "C4", pos2="名詞的"),
        ])
        self.assertEqual(ks, [0])

    def test_rejects_particles_and_bad_shapes(self):
        ks, why = bl.combine_parts([part("足", "名詞", "アシ", [2], "C4"),
                                    part("の", "助詞", "ノ", None, "名詞%F1", pos2="格助詞"),
                                    part("裏", "名詞", "ウラ", [2], "C4")])
        self.assertIsNone(ks)
        self.assertTrue(why.startswith("shape"))
        ks, _ = bl.combine_parts([part("お", "接頭辞", "オ", None, "P2")])
        self.assertIsNone(ks)
        ks, _ = bl.combine_parts([part("大き", "形容詞", "オオキ", [3], "C2"),
                                  part("さ", "接尾辞", "サ", None, "C3", pos2="名詞的")])
        self.assertIsNone(ks)


class Tdmelodic(unittest.TestCase):
    def test_parse_marks(self):
        self.assertEqual(bl.parse_tdmelodic("オ[ミ]ヤゲ"), (2, 4))
        self.assertEqual(bl.parse_tdmelodic("フ[タツ"), (0, 3))
        self.assertEqual(bl.parse_tdmelodic("オ]チャ"), (1, 2))
        self.assertEqual(bl.parse_tdmelodic("オ[トウト]"), (4, 4))
        self.assertEqual(bl.parse_tdmelodic("ジ[テンシャ"), (0, 4))

    def test_value(self):
        self.assertEqual(bl._tdmelodic_value("3", "ふたつ"), 3)
        self.assertEqual(bl._tdmelodic_value("ヒ[コ]ウキ", "ひこうき"), 2)
        self.assertIsNone(bl._tdmelodic_value("ヒ[コ]ウ", "ひこうき"))  # mora count mismatch


try:
    import fugashi  # noqa: F401
    import unidic_lite  # noqa: F401
    HAVE_UNIDIC = True
except ImportError:
    HAVE_UNIDIC = False


@unittest.skipUnless(HAVE_UNIDIC, "fugashi + unidic-lite not installed")
class WithUniDic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tagger = fugashi.Tagger()

    def test_single_token(self):
        ks, _, source = bl.lookup(self.tagger, "箸", "はし")
        self.assertEqual((ks, source), ([1], "unidic"))

    def test_compounds(self):
        for surface, reading, want in [("図書館", "としょかん", [2]), ("誕生日", "たんじょうび", [3]),
                                       ("飛行機", "ひこうき", [2]), ("自転車", "じてんしゃ", [2])]:
            ks, rule, source = bl.lookup(self.tagger, surface, reading)
            self.assertEqual((ks, source), (want, "unidic-rule"), f"{surface} {rule}")

    def test_reading_must_match(self):
        ks, _, _ = bl.lookup(self.tagger, "図書館", "としょしつ")
        self.assertIsNone(ks)


if __name__ == "__main__":
    unittest.main()
