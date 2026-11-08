"""Texte du mail envoyé avec la quittance."""


def test_texte_complet(page_vide):
    q = {"civ": "Monsieur", "nom": "Paul Sentaurens", "moisIdx": 1, "annee": 2027, "bailleur": {"nom": "Annie Cresp"}}
    r = page_vide.evaluate("async (q) => { const m = await import('/js/mail.js'); return [m.titreMail(q), m.texteMail(q)]; }", q)
    assert r[0] == "Quittance de loyer — Février 2027"
    assert r[1] == ("Bonjour Paul Sentaurens,\n\n"
                    "Voici votre quittance de loyer du mois de février 2027.\n\n"
                    "Je vous en souhaite bonne réception.\n\n"
                    "Cordialement,\nAnnie Cresp")
