"""Conversion des montants en lettres, format et lecture des montants."""
import pytest

CAS_LETTRES = [
    (0, "zéro euro"),
    (1, "un euro"),
    (21, "vingt et un euros"),
    (71, "soixante et onze euros"),
    (80, "quatre-vingts euros"),
    (81, "quatre-vingt-un euros"),
    (91, "quatre-vingt-onze euros"),
    (99, "quatre-vingt-dix-neuf euros"),
    (100, "cent euros"),
    (200, "deux cents euros"),
    (250, "deux cent cinquante euros"),
    (600, "six cents euros"),
    (1000, "mille euros"),
    (1280.50, "mille deux cent quatre-vingts euros et cinquante centimes"),
    (2000, "deux mille euros"),
    # cas supplémentaires
    (17, "dix-sept euros"),
    (70, "soixante-dix euros"),
    (77, "soixante-dix-sept euros"),
    (101, "cent un euros"),
    (180, "cent quatre-vingts euros"),
    (181, "cent quatre-vingt-un euros"),
    (301, "trois cent un euros"),
    (1001, "mille un euros"),
    (1200, "mille deux cents euros"),
    (21000, "vingt et un mille euros"),
    (80000, "quatre-vingt mille euros"),
    (200000, "deux cent mille euros"),
    (1000000, "un million d'euros"),
    (0.01, "un centime"),
    (0.5, "cinquante centimes"),
    (1.01, "un euro et un centime"),
    (571.71, "cinq cent soixante et onze euros et soixante et onze centimes"),
    (650.8, "six cent cinquante euros et quatre-vingts centimes"),
]


@pytest.mark.parametrize("montant,attendu", CAS_LETTRES)
def test_en_lettres(page_vide, montant, attendu):
    res = page_vide.evaluate("async (m) => (await import('/js/montant.js')).montantEnLettres(m)", montant)
    assert res == attendu


@pytest.mark.parametrize("montant,attendu", [
    (600, "600,00 €"), (1280.5, "1 280,50 €"), (0, "0,00 €"), (50.5, "50,50 €"),
    (1234567.891, "1 234 567,89 €"), (0.1 + 0.2, "0,30 €"),
])
def test_format_euros(page_vide, montant, attendu):
    assert page_vide.evaluate("async (m) => (await import('/js/montant.js')).formatEuros(m)", montant) == attendu


@pytest.mark.parametrize("texte,attendu", [
    ("550", 550), ("550,00", 550), ("1 200", 1200), ("50,5", 50.5), ("1 200,50", 1200.5),
    ("1 200,50", 1200.5), ("1 200,50", 1200.5), ("1.200,50", 1200.5), ("1,200.50", 1200.5),
    ("550 €", 550), ("€550", 550), ("550.5", 550.5), ("1.200", 1200), ("  80 ", 80),
    ("", None), ("abc", None), ("12a", None),
])
def test_lire_montant(page_vide, texte, attendu):
    assert page_vide.evaluate("async (t) => (await import('/js/montant.js')).lireMontant(t)", texte) == attendu
