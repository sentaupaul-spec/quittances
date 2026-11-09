"""Texte du mail envoyé avec la quittance."""
import pytest


def test_texte_complet(page_vide):
    q = {"civ": "Monsieur", "nom": "Paul Sentaurens", "moisIdx": 1, "annee": 2027, "bailleur": {"nom": "Annie Cresp"}}
    r = page_vide.evaluate("async (q) => { const m = await import('/js/mail.js'); return [m.titreMail(q), m.texteMail(q)]; }", q)
    assert r[0] == "Quittance de loyer — Février 2027"
    assert r[1] == ("Bonjour Paul Sentaurens,\n\n"
                    "Voici votre quittance de loyer du mois de février 2027.\n\n"
                    "Je vous en souhaite bonne réception.\n\n"
                    "Cordialement,\nAnnie Cresp")


@pytest.mark.parametrize("idx,attendu", [
    (0, "du mois de janvier 2026"), (2, "du mois de mars 2026"), (3, "du mois d'avril 2026"),
    (7, "du mois d'août 2026"), (9, "du mois d'octobre 2026"), (10, "du mois de novembre 2026"),
])
def test_elision_du_mois(page_vide, idx, attendu):
    q = {"nom": "Paul Sentaurens", "moisIdx": idx, "annee": 2026, "bailleur": {"nom": "Annie Cresp"}}
    assert attendu in page_vide.evaluate("async (q) => (await import('/js/mail.js')).texteMail(q)", q)
