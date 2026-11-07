"""Texte du mail envoyé avec la quittance."""
import pytest


@pytest.mark.parametrize("nom,attendu", [
    ("Paul Sentaurens", "Sentaurens"),
    ("Julie Martin", "Martin"),
    ("Jean-Baptiste Le Goff", "Le Goff"),
    ("Marie de La Fontaine", "de La Fontaine"),
    ("  Léa   Petit  ", "Petit"),
    ("Martin", "Martin"),
])
def test_nom_de_famille(page_vide, nom, attendu):
    assert page_vide.evaluate("async (n) => (await import('/js/mail.js')).nomDeFamille(n)", nom) == attendu


def test_texte_complet(page_vide):
    q = {"civ": "Monsieur", "nom": "Paul Sentaurens", "moisIdx": 1, "annee": 2027, "bailleur": {"nom": "Annie Cresp"}}
    r = page_vide.evaluate("async (q) => { const m = await import('/js/mail.js'); return [m.titreMail(q), m.texteMail(q)]; }", q)
    assert r[0] == "Quittance de loyer — Février 2027"
    assert r[1] == ("Bonjour Monsieur Sentaurens,\n\n"
                    "Voici votre quittance de loyer du mois de février 2027.\n\n"
                    "Je vous en souhaite bonne réception.\n\n"
                    "Cordialement,\nAnnie Cresp")
