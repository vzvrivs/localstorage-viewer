# LocalStorage Master Explorer

Extension Chrome/Chromium pour **visualiser, éditer, exporter et nettoyer le localStorage** de tous les domaines ouverts dans le navigateur, avec des fonctions avancées d’inspection et de sécurité.

## Fonctionnalités

- Liste tous les localStorage des sites ouverts (par domaine)
- Affichage/masquage des domaines (collapsed par défaut)
- Affichage de la taille de chaque valeur (en octets), alerte sur contenu volumineux
- Modification de clé et de valeur via bouton "Enregistrer"
- Indicateur visuel de modification non enregistrée
- Suppression sécurisée (confirmation)
- Rafraîchissement par site ou par valeur
- Ajout, édition et suppression de paires clé/valeur
- Export JSON par domaine ou global
- Accès direct à la page d’options
- Interface ergonomique, responsive et sans dépendance externe

## Installation

1. **Cloner ce dépôt ou télécharger les fichiers**
2. Aller dans `chrome://extensions/`
3. Activer le **mode développeur**
4. Cliquer sur **"Charger l’extension non empaquetée"**
5. Sélectionner le dossier du projet

## Utilisation

- Cliquer sur l’icône de l’extension, puis sur “Ouvrir l’explorateur LocalStorage”
- Naviguer entre les domaines ouverts : cliquer sur le bouton "Afficher/Masquer" pour explorer les données d’un domaine
- Éditer les clés et valeurs, puis cliquer sur "Enregistrer" pour appliquer les modifications
- Utiliser "Refresh" pour recharger un domaine ou une valeur depuis le stockage réel
- Supprimer des clés (confirmation demandée)
- Exporter le contenu en JSON (par domaine ou global)

## Sécurité et limites

- L’édition/suppression est **active uniquement sur les domaines ouverts** dans le navigateur (nécessite l’onglet correspondant ouvert)
- Les modifications sur des localStorage volumineux (>100 ko) peuvent ralentir le navigateur : une alerte s’affiche le cas échéant
- Cette extension **n’a accès qu’au stockage local des pages ouvertes** (respecte l’isolation des sites)

## À venir / pistes d’amélioration

- Prise en charge du `sessionStorage` (par onglet)
- Exploration avancée d’`IndexedDB`
- Recherche/filtrage avancé
- Import JSON
- Thèmes et personnalisation UI

## Structure du projet

```
/
├── manifest.json
├── index.html
├── index.js
├── style.css
├── popup.html
├── popup.js
├── options.html
├── options.js
```

## Auteur

vzvrivs(2025)  
Conseils, retours et contributions bienvenus.

---