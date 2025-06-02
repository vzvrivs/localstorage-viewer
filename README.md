# LocalStorage Master Explorer

Extension Chrome/Chromium pour **visualiser, éditer, exporter et nettoyer le localStorage, sessionStorage et IndexedDB** de tous les domaines et onglets ouverts dans le navigateur, avec des fonctions avancées d’inspection, de sécurité et de confort.

## Fonctionnalités

- Sélecteur de stockage : localStorage, sessionStorage, IndexedDB
- Liste tous les localStorage des sites ouverts (par domaine)
- Liste tous les sessionStorage de chaque onglet (titre + URL)
- Exploration complète d’IndexedDB : domaines > bases > stores > entrées (CRUD, filtre, export, refresh, copier)
- Affichage/masquage des domaines/onglets (collapsed par défaut)
- Filtre clé/valeur en temps réel
- Affichage de la taille de chaque valeur (en octets), alerte sur contenu volumineux
- Modification de clé et de valeur via bouton "Enregistrer"
- Indicateur visuel de modification non enregistrée
- Suppression sécurisée (confirmation)
- Rafraîchissement par site/onglet/store/base/domaine ou par valeur/entrée
- Boutons "Copier clé" et "Copier valeur" avec feedback visuel
- Ajout, édition et suppression de paires clé/valeur/entrée
- Export JSON par domaine, base, store, onglet ou **globalement**, tous horodatés automatiquement (évite l’écrasement de fichiers)
- Accès direct à la page d’options
- Interface ergonomique, responsive et sans dépendance externe
- Thème sombre automatique selon le système, ou forçable manuellement

## Installation

1. **Cloner ce dépôt ou télécharger les fichiers**
2. Aller dans `chrome://extensions/`
3. Activer le **mode développeur**
4. Cliquer sur **"Charger l’extension non empaquetée"**
5. Sélectionner le dossier du projet

## Utilisation

- Cliquer sur l’icône de l’extension, puis sur “Ouvrir l’explorateur LocalStorage”
- Naviguer entre les modes via le sélecteur : localStorage, sessionStorage, IndexedDB
- Naviguer entre les domaines, bases, stores ou onglets : cliquer sur le bouton "Afficher/Masquer" pour explorer les données
- Filtrer les entrées par clé ou valeur
- Copier la clé ou la valeur d’une entrée avec le bouton dédié
- Éditer les clés et valeurs, puis cliquer sur "Enregistrer" pour appliquer les modifications
- Utiliser "Refresh" pour recharger une entrée, un store, une base, un domaine, un onglet ou une valeur depuis le stockage réel
- Supprimer des clés/valeurs/entrées (confirmation demandée)
- Exporter le contenu en JSON : export horodaté par domaine, onglet, base, store ou global

## Sécurité et limites

- L’édition/suppression est **active uniquement sur les domaines/onglets ouverts** dans le navigateur (nécessite l’onglet correspondant ouvert)
- Les modifications sur des données volumineuses (>100 ko) peuvent ralentir le navigateur : une alerte s’affiche le cas échéant
- Cette extension **n’a accès qu’au stockage local/session/indexedDB des pages ouvertes** (respecte l’isolation des sites)

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

vzvrivs (2025)  
Conseils, retours et contributions bienvenus.

---
