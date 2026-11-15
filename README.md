# LexiCycle

Application personnelle de flashcards anglais/italien. Sans serveur, sans compte, sans analytics et sans cloud. Les données sont uniquement stockées sur le téléphone dans IndexedDB.

## Installation / publication

1. Placez les fichiers à la racine d'un dépôt GitHub.
2. GitHub > Settings > Pages > Deploy from a branch > `main` > `/ (root)` > Save.
3. Ouvrez l'URL `https://NOM.github.io/NOM-DU-DEPOT/` dans Safari sur iPhone, connecté à Internet la première fois.
4. Partager > Sur l'écran d'accueil. Ouvrez l'icône. La mise en cache permet l'usage ultérieur hors ligne.
5. Exporte régulièrement le bilan JSON vers Fichiers. Le stockage Safari ou de la PWA peut être effacé.

## Contenu

- 20 cartes de démarrage adaptées au programme A2-B2, 10 anglaises et 10 italiennes.
- Révision espacée locale, cartes français > anglais/italien et auto-évaluation.
- Bibliothèque, ajout/modification/suspension, recherche, statistiques.
- Export hebdomadaire contenant **l'état complet** des cartes et de l'historique (`fullSnapshot`).
- Export de sauvegarde complet et restauration (avec confirmation préalable).
- Import incrémental des plans hebdomadaires (même ID = pas de doublon, et les progrès restent inchangés).

## Format du plan hebdomadaire à générer dans ChatGPT

```json
{
  "kind": "lexicycle-weekly-plan",
  "schemaVersion": 1,
  "weekStart": "2026-11-16",
  "cards": [
    {
      "id": "en-2026w47-001",
      "language": "en",
      "front": "J'ai hâte de…",
      "back": "I am looking forward to…",
      "example": "I am looking forward to the weekend.",
      "topic": "Expressions"
    }
  ],
  "updates": [
    {"id": "starter-en-0", "example": "I used to play the piano."}
  ],
  "notes": "Semaine 47 : expressions de conversation."
}
```

Règles : `language` vaut `en` ou `it`. Les nouveaux IDs doivent rester stables et uniques. `updates` peut modifier `front`, `back`, `example`, `topic`, `suspended` sans remettre à zéro la mémorisation. Toutes les anciennes cartes restent conservées. Pour envoyer une nouvelle semaine à l'utilisateur, générez un fichier `.json` compatible et faites-le importer via Paramètres.

## Développement

Code source statique : `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`. Aucun package npm et aucune compilation nécessaires.

Pour actualiser le service worker après modification de l'application, augmentez le nom de la variable `CACHE` dans `sw.js` (par ex. `lexicycle-static-v2`).
