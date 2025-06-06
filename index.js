// ========== Thème sombre automatique + bouton manuel ==========
const themeBtn   = document.getElementById('themeBtn');
const themeIcon  = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
const THEME_KEY  = 'lsme-theme';

if (themeBtn && themeIcon && themeLabel) {
  // Récupère la préférence utilisateur ("auto", "light", "dark")
  function getPref() {
    return localStorage.getItem(THEME_KEY) || 'auto';
  }
  // Récupère le thème système actuel
  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  // Applique le vrai thème (toujours "dark" ou "light") au body
  function setThemeToBody(theme) {
    document.body.setAttribute('data-theme', theme);
  }
  // Met à jour le thème réel ET l’UI du bouton/label selon la préférence utilisateur
  function updateTheme() {
    const pref = getPref(); // "auto", "light", "dark"
    const sys  = getSystemTheme();
    const realTheme = (pref === 'auto') ? sys : pref;
    setThemeToBody(realTheme);

    let icon = '⚡', txt = 'Auto';
    if (pref === 'dark')  { icon = '🌙'; txt = 'Sombre'; }
    else if (pref === 'light') { icon = '☀️'; txt = 'Clair'; }
    else { icon = '⚡'; txt = 'Auto'; }
    themeIcon.textContent  = icon;
    themeLabel.textContent = txt;
  }

  // Bascule auto → light → dark → auto (ordre fixe)
  themeBtn.onclick = () => {
    const ordre = ['auto', 'light', 'dark'];
    const current = getPref();
    const idx = ordre.indexOf(current);
    const next = ordre[(idx + 1) % ordre.length];
    localStorage.setItem(THEME_KEY, next);
    updateTheme();
  };
  // Réagir au changement du thème système
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);
  updateTheme();
}

// ========== Sélecteur de stockage =============
let currentMode = 'localStorage';

// ======== Caches pour éviter rechargements répétés ========
let cachedLocalData = null;         // { [domain]: { data, tabId } }
let cachedLocalFailedCount = 0;
let cachedSessionData = null;       // { [tabId]: { data, tab } }
let cachedSessionFailedCount = 0;
let cachedIDBData = null;           // { [domain]: bases }
let cachedIDBFailedCount = 0;

// Dès que le script démarre, on lance les 3 calculs en parallèle
(async function preloadCounts() {
  // 1) LocalStorage
  computeCountLocalStorage().then(count => {
    const btnLS = document.querySelector('#storageSelector button[data-mode="localStorage"]');
    if (btnLS) btnLS.textContent = `LocalStorage (${count})`;
  });
  // 2) SessionStorage
  computeCountSessionStorage().then(count => {
    const btnSS = document.querySelector('#storageSelector button[data-mode="sessionStorage"]');
    if (btnSS) btnSS.textContent = `SessionStorage (${count})`;
  });
  // 3) IndexedDB
  computeCountIndexedDB().then(count => {
    const btnIDB = document.querySelector('#storageSelector button[data-mode="indexedDB"]');
    if (btnIDB) btnIDB.textContent = `IndexedDB (${count})`;
  });
})();

// On récupère les boutons (LocalStorage / SessionStorage / IndexedDB)
const selectorButtons = document.querySelectorAll('#storageSelector button');
if (selectorButtons.length) {
  selectorButtons.forEach(btn => {
    btn.onclick = function() {
      selectorButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); 
      currentMode = btn.dataset.mode;
      renderMain();
    };
  });
  // Au chargement, on met la classe "active" sur le bouton qui a data-mode="localStorage"
  const btnInit = Array.from(selectorButtons).find(b => b.dataset.mode === 'localStorage');
  if (btnInit) btnInit.classList.add('active');
}

// ========== Champ filtre =======================
//  -> Définir filterInput AVANT de l’utiliser
const filterInput = document.getElementById('filter');
let filter = '';
if (filterInput) {
  filterInput.oninput = () => {
    filter = filterInput.value.trim().toLowerCase();
    renderMain();
  };
}

// ========== Placeholder pour la suite ==========
function renderMain() {
  if (currentMode === "localStorage") {
    renderLocalStorage();
  } else if (currentMode === "sessionStorage") {
    renderSessionStorage();
  } else if (currentMode === "indexedDB") {
    renderIndexedDB();
  } else {
    // Placeholder
    document.getElementById('content').innerHTML = `<div style="color:var(--muted);padding:3em 0;text-align:center;">
      <strong>Mode :</strong> <span style="color:var(--accent)">${currentMode}</span>
      <br><br>
      (L’affichage du stockage sélectionné sera ici)
    </div>`;
  }
}

// -----------------------------------------------------------
//  Helpers généraux
// -----------------------------------------------------------
// === Helpers clé primaire génériques pour IndexedDB =========
/**
 * Renvoie le keyPath déclaré sur l’objectStore (ou undefined).
 */
function storeKeyPath(store) {
  return (store && typeof store.keyPath === "string" && store.keyPath.length)
    ? store.keyPath
    : undefined;
}

/**
 * Détermine la valeur de clé primaire pour une entrée donnée.
 * Priorité :
 *   1. Champ interne « __lsme_id » (ajouté par LSME)
 *   2. keyPath natif de l’objectStore
 *   3. Heuristique champ « id » puis « key »
 * Renvoie undefined si aucune clé fiable n’est trouvée.
 */
function primaryKeyForEntry(store, entry) {
  if (entry && entry.__lsme_id) return entry.__lsme_id;

  const kp = store.keyPath;
  // Cas d’un keyPath composite (tableau)
  if (Array.isArray(kp) && entry) {
    // on reconstitue la clé en tableau
    const compositeKey = kp.map(field => entry[field]);
    // si l’un des champs manque, renvoyer undefined
    return compositeKey.every(val => val !== undefined) ? compositeKey : undefined;
  }
  // Sinon si keyPath est une chaîne simple
  if (typeof kp === 'string' && entry && entry[kp] !== undefined) {
    return entry[kp];
  }
  if (entry && entry.id !== undefined)  return entry.id;
  if (entry && entry.key !== undefined) return entry.key;
  return undefined;
}

// --- Helpers injection / extraction ---
function nowForFilename() {
  const d = new Date();
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    "-" +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0")
  );
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  } else { // fallback old browsers
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  }
}

// Retourne une promesse qui renvoie le nombre de domaines avec localStorage
async function computeCountLocalStorage() {
  const tabs = await getTabs();
  const seenOrigins = new Set();
  for (const tab of tabs) {
    try {
      const origin = new URL(tab.url).origin;
      if (seenOrigins.has(origin)) continue;
      // Tenter d’accéder à la page pour voir s’il y a localStorage
      const data = await runInTab(tab.id, () => {
        const o = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          o[k] = localStorage.getItem(k);
        }
        return o;
      });
      // Si on a obtenu un objet (même vide), on considère que ce domaine compte
      seenOrigins.add(origin);
    } catch {
      // injection bloquée ou pas de localStorage => on ignore
    }
  }
  return seenOrigins.size;
}

// Retourne le nombre d’onglets avec sessionStorage
async function computeCountSessionStorage() {
  const tabs = await getTabs();
  let count = 0;
  for (const tab of tabs) {
    try {
      const data = await runInTab(tab.id, () => {
        const o = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          o[k] = sessionStorage.getItem(k);
        }
        return o;
      });
      // même si c’est un objet vide, on compte l’onglet
      count++;
    } catch {
      // injection bloquée ou pas de sessionStorage => ignore
    }
  }
  return count;
}

// Retourne le nombre de domaines pour lesquels IndexedDB a au moins une base
async function computeCountIndexedDB() {
  const tabs = await getTabs();
  const seenOrigins = new Set();
  for (const tab of tabs) {
    const url = tab.url;
    // Filtrer les URL qui ne feront jamais marcher indexedDB.databases()
    if (url.startsWith('chrome://') || url.includes('chrome.google.com/webstore') || url.includes('accounts.google.com')) {
      continue;
    }
    try {
      const origin = new URL(url).origin;
      if (seenOrigins.has(origin)) continue;
      const result = await runInTab(tab.id, async () => {
        if (!('indexedDB' in window)) return { bases: [] };
        if (!indexedDB.databases) return { bases: [] };
        const dbs = await indexedDB.databases();
        return { bases: dbs.filter(b => b.name) }; // on retourne simplement la liste
      });
      if (result && result.bases && result.bases.length > 0) {
        seenOrigins.add(origin);
      }
    } catch {
      // injection bloquée ou pas de IndexedDB => on ignore
    }
  }
  return seenOrigins.size;
}

async function getTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter(tab => tab.url && tab.url.startsWith('http'));
}
function runInTab(tabId, func, args = []) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func,
    args
  }).then(results => results[0]?.result);
}
function utf8Length(str) {
  return (new TextEncoder().encode(str)).length;
}

// --- Affichage du localStorage multi-domaine ---
async function renderLocalStorage() {
  // 1) Supprime tout ancien bouton « exportAllBtn » (quel que soit le mode)
  const oldExportBtn = document.getElementById('exportAllBtn');
  if (oldExportBtn) oldExportBtn.remove();
  // 2) Masque et vide le message d’erreur (Local/Session/IndexedDB)
  const errDiv = document.getElementById('errorMessage');
  if (errDiv) {
    errDiv.style.display = 'none';
    errDiv.textContent = '';
  }
  const content = document.getElementById('content');

  content.innerHTML = "Chargement…";
  let byDomain = {};
  let failedCount;

  if (!cachedLocalData) {
    // Première visite : on récupère tout et on met en cache
    failedCount = 0;
    const tabs = await getTabs();
    byDomain = {};
    for (const tab of tabs) {
      try {
        const domain = new URL(tab.url).origin;
        if (!byDomain[domain]) {
          const data = await runInTab(tab.id, () => {
            let o = {};
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              o[k] = localStorage.getItem(k);
            }
            return o;
          });
          byDomain[domain] = { data, tabId: tab.id };
        }
      } catch {
        failedCount++;
      }
    }
    cachedLocalData = byDomain;
    cachedLocalFailedCount = failedCount;
  } else {
    // On recharge depuis le cache
    byDomain = cachedLocalData;
    failedCount = cachedLocalFailedCount;
  }

  // Mise à jour du compteur (unique, dans preloadCounts)
  const countDomains = Object.keys(byDomain).length;
  const btnLS = document.querySelector('#storageSelector button[data-mode="localStorage"]');
  if (btnLS) btnLS.textContent = `LocalStorage (${countDomains})`;

  if (countDomains === 0) {
    content.innerHTML = "<div style='color:var(--muted);padding:3em;text-align:center;'>Aucun domaine avec localStorage détecté</div>";
    return;
  }

  // Affichage de l’éventuel message d’erreur d’injection (LocalStorage)
  if (failedCount > 0 && errDiv) {
    errDiv.style.display = '';
    errDiv.style.cssText = 'padding:0.5em 1em;background:#fdd;border-left:4px solid var(--danger);margin-bottom:1em;color:var(--danger);font-weight:bold;';
    errDiv.textContent = `Impossible de lire LocalStorage sur ${failedCount} onglet(s) – certaines pages bloquent l’injection.`;
  }

  // Création de chaque panneau domaine (filtre appliqué)
  content.innerHTML = "";

  // Bouton "Exporter tout" (depuis le cache)
  const exportAllBtn = el('button', {
    type: 'button',
    style: 'margin-bottom:1.5em;',
    onclick: () => {
      const allData = {};
      Object.entries(byDomain).forEach(([domain, { data }]) => {
        allData[domain] = data;
      });
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `localStorage-all-${nowForFilename()}.json`;
      document.body.appendChild(a);
      a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 500);
    }
  }, 'Exporter tout');
  content.appendChild(exportAllBtn);

  // On affiche chaque domaine avec filtrage à chaque clé/valeur
  Object.entries(byDomain).forEach(([domain, { data, tabId }]) => {
    // Filtrage clé/valeur :
    const filteredData = Object.fromEntries(
      Object.entries(data)
        .filter(([k, v]) => !filter || k.toLowerCase().includes(filter) || (v && v.toLowerCase().includes(filter)))
    );
    content.appendChild(renderDomainPanel(domain, filteredData, tabId));
  });
}

// --- Affichage du sessionStorage multi-onglets ---
async function renderSessionStorage() {
  // Retire l’ancien « exportAllBtn » (au cas où on venait d’IndexedDB)
  const oldExportBtn = document.getElementById('exportAllBtn');
  if (oldExportBtn) oldExportBtn.remove();
  // Masque et vide le message d’erreur (Local/Session/IndexedDB)
  const errDiv = document.getElementById('errorMessage');
  if (errDiv) {
    errDiv.style.display = 'none';
    errDiv.textContent = '';
  }
  const content = document.getElementById('content');

  content.innerHTML = "Chargement…";
  let byTab = {};
  let failedCount;

  if (!cachedSessionData) {
    // Première visite : on récupère tout et on met en cache
    failedCount = 0;
    const tabs = await getTabs();
    byTab = {};
    for (const tab of tabs) {
      try {
        const data = await runInTab(tab.id, () => {
          let o = {};
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            o[k] = sessionStorage.getItem(k);
          }
          return o;
        });
        byTab[tab.id] = { data, tab };
      } catch {
        failedCount++;
      }
    }
    cachedSessionData = byTab;
    cachedSessionFailedCount = failedCount;
  } else {
    // On recharge depuis le cache
    byTab = cachedSessionData;
    failedCount = cachedSessionFailedCount;
  }

  // Mise à jour du compteur (unique, dans preloadCounts)
  const countTabs = Object.keys(byTab).length;
  const btnSS = document.querySelector('#storageSelector button[data-mode="sessionStorage"]');
  if (btnSS) btnSS.textContent = `SessionStorage (${countTabs})`;

  if (countTabs === 0) {
    content.innerHTML = "<div style='color:var(--muted);padding:3em;text-align:center;'>Aucun onglet avec sessionStorage détecté</div>";
    return;
  }

  // Affichage de l’éventuel message d’erreur d’injection (SessionStorage)
  if (failedCount > 0 && errDiv) {
    errDiv.style.display = '';
    errDiv.style.cssText = 'padding:0.5em 1em;background:#fdd;border-left:4px solid var(--danger);margin-bottom:1em;color:var(--danger);font-weight:bold;';
    errDiv.textContent = `Impossible de lire SessionStorage sur ${failedCount} onglet(s) – certaines pages bloquent l’injection.`;
  }

  content.innerHTML = "";

  // Bouton "Exporter tout"
  const exportAllBtn = el('button', {
    type: 'button',
    style: 'margin-bottom:1.5em;',
    onclick: () => {
      const allData = {};
      Object.values(byTab).forEach(({ data, tab }) => {
        const tabInfo = `${tab.title} | ${tab.url}`;
        allData[tabInfo] = data;
      });
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `sessionStorage-all-${nowForFilename()}.json`;
      document.body.appendChild(a);
      a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 500);
    }
  }, 'Exporter tout');
  content.appendChild(exportAllBtn);

  // Affichage de l’éventuel message d’erreur d’injection (SessionStorage)
  if (failedCount > 0 && errDiv) {
    errDiv.style.display = '';
    errDiv.style.cssText = 'padding:0.5em 1em;background:#fdd;border-left:4px solid var(--danger);margin-bottom:1em;color:var(--danger);font-weight:bold;';
    errDiv.textContent = `Impossible de lire SessionStorage sur ${failedCount} onglet(s) – certaines pages bloquent l’injection.`;
  }

  // Création de chaque panneau onglet (filtre appliqué)
  Object.values(byTab).forEach(({ data, tab }) => {
    // Filtrage selon le champ "filter"
    const filtered = Object.entries(data)
      .filter(([k, v]) => !filter || k.toLowerCase().includes(filter) || (v && v.toLowerCase().includes(filter)));
    const filteredData = Object.fromEntries(filtered);
    content.appendChild(renderTabPanel(tab, filteredData));
  });
}

function renderTabPanel(tab, data) {
  const tabInfo = `${tab.title || '(sans titre)'} | ${tab.url}`;
  // Filtrage selon le champ "filter"
  const filtered = Object.entries(data)
    .filter(([k,v]) => !filter || k.toLowerCase().includes(filter) || (v && v.toLowerCase().includes(filter)));
  const total = Object.keys(data).length, shown = filtered.length;

  // On ne met en évidence QUE si un filtre est actif ET qu’il y a des correspondances
  const hasMatch = (filter !== '' && shown > 0);

  const section = el('div', {
    className: hasMatch ? 'domain-section has-match' : 'domain-section',
    style: 'margin-bottom:2em;box-shadow:0 2px 8px #eee;border-radius:8px;overflow:hidden;'
  });
  const h2Title = el('h2', { style:"margin:0;font-size:1em;flex:1;" }, tabInfo);
  if (hasMatch) {
    h2Title.appendChild(el('span', { className:'badge' }, `${shown}`));
  }
  const head = el('div', { style:"display:flex;align-items:center;gap:1em;background:var(--panel);padding:0.7em 1em;cursor:pointer;" },
    h2Title,
    el('span', { style:'font-size:0.95em;color:var(--muted);' }, `${shown} / ${total}`),
   // --- Bouton Refresh pour reconstruire JUSTE ce panneau onglet ---
   el('button', {
     onclick: (e) => {
       e.stopPropagation();                                      // éviter de toggler l’accordion en même temps
       refreshTabPanel(section, tab);
     }
   }, 'Refresh'),
   // --- Bouton Export pour télécharger le sessionStorage de cet onglet ---
   el('button', {
     onclick: (e) => {
       e.stopPropagation();
       // On télécharge un JSON avec toutes les paires de sessionStorage
       const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = `sessionStorage-${tabInfo.replace(/[^a-z0-9]/gi, '_')}-${nowForFilename()}.json`;
       document.body.appendChild(a);
       a.click();
       setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
     }
   }, 'Exporter'),
  );
  section.appendChild(head);

  const body = el('div', {style:'display:none;background:var(--bg);padding:1em 1em 0.5em;'});
  section.appendChild(body);

  // Tableau des clés/valeurs
  const table = el('table', {style:'width:100%;'},
    el('thead', {}, el('tr', {},
      el('th', {style:"width:17.5%"}, 'Clé'),
      el('th', {style:"width:55%"}, 'Valeur'),
      el('th', {style:"width:5%"}, 'Taille'),
      el('th', {style:"width:22.5%"}, 'Actions')
    )),
    el('tbody', {},
      ...filtered.map(([k, v]) => renderSessionRow(tab, k, v, section))
    )
  );
  body.appendChild(table);

  // Ligne d'ajout
  const addRow = el('tr', {},
    el('td', {}, el('input', {type:'text',placeholder:'Nouvelle clé',className:'key',style:'width:100%;'})),
    el('td', {}, el('input', {type:'text',placeholder:'Valeur',className:'value',style:'width:100%;'})),
    el('td', {}, ''),
    el('td', {}, el('button', {
      onclick: () => addSessionItem(tab, addRow, section)
    }, 'Ajouter'))
  );
  table.querySelector('tbody').appendChild(addRow);

  // Export bouton
  body.appendChild(el('button', {
    onclick: () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `sessionStorage-${(tab.title || 'onglet').replace(/[^a-z0-9]/gi,'_')}-${nowForFilename()}.json`;
      document.body.appendChild(a);
      a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},500);
    }
  }, 'Exporter cet onglet'));

  head.onclick = () => { body.style.display = (body.style.display === 'none' ? '' : 'none'); };
  return section;
}

function renderSessionRow(tab, k, v, section) {
  let keyInput, valueInput, saveBtn, dirtyIcon, valueSize, copyKeyBtn, copyValueBtn, copyTimeoutK, copyTimeoutV;
  let pristineKey = k, pristineValue = v;

  function checkDirty() {
    const dirty = (keyInput.value !== pristineKey || valueInput.value !== pristineValue);
    dirtyIcon.style.display = dirty ? '' : 'none';
    saveBtn.disabled = !dirty;
  }
  function updateValueSize() {
    const len = utf8Length(valueInput.value);
    valueSize.textContent = `${len} o`;
    if (len > 100_000) {
      valueSize.style.color = "var(--danger)";
      valueSize.title = "Très volumineux : risque de plantage !";
    } else {
      valueSize.style.color = "";
      valueSize.title = "";
    }
  }

  // Détection si la ligne correspond au filtre
  const isMatch = (filter !== '' && (k.toLowerCase().includes(filter) || (v && v.toLowerCase().includes(filter))));
  // Une entrée = une ligne de table (mise en évidence si match)
  const row = el('tr', { style: isMatch ? 'background-color: var(--accent); color: white;' : '' },
    el('td', {}, keyInput = el('input', {
      type:'text',
      value:k,
      className:'key',
      style:"width:100%",
      oninput: () => checkDirty()
    })),
    el('td', {},
      valueInput = el('input', {
        type:'text',
        value:v,
        className:'value',
        style:"width:100%",
        oninput: () => { checkDirty(); updateValueSize(); }
      }),
      dirtyIcon = el('span', {style:"color:var(--danger);display:none;font-size:1.2em;margin-left:6px;"}, '•')
    ),
    valueSize = el('td', {style:"color:var(--muted);text-align:right;font-size:0.95em;"}),
    el('td', {},
      saveBtn = el('button', {
        disabled:true,
        onclick: async () => {
          if (!keyInput.value) return;
          // Edition de clé
          const tabId = tab.id;
          if (keyInput.value !== pristineKey) {
            const keys = await runInTab(tabId, () => Object.keys(sessionStorage));
            if (keys.includes(keyInput.value)) {
              alert("Une clé identique existe déjà.");
              return;
            }
            await runInTab(tabId, (ok, nk, v) => {
              sessionStorage.setItem(nk, v);
              sessionStorage.removeItem(ok);
            }, [pristineKey, keyInput.value, valueInput.value]);
          } else if (valueInput.value !== pristineValue) {
            await runInTab(tabId, (k,v)=>sessionStorage.setItem(k,v), [keyInput.value,valueInput.value]);
          }
          // Refresh juste la ligne (pas toute la section)
          const data = await runInTab(tabId, () => {
            let o = {};
            for (let i = 0; i < sessionStorage.length; i++) {
              const k = sessionStorage.key(i);
              o[k] = sessionStorage.getItem(k);
            }
            return o;
          });
          const newKey = keyInput.value;
          const newValue = data[newKey];
          const newRow = renderSessionRow(tab, newKey, newValue, section);
          row.replaceWith(newRow);
        }
      }, 'Enregistrer'),
      copyKeyBtn = el('button', {
        onclick: async () => {
          await copyToClipboard(keyInput.value);
          copyKeyBtn.textContent = "✓ Clé copiée";
          copyKeyBtn.disabled = true;
          clearTimeout(copyTimeoutK);
          copyTimeoutK = setTimeout(() => {
            copyKeyBtn.textContent = "Copier clé";
            copyKeyBtn.disabled = false;
          }, 3000);
        }
      }, 'Copier clé'),
      copyValueBtn = el('button', {
        onclick: async () => {
          await copyToClipboard(valueInput.value);
          copyValueBtn.textContent = "✓ Valeur copiée";
          copyValueBtn.disabled = true;
          clearTimeout(copyTimeoutV);
          copyTimeoutV = setTimeout(() => {
            copyValueBtn.textContent = "Copier valeur";
            copyValueBtn.disabled = false;
          }, 3000);
        }
      }, 'Copier valeur'),
      el('button', {
        onclick: async () => {
          const value = await runInTab(tab.id, (k) => sessionStorage.getItem(k), [pristineKey]);
          if (value === null) {
            alert("La clé n'existe plus dans sessionStorage.");
            renderMain();
            return;
          }
          keyInput.value = pristineKey;
          valueInput.value = value;
          pristineValue = value;
          setTimeout(() => { checkDirty(); updateValueSize(); }, 0);
        }
      }, 'Refresh'),
      el('button', {
        onclick: () => {
          if (confirm(`Supprimer ${keyInput.value} de cet onglet ? Cette action est irréversible.`)) delSessionItem(tab.id, keyInput.value, section, tab);
        }
      }, 'Supprimer')
    )
  );
  setTimeout(() => { updateValueSize(); checkDirty(); }, 0);
  return row;
}

// === Création reusable des lignes "Ajouter" ===
function createAddRow(domain, tabId, section) {
  const table = section.querySelector('table');
  const tbody = table.querySelector('tbody');
  const addRow = el('tr', {},
    el('td', {}, el('input', {
      type: 'text',
      placeholder: 'Nouvelle clé',
      className: 'key',
      style: 'width:100%;'
    })),
    el('td', {}, el('input', {
      type: 'text',
      placeholder: 'Valeur',
      className: 'value',
      style: 'width:100%;'
    })),
    el('td', {}, ''),
    el('td', {}, el('button', {
      onclick: () => addItem(domain, tabId, addRow, section)
    }, 'Ajouter'))
  );
  tbody.appendChild(addRow);
}

function createAddSessionRow(tab, section) {
  const table = section.querySelector('table');
  const tbody = table.querySelector('tbody');
  const addRow = el('tr', {},
    el('td', {}, el('input', {
      type: 'text',
      placeholder: 'Nouvelle clé',
      className: 'key',
      style: 'width:100%;'
    })),
    el('td', {}, el('input', {
      type: 'text',
      placeholder: 'Valeur',
      className: 'value',
      style: 'width:100%;'
    })),
    el('td', {}, ''),
    el('td', {}, el('button', {
      onclick: () => addSessionItem(tab, addRow, section)
    }, 'Ajouter'))
  );
  tbody.appendChild(addRow);
}

// -- Refresh d’un onglet (remplace le panneau par sa version à jour) --
async function refreshTabPanel(section, tab) {
  // 1) Vérifie si le contenu est déjà déroulé
  const body = section.children[1];
  const wasOpen = body && body.style.display !== 'none';

  // 2) Recharge les données sessionStorage
  const data = await runInTab(tab.id, () => {
    let o = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      o[k] = sessionStorage.getItem(k);
    }
    return o;
  });

  // 3) Reconstruit un nouveau panneau
  const newSection = renderTabPanel(tab, data);

  // 4) Si l’ancien était ouvert, on l’ouvre à nouveau
  if (wasOpen) {
    const newBody = newSection.children[1];
    if (newBody) newBody.style.display = '';
  }

  // 5) Remplace
  section.replaceWith(newSection);
}

function el(tag, props, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (let c of children) {
    if (typeof c === "string") c = document.createTextNode(c);
    if (c) e.appendChild(c);
  }
  return e;
}

// -- Panneau d’un domaine (collapsé, filtre appliqué, boutons) --
function renderDomainPanel(domain, data, tabId) {
  // Filtrage selon le champ "filter"
  const filtered = Object.entries(data)
    .filter(([k,v]) => !filter || k.toLowerCase().includes(filter) || (v && v.toLowerCase().includes(filter)));
  const total = Object.keys(data).length, shown = filtered.length;

  // On ne met en évidence QUE si un filtre est actif ET qu’il y a des correspondances
  const hasMatch = (filter !== '' && shown > 0);

  // Création des éléments : on ajoute la classe 'has-match' si shown > 0
  const section = el('div', {
    className: hasMatch ? 'domain-section has-match' : 'domain-section',
    style: 'margin-bottom:2em;box-shadow:0 2px 8px #eee;border-radius:8px;overflow:hidden;'
  });
  // Nous allons également afficher un petit badge numérique si shown > 0
  const h2Content = el('h2', { style:"margin:0;font-size:1em;flex:1;" }, domain);
  if (hasMatch) {
    // On ajoute un badge indiquant le nombre de résultats
    h2Content.appendChild(el('span', { className:'badge' }, `${shown}`));
  }
  const head = el('div', { style:"display:flex;align-items:center;gap:1em;background:var(--panel);padding:0.7em 1em;cursor:pointer;" },
    h2Content,
    el('span', { style:'font-size:0.95em;color:var(--muted);' }, `${shown} / ${total}`),
   // --- Bouton Refresh pour reconstruire JUSTE ce panneau domaine ---
   el('button', {
     onclick: (e) => {
       e.stopPropagation();                                   // éviter de toggler l’accordion
       refreshDomainPanel(section, domain, tabId);
     }
   }, 'Refresh'),
  );
  section.appendChild(head);

  const body = el('div', {style:'display:none;background:var(--bg);padding:1em 1em 0.5em;'});
  section.appendChild(body);

  // Tableau des clés/valeurs
  const table = el('table', {style:'width:100%;'},
    el('thead', {}, el('tr', {},
      el('th', {style:"width:17.5%"}, 'Clé'),
      el('th', {style:"width:55%"}, 'Valeur'),
      el('th', {style:"width:5%"}, 'Taille'),
      el('th', {style:"width:22.5%"}, 'Actions')
    )),
    el('tbody', {},
      ...filtered.map(([k, v]) => renderRow(domain, tabId, k, v, section))
    )
  );
  body.appendChild(table);
  // Ligne d'ajout (nouvelle méthode)
  createAddRow(domain, tabId, section);

  // Export bouton
  body.appendChild(el('button', {
    onclick: () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `localStorage-${domain.replace(/[^a-z0-9]/gi,'_')}-${nowForFilename()}.json`;
      document.body.appendChild(a);
      a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},500);
    }
  }, 'Exporter ce domaine'));

  // Ouvre/ferme au clic sur le header
  head.onclick = () => { body.style.display = (body.style.display === 'none' ? '' : 'none'); };
  return section;
}

// -- Refresh d’un domaine localStorage (remplace juste le panneau) --
async function refreshDomainPanel(section, domain, tabId) {
  // 1) Mémorise si le panneau était ouvert
  const body = section.children[1];
  const wasOpen = body && body.style.display !== 'none';

  // 2) Récupère à nouveau les données depuis localStorage
  const data = await runInTab(tabId, () => {
    let o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      o[k] = localStorage.getItem(k);
    }
    return o;
  });

  // 3) Reconstruit un nouveau panneau
  const newSection = renderDomainPanel(domain, data, tabId);

  // 4) Si le panneau ancien était ouvert, on le ré-ouvre
  if (wasOpen) {
    const newBody = newSection.children[1];
    if (newBody) newBody.style.display = '';
  }

  // 5) Remplace l’ancien par le nouveau
  section.replaceWith(newSection);
}

function renderRow(domain, tabId, k, v, section) {
  let keyInput, valueInput, saveBtn, dirtyIcon, valueSize, copyKeyBtn, copyValueBtn, copyTimeoutK, copyTimeoutV;
  let pristineKey = k, pristineValue = v;

  function checkDirty() {
    const dirty = (keyInput.value !== pristineKey || valueInput.value !== pristineValue);
    dirtyIcon.style.display = dirty ? '' : 'none';
    saveBtn.disabled = !dirty;
  }
  function updateValueSize() {
    const len = utf8Length(valueInput.value);
    valueSize.textContent = `${len} o`;
    if (len > 100_000) {
      valueSize.style.color = "var(--danger)";
      valueSize.title = "Très volumineux : risque de plantage !";
    } else {
      valueSize.style.color = "";
      valueSize.title = "";
    }
  }

  // Détection si la ligne correspond au filtre
  const isMatch = (filter !== '' && (k.toLowerCase().includes(filter) || (v && v.toLowerCase().includes(filter))));
  // Ligne (mise en évidence en arrière-plan si match)
  const row = el('tr', { style: isMatch ? 'background-color: var(--accent); color: white;' : '' },
    el('td', {}, keyInput = el('input', {
      type:'text',
      value:k,
      className:'key',
      style:"width:100%",
      oninput: () => checkDirty()
    })),
    el('td', {},
      valueInput = el('input', {
        type:'text',
        value:v,
        className:'value',
        style:"width:100%",
        oninput: () => { checkDirty(); updateValueSize(); }
      }),
      dirtyIcon = el('span', {style:"color:var(--danger);display:none;font-size:1.2em;margin-left:6px;"}, '•')
    ),
    valueSize = el('td', {style:"color:var(--muted);text-align:right;font-size:0.95em;"}),
    el('td', {},
      saveBtn = el('button', {
        disabled:true,
        onclick: async () => {
          if (!keyInput.value) return;
          // Edition de clé
          if (keyInput.value !== pristineKey) {
            const keys = await runInTab(tabId, () => Object.keys(localStorage));
            if (keys.includes(keyInput.value)) {
              alert("Une clé identique existe déjà.");
              return;
            }
            await runInTab(tabId, (ok, nk, v) => {
              localStorage.setItem(nk, v);
              localStorage.removeItem(ok);
            }, [pristineKey, keyInput.value, valueInput.value]);
          } else if (valueInput.value !== pristineValue) {
            await runInTab(tabId, (k,v)=>localStorage.setItem(k,v), [keyInput.value,valueInput.value]);
          }
          // Refresh juste la ligne :
          const data = await runInTab(tabId, () => {
            let o = {};
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              o[k] = localStorage.getItem(k);
            }
            return o;
          });
          // On cherche la nouvelle valeur (par la nouvelle clé si renommage)
          const newKey = keyInput.value;
          const newValue = data[newKey];
          const newRow = renderRow(domain, tabId, newKey, newValue, section);
          row.replaceWith(newRow);
        }
      }, 'Enregistrer'),

      copyKeyBtn = el('button', {
        onclick: async () => {
          await copyToClipboard(keyInput.value);
          copyKeyBtn.textContent = "✓ Clé copiée";
          copyKeyBtn.disabled = true;
          clearTimeout(copyTimeoutK);
          copyTimeoutK = setTimeout(() => {
            copyKeyBtn.textContent = "Copier clé";
            copyKeyBtn.disabled = false;
          }, 3000);
        }
      }, 'Copier clé'),
      copyValueBtn = el('button', {
        onclick: async () => {
          await copyToClipboard(valueInput.value);
          copyValueBtn.textContent = "✓ Valeur copiée";
          copyValueBtn.disabled = true;
          clearTimeout(copyTimeoutV);
          copyTimeoutV = setTimeout(() => {
            copyValueBtn.textContent = "Copier valeur";
            copyValueBtn.disabled = false;
          }, 3000);
        }
      }, 'Copier valeur'),
      el('button', {
        onclick: async () => {
          // Refresh valeur brute depuis localStorage (sans reload complet)
          const value = await runInTab(tabId, (k) => localStorage.getItem(k), [pristineKey]);
          if (value === null) {
            alert("La clé n'existe plus dans localStorage.");
            renderMain();
            return;
          }
          keyInput.value = pristineKey;
          valueInput.value = value;
          pristineValue = value;
          setTimeout(() => { checkDirty(); updateValueSize(); }, 0);
        }
      }, 'Refresh'),
      el('button', {
        onclick: () => {
          if (confirm(`Supprimer ${keyInput.value} de ${domain} ? Cette action est irréversible.`)) {
            delItem(tabId, keyInput.value, section, domain);
          }
        }
      }, 'Supprimer')
    )
  );
  setTimeout(() => { updateValueSize(); checkDirty(); }, 0);
  return row;
}

// -- Fonctions d’ajout/suppression --
async function addItem(domain, tabId, row, section) {
  // Invalider le cache après ajout
  cachedLocalData = null;
  const key = row.querySelector('.key').value;
  const value = row.querySelector('.value').value;
  if(!key) return;
  await runInTab(tabId, (k,v)=>localStorage.setItem(k,v), [key,value]);
  // Refresh uniquement le tableau des lignes, pas la section complète
  const data = await runInTab(tabId, () => {
    let o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      o[k] = localStorage.getItem(k);
    }
    return o;
  });
  // On regénère seulement le <tbody>
  const table = section.querySelector('table');
  if (table) {
    const tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.innerHTML = '';
      Object.entries(data).forEach(([k, v]) => {
        tbody.appendChild(renderRow(domain, tabId, k, v, section));
      });
      // Ligne d'ajout (nouvelle méthode)
      createAddRow(domain, tabId, section);
    }
  }
}
async function delItem(tabId, k, section, domain) {
  // Invalider le cache après suppression
  cachedLocalData = null;
  await runInTab(tabId, (k)=>localStorage.removeItem(k), [k]);
  // Refresh tableau (cf. addItem)
  const data = await runInTab(tabId, () => {
    let o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      o[k] = localStorage.getItem(k);
    }
    return o;
  });
  const table = section.querySelector('table');
  if (table) {
    const tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.innerHTML = '';
      Object.entries(data).forEach(([k, v]) => {
        tbody.appendChild(renderRow(domain, tabId, k, v, section));
      });
      // Ligne d'ajout (nouvelle méthode)
      createAddRow(domain, tabId, section);
    }
  }
}

// -----------------------------------------------------------------------
// --- Panneau d’IndexedDB – chargement initial (fusion getAll + getAllKeys)
// -----------------------------------------------------------------------
async function renderIndexedDB() {
  // 1) Retire tout ancien « exportAllBtn » (même si on vient d’un autre appel)
  const oldExportBtn = document.getElementById('exportAllBtn');
  if (oldExportBtn) oldExportBtn.remove();
  // 2) Masque et vide le message d’erreur (Local/Session/IndexedDB)
  const errDiv = document.getElementById('errorMessage');
  if (errDiv) {
    errDiv.style.display = 'none';
    errDiv.textContent = '';
  }
  // 3) On peut maintenant vider le contenu pour afficher le loader
  const content = document.getElementById('content');
  content.innerHTML = "Chargement…";
  let failedCount;
  let allData = {};

  if (!cachedIDBData) {
    // Première visite : récupération et cache
    failedCount = 0;
    allData = {};
    const tabs = await getTabs();
    for (const tab of tabs) {
      const url = tab.url;
      if (url.startsWith('chrome://') || url.includes('chrome.google.com/webstore') || url.includes('accounts.google.com')) {
        continue;
      }
      try {
        const domain = new URL(url).origin;
        if (allData[domain]) continue;
        let result;
        try {
          result = await runInTab(tab.id, async () => {
            if (!('indexedDB' in window)) return { bases: [], error: 'noIndexedDB' };
            if (!indexedDB.databases) return { bases: [], error: 'noDatabasesAPI' };
            const dbs = await indexedDB.databases();
            const bases = [];
            for (const dbInfo of dbs) {
              if (!dbInfo.name) continue;
              const req = indexedDB.open(dbInfo.name, dbInfo.version);
              const base = { name: dbInfo.name, version: dbInfo.version, stores: [] };
              await new Promise(resolve => {
                req.onsuccess = event => {
                  const db = event.target.result;
                  const stores = Array.from(db.objectStoreNames);
                  let doneStores = 0;
                  if (stores.length === 0) { resolve(); return; }
                  for (const sName of stores) {
                    try {
                      const storeObj = db.transaction(sName, "readonly").objectStore(sName);
                      const getAllVals = storeObj.getAll();
                      const getAllKeysReq = storeObj.getAllKeys();

                      getAllVals.onsuccess = () => {
                        const values = getAllVals.result;
                        getAllKeysReq.onsuccess = () => {
                          const keys = getAllKeysReq.result;
                          const merged = (storeObj.keyPath === null)
                            ? values.map((obj, idx) => ({ __lsme_id: keys[idx], ...obj }))
                            : values;
                          base.stores.push({ name: sName, items: merged, keyPath: storeObj.keyPath });
                          doneStores++;
                          if (doneStores === stores.length) resolve();
                        };
                        getAllKeysReq.onerror = () => {
                          base.stores.push({ name: sName, items: [], keyPath: storeObj.keyPath });
                          doneStores++;
                          if (doneStores === stores.length) resolve();
                        };
                      };
                      getAllVals.onerror = () => {
                        base.stores.push({ name: sName, items: [], keyPath: storeObj.keyPath });
                        doneStores++;
                        if (doneStores === stores.length) resolve();
                      };
                    } catch {
                      base.stores.push({ name: sName, items: [], keyPath: null });
                      doneStores++;
                      if (doneStores === stores.length) resolve();
                    }
                  }
                };
                req.onerror = req.onblocked = () => resolve();
              });
              bases.push(base);
            }
            return { bases };
          });
        } catch {
          failedCount++;
          continue;
        }
        if (!result || !result.bases || result.bases.length === 0 || result.error) {
          continue;
        }
        allData[domain] = result.bases;
      } catch (e) {
        console.warn(`Erreur générale IndexedDB pour onglet ${tab.id}`, e);
        continue;
      }
    }
    cachedIDBData = allData;
    cachedIDBFailedCount = failedCount;
  } else {
    allData = cachedIDBData;
    failedCount = cachedIDBFailedCount;
  }

  // Nombre de domaines lus
  const countDomainsIDB = Object.keys(allData).length;
  const btnIDB = document.querySelector('#storageSelector button[data-mode="indexedDB"]');
  if (btnIDB) btnIDB.textContent = `IndexedDB (${countDomainsIDB})`;

  // Affichage éventuel d’erreur d’injection (IndexedDB)
  if (failedCount > 0 && errDiv) {
    errDiv.style.display = '';
    errDiv.style.cssText = 'padding:0.5em 1em;background:#fdd;border-left:4px solid var(--danger);margin-bottom:1em;color:var(--danger);font-weight:bold;';
    errDiv.textContent = `Impossible de lire IndexedDB sur ${failedCount} onglet(s) – certaines pages bloquent l’injection.`;
  }

  // Si aucune base n’a été trouvée, on affiche le message et on arrête
  if (countDomainsIDB === 0) {
    content.innerHTML = "<div style='color:var(--muted);padding:3em;text-align:center;'>Aucune base IndexedDB trouvée dans les domaines ouverts</div>";
    return;
  }

  // Création du bouton "Exporter tout" (depuis le cache) et insertion avant l’affichage des domaines
  const exportAllBtn = el('button', {
    id: 'exportAllBtn',
    type: 'button',
    style: 'margin-bottom:1.5em;',
    onclick: () => {
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `indexeddb-all-${nowForFilename()}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);
    }
  }, 'Exporter tout');
  content.innerHTML = "";
  content.appendChild(exportAllBtn);

  // Affichage de chaque domaine (filtre appliqué)
  Object.entries(allData).forEach(([domain, bases]) => {
    // Calcul du nombre total d’objets matching selon le filtre
    let totalMatches = 0;
    bases.forEach(base => {
      base.stores.forEach(store => {
        const countInStore = (store.items || []).filter(obj =>
          !filter
          || Object.keys(obj).some(k => k.toLowerCase().includes(filter))
          || Object.values(obj).some(v => (v && String(v).toLowerCase().includes(filter)))
        ).length;
        totalMatches += countInStore;
      });
    });
    const hasMatch = (filter !== '' && totalMatches > 0);
    const section = renderIDBDomainPanel(domain, bases, null);
    if (hasMatch) {
      const badge = section.querySelector('.badge');
      if (badge) badge.textContent = `${totalMatches}`;
    }
    content.appendChild(section);
  });
}

function renderIDBDomainPanel(domain, bases, tabId) {
  // Calcul du nombre total d’objets matching dans TOUTES les bases
  let totalMatches = 0;
  bases.forEach(base => {
    // Pour chaque store, on filtre les entrées (on peut réutiliser la même logique que dans renderIDBStorePanel)
    base.stores.forEach(store => {
      const countInStore = (store.items || []).filter(obj =>
        !filter
        || Object.keys(obj).some(k => k.toLowerCase().includes(filter))
        || Object.values(obj).some(v => (v && String(v).toLowerCase().includes(filter)))
      ).length;
      totalMatches += countInStore;
    });
  });
  // On ne met en évidence QUE si un filtre est actif ET qu’il y a des correspondances
  const hasMatch = (filter !== '' && totalMatches > 0);

  const section = el('div', {
    className: hasMatch ? 'domain-section has-match' : 'domain-section',
    style: 'margin-bottom:2em;box-shadow:0 2px 8px #eee;border-radius:8px;overflow:hidden;'
  });
  const h2Title = el('h2', { style:"margin:0;font-size:1.1em;flex:1;" }, domain);
  if (hasMatch) {
    h2Title.appendChild(el('span', { className:'badge' }, `${totalMatches}`));
  }
  const head = el('div', { style:"display:flex;align-items:center;gap:1em;background:var(--panel);padding:0.7em 1em;cursor:pointer;" },
    h2Title,
    el('span', { style:'color:var(--muted);' }, `${bases.length} base(s)`),
   // --- Bouton Refresh pour recharger TOUTES les bases pour ce domaine ---
   el('button', {
     onclick: (e) => {
       e.stopPropagation();                                   // ne pas replier l’accordion
       refreshIDBDomain(section, domain, tabId);
     }
   }, 'Refresh'),
  );
  section.appendChild(head);

  const body = el('div', {style:'display:none;background:var(--bg);padding:1em 1em 0.5em;'});
  section.appendChild(body);

  // Affiche chaque base de données
  bases.forEach(base => {
    body.appendChild(renderIDBBasePanel(base, domain, tabId));
  });

  head.onclick = () => { body.style.display = (body.style.display === 'none' ? '' : 'none'); };
  return section;
}

function renderIDBBasePanel(base, domain, tabId) {
  // Détermine si cette base contient au moins une entrée correspondant au filtre
  let baseHasMatch = false;
  base.stores.forEach(store => {
    const matchCount = (store.items || []).filter(obj =>
      filter !== '' &&
      (Object.keys(obj).some(k => k.toLowerCase().includes(filter)) ||
       Object.values(obj).some(v => v && String(v).toLowerCase().includes(filter)))
    ).length;
    if (matchCount > 0) baseHasMatch = true;
  });

  const baseWrap = el('div', {style:'margin-bottom:1em;border:1px solid var(--border);border-radius:6px;overflow:hidden;'});
  // Applique un style sur baseHead si la base contient un match
  const baseHeadStyle = baseHasMatch
    ? 'display:flex;align-items:center;gap:1em;background:var(--accent);color:white;padding:0.5em 1em;cursor:pointer;'
    : 'display:flex;align-items:center;gap:1em;background:var(--panel);padding:0.5em 1em;cursor:pointer;';
  const baseHead = el('div', { style: baseHeadStyle },
    el('strong', {}, `Base: ${base.name} (v${base.version})`),
    el('span', {style: baseHasMatch ? 'color:inherit;' : 'color:var(--muted);'}, `${base.stores.length} store(s)`),
    el('button', {
      onclick: (e) => {
        e.stopPropagation();
        baseBody.style.display = (baseBody.style.display === 'none' ? '' : 'none');
      }
    }, 'Afficher/Masquer'),
    el('button', {
      onclick: async (e) => {
        e.stopPropagation();
        await refreshIDBBase(base.name, baseWrap, domain, tabId);
      }
    }, 'Refresh'),
    el('button', {
      onclick: () => {
        const blob = new Blob([JSON.stringify(base.stores, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `indexeddb-base-${base.name}-${nowForFilename()}.json`;
        document.body.appendChild(a);
        a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},500);
      }
    }, 'Exporter cette base')
  );
  baseWrap.appendChild(baseHead);

  const baseBody = el('div', {style:'display:none;background:var(--bg);padding:0.6em 1.3em;'});
  baseWrap.appendChild(baseBody);

  base.stores.forEach(store => {
    baseBody.appendChild(renderIDBStorePanel(store, base, domain, tabId, baseWrap));
  });

  baseHead.onclick = () => { baseBody.style.display = (baseBody.style.display === 'none' ? '' : 'none'); };
  return baseWrap;
}

function renderIDBStorePanel(store, base, domain, tabId, baseWrap) {
  // Filtrage clé/valeur global
  const filtered = (store.items || []).filter(obj =>
    !filter || Object.keys(obj).some(k => k.toLowerCase().includes(filter)) ||
      Object.values(obj).some(v => (v && String(v).toLowerCase().includes(filter)))
  );
  let keys = store.items && store.items.length ? Object.keys(store.items[0]) : [];
  // Si certaines entrées ont __lsme_id alors on l’affiche en premier
  if (store.items && store.items.some(e => e.__lsme_id)) {
    if (!keys.includes('__lsme_id')) keys = ['__lsme_id', ...keys];
  }
  const storeWrap = el('div', {style:'margin-bottom:1.3em;'});
  const storeHead = el('div', {style:'display:flex;align-items:center;gap:1em;'},
    el('span', {style:'font-weight:bold;'}, `Store: ${store.name}`),
    el('span', {style:'color:var(--muted);'}, `${filtered.length} / ${(store.items||[]).length}`),
    el('button', {
      onclick: async (e) => {
        e.stopPropagation();
        await refreshIDBStore(domain, base, store.name, storeWrap, tabId);
      }
    }, 'Refresh'),
    el('button', {
      onclick: () => {
        const blob = new Blob([JSON.stringify(store.items, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `indexeddb-store-${base.name}-${store.name}-${nowForFilename()}.json`;
        document.body.appendChild(a);
        a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},500);
      }
    }, 'Exporter ce store')
  );
  storeWrap.appendChild(storeHead);

  // Formulaire d’ajout d’entrée (clé/valeurs dynamiques selon structure détectée)
  if (keys.length) {
    const addForm = el('form', {style:'display:flex;gap:0.7em;margin:0.7em 0;align-items:center;'},
      ...keys.map(key => el('input', {type:'text', placeholder:key, name:key, style:'width:100%;'})),
      el('button', {
        type:'submit',
        onclick: async (e) => {
          e.preventDefault();
          const form = e.target.form || e.target.parentElement;
          const entry = {};
          keys.forEach(k => entry[k] = form[k].value);
          await idbAddEntry(domain, base.name, store, entry, tabId, baseWrap);
        }
      }, 'Ajouter')
    );
    storeWrap.appendChild(addForm);
  }

  if (filtered.length === 0) {
    storeWrap.appendChild(el('div', {style:'color:var(--muted);padding:0.6em 0;'}, "Aucune entrée"));
    return storeWrap;
  }

  // Affiche les entrées (CRUD + Copier)
  const n = keys.length;
  const actionsWidth = 18.2;
  const fieldWidth = (81.8 / n);
  const table = el('table', {style:'width:100%;margin-top:0.4em;'},
    el('thead', {}, el('tr', {},
      ...keys.map(k => el('th', {style:`width:${fieldWidth}%`}, k)),
      el('th', {style:`width:${actionsWidth}%`}, 'Actions')
    )),
    el('tbody', {},
      ...filtered.map(entry => renderIDBRow(
            entry, keys, store, base, domain, tabId, storeWrap))
    )
  );
  storeWrap.appendChild(table);
  return storeWrap;
}

function renderIDBRow(entry, keys, store, base, domain, tabId, storeWrap) {
  let pristine = {...entry};
  const inputs = {};
  let saveBtn, copyBtn, refreshBtn, copyTimeoutV;

  function isDirty() {
    return keys.some(k => (inputs[k]?.value !== String(pristine[k] ?? '')));
  }

  function updateSaveBtn() {
    saveBtn.disabled = !isDirty();
  }

  // Détection si la ligne (entrée) correspond au filtre
  const entryMatches = (filter !== '' &&
    (Object.keys(entry).some(k => k.toLowerCase().includes(filter)) ||
     Object.values(entry).some(v => v && String(v).toLowerCase().includes(filter))));
  // Une entrée = une ligne de table (mise en évidence si match)
  const row = el('tr', { style: entryMatches ? 'background-color: var(--accent); color: white;' : '' },
    ...keys.map(k =>
      el('td', {},
        inputs[k] = el('input', {
          type: 'text',
          value: String(entry[k] ?? ''),
          style: 'width:100%;',
          oninput: updateSaveBtn
        })
      )
    ),
    el('td', {},
      saveBtn = el('button', {
        disabled: true,
        onclick: async () => {
          const updated = {};
          keys.forEach(k => updated[k] = inputs[k].value);
          await idbUpdateEntry(domain, base.name, store, pristine, updated, tabId, row, keys, storeWrap);
        }
      }, 'Enregistrer'),
      copyBtn = el('button', {
        onclick: async () => {
          let text, feedback, normal;
          if (keys.length === 1) {
            text = inputs[keys[0]].value;
            feedback = "✓ Valeur copiée";
            normal = "Copier valeur";
          } else {
            const obj = {};
            keys.forEach(k => obj[k] = inputs[k].value);
            text = JSON.stringify(obj, null, 2);
            feedback = "✓ JSON copié";
            normal = "Copier JSON";
          }
          await copyToClipboard(text);
          copyBtn.textContent = feedback;
          copyBtn.disabled = true;
          clearTimeout(copyTimeoutV);
          copyTimeoutV = setTimeout(() => {
            copyBtn.textContent = normal;
            copyBtn.disabled = false;
          }, 3000);
        }
      }, keys.length === 1 ? "Copier valeur" : "Copier JSON"),
      el('button', {
        onclick: async () => {
          if (confirm('Supprimer cette entrée ? Action irréversible.')) {
            await idbDeleteEntry(domain, base.name, store, pristine, tabId, storeWrap);
          }
        }
      }, 'Supprimer')
    )
  );
  return row;
}

// Ajout d’entrée IndexedDB (avec journalisation et fermeture explicite)
async function idbAddEntry(domain, baseName, store, entry, tabId, baseWrap) {
  // Invalider le cache IndexedDB avant d’ajouter
  cachedIDBData = null;
  /* On ne crée __lsme_id que si le store n’a pas déjà son propre keyPath */
  if (store.keyPath === undefined || store.keyPath === null) {
    if (!('__lsme_id' in entry)) {
      entry.__lsme_id = String(Date.now()) + '-' + Math.random().toString(36).slice(2,10);
    }
  }

  await runInTab(tabId, (dbName, storeName, obj) => {
    return new Promise((resolve) => {
      const req = indexedDB.open(dbName);

      req.onerror = (e) => {
        console.error("❌ Erreur ouverture DB (add) :", e.target.error);
        resolve(false);
      };

      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(storeName, "readwrite");
        const storeObj = tx.objectStore(storeName);

        let request;
        // Si le store a un keyPath natif, on fait juste add(obj)
        if (storeObj.keyPath !== null) {
          request = storeObj.add(obj);
        } else {
          // Sinon on fournit explicitement la clé interne
          request = storeObj.add(obj, obj.__lsme_id);
        }

        request.onsuccess = () => {
          console.log("✅ Ajout réussi pour l'entrée", obj);
        };
        request.onerror = (e2) => {
          console.error("❌ Erreur ADD :", e2.target.error);
        };

        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = (e3) => {
          console.error("❌ Transaction error (add) :", e3.target.error);
          db.close();
          resolve(false);
        };
      };
    });
  }, [baseName, store.name, entry]);

  await refreshIDBStore(domain, { name: baseName }, store.name, baseWrap, tabId);
}

// Modification d’entrée IndexedDB (remplace juste la ligne modifiée)
async function idbUpdateEntry(domain, baseName, storeMeta, oldEntry, newEntry, tabId, row, keys, storeWrap) {
  // Invalider le cache IndexedDB avant de mettre à jour
  cachedIDBData = null;
  // 1. Calcul de la clé primaire
  const pk = primaryKeyForEntry(storeMeta, oldEntry);
  if (pk === undefined) {
    console.warn("🛑 Impossible de trouver la clé primaire pour l'entrée :", oldEntry);
    return;
  }

  // 2. Si on utilisait notre ID maison, on le copie dans le nouvel objet
  if (oldEntry.__lsme_id) {
    newEntry.__lsme_id = oldEntry.__lsme_id;
  }

  // 3. On exécute la mise à jour dans le context de la page (via runInTab)
  await runInTab(tabId, (dbName, storeName, obj, key) => {
    return new Promise((resolve) => {
      const req = indexedDB.open(dbName);
      req.onerror = (e) => {
        console.error("❌ Erreur ouverture DB (update) :", e.target.error);
        resolve(false);
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(storeName, "readwrite");
        const storeObj = tx.objectStore(storeName);

        let request;
        // Si le store a un keyPath natif (non null), on fait juste put(obj)
        if (storeObj.keyPath !== null) {
          request = storeObj.put(obj);
        } else {
          // sinon on fournit explicitement la clé
          request = storeObj.put(obj, key);
        }

        request.onsuccess = () => {
          console.log("✅ Mise à jour réussie pour la clé", key);
        };
        request.onerror = (e2) => {
          console.error("❌ Erreur PUT :", e2.target.error);
        };

        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = (e3) => {
          console.error("❌ Transaction error (update) :", e3.target.error);
          db.close();
          resolve(false);
        };
      };
    });
  }, [baseName, storeMeta.name, newEntry, pk]);

  // 4. Enfin, on rafraîchit l'affichage du store concerné
  await refreshIDBStore(domain, { name: baseName }, storeMeta.name, storeWrap, tabId);
}

// Suppression d’entrée IndexedDB
async function idbDeleteEntry(domain, baseName, storeMeta, entry, tabId, storeWrap) {
  // Invalider le cache IndexedDB avant de supprimer
  cachedIDBData = null;
  // 1. Récupération de la clé primaire
  const keyToDelete = primaryKeyForEntry(storeMeta, entry);
  if (keyToDelete === undefined) {
    console.warn("🛑 Suppression impossible : clé primaire introuvable pour l'entrée", entry);
    return;
  }

  // 2. On exécute la suppression dans le context de la page
  await runInTab(tabId, (dbName, storeName, key) => {
    return new Promise((resolve) => {
      const req = indexedDB.open(dbName);
      req.onerror = (e) => {
        console.error("❌ Erreur ouverture DB (delete) :", e.target.error);
        resolve(false);
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(storeName, "readwrite");
        const storeObj = tx.objectStore(storeName);

        // On supprime la clé :
        const deleteReq = storeObj.delete(key);
        deleteReq.onsuccess = () => {
          console.log("✅ Suppression réussie pour la clé", key);
        };
        deleteReq.onerror = (e2) => {
          console.error("❌ Erreur DELETE :", e2.target.error);
        };

        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = (e3) => {
          console.error("❌ Transaction error (delete) :", e3.target.error);
          db.close();
          resolve(false);
        };
      };
    });
  }, [baseName, storeMeta.name, keyToDelete]);

  // 3. Puis on rafraîchit l'affichage du store
  await refreshIDBStore(domain, { name: baseName }, storeMeta.name, storeWrap, tabId);
}

async function refreshIDBStore(domain, base, storeName, storeWrap, tabId) {
  // Récupère à la fois les valeurs et les clés du store
  // 1) État ouvert ?
  const storeBody = storeWrap.children[1];
  const wasOpen = storeBody && storeBody.style.display !== 'none';

  // 2) Récupère items
  const updatedStore = await runInTab(tabId, async (dbName, sName) => {
    return new Promise(resolve => {
      const req = indexedDB.open(dbName);
      req.onerror = () => {
        resolve({ name: sName, items: [], keyPath: null });
      };
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction(sName, "readonly");
        const storeObj = tx.objectStore(sName);

        // Lance en parallèle getAll() et getAllKeys()
        const getAllVals = storeObj.getAll();
        const getAllKeysReq = storeObj.getAllKeys();

        getAllVals.onsuccess = () => {
          const values = getAllVals.result;   // tableau d’objets
          getAllKeysReq.onsuccess = () => {
            const keys = getAllKeysReq.result; // tableau des clés
            // Si le store possède un keyPath inline, pas besoin d’injecter __lsme_id
            const merged = (storeObj.keyPath === null)
              ? values.map((obj, idx) => ({ __lsme_id: keys[idx], ...obj }))
              : values;
            resolve({
              name:    sName,
              items:   merged,
              keyPath: storeObj.keyPath
            });
          };
          getAllKeysReq.onerror = () => {
            // En cas d’erreur getAllKeys, on retourne vide
            resolve({
              name:    sName,
              items:   [],
              keyPath: storeObj.keyPath
            });
          };
        };

        getAllVals.onerror = () => {
          // Si getAll() échoue, on ne récupère rien
          resolve({
            name:    sName,
            items:   [],
            keyPath: storeObj.keyPath
          });
        };
      };
    });
  }, [base.name, storeName]);

  // 3) Reconstruit
  const newPanel = renderIDBStorePanel(updatedStore, base, domain, tabId);

  // 4) Rouvre si besoin
  if (wasOpen) {
    const newBody = newPanel.children[1];
    if (newBody) newBody.style.display = '';
  }

  // 5) Remplace
  storeWrap.replaceWith(newPanel);
}

// Ajustement similaire pour refreshIDBBase
async function refreshIDBBase(baseName, baseWrap, domain, tabId) {
  // 1) État ouvert ?
  const baseBody = baseWrap.children[1];
  const wasOpen = baseBody && baseBody.style.display !== 'none';

  // 2) Requête pour récupérer base + stores
  const updatedBase = await runInTab(tabId, async (dbName) => {
    return new Promise(resolve => {
      const req = indexedDB.open(dbName);
      req.onerror = () => resolve({ name: dbName, version: 0, stores: [] });
      req.onsuccess = e => {
        const db = e.target.result;
        const stores = Array.from(db.objectStoreNames);
        const storeData = [];
        let done = 0;
        if (stores.length === 0) {
          resolve({ name: dbName, version: db.version, stores: [] });
          return;
        }
        for (const sName of stores) {
          try {
            const storeObj = db.transaction(sName, "readonly").objectStore(sName);
            const getAllVals = storeObj.getAll();
            const getAllKeysReq = storeObj.getAllKeys();

            getAllVals.onsuccess = () => {
              const values = getAllVals.result;
              getAllKeysReq.onsuccess = () => {
                const keys = getAllKeysReq.result;
                const merged = (storeObj.keyPath === null)
                  ? values.map((obj, idx) => ({ __lsme_id: keys[idx], ...obj }))
                  : values;
                storeData.push({
                  name:    sName,
                  items:   merged,
                  keyPath: storeObj.keyPath
                });
                done++;
                if (done === stores.length) {
                  resolve({ name: dbName, version: db.version, stores: storeData });
                }
              };
              getAllKeysReq.onerror = () => {
                // Même si getAllKeys échoue, on fournit l’objet sans merged
                storeData.push({
                  name:    sName,
                  items:   [],
                  keyPath: storeObj.keyPath
                });
                done++;
                if (done === stores.length) {
                  resolve({ name: dbName, version: db.version, stores: storeData });
                }
              };
            };
            getAllVals.onerror = () => {
              storeData.push({
                name:    sName,
                items:   [],
                keyPath: storeObj.keyPath
              });
              done++;
              if (done === stores.length) {
                resolve({ name: dbName, version: db.version, stores: storeData });
              }
            };
          } catch {
            // Si on ne peut même pas ouvrir le store en lecture
            storeData.push({
              name:    sName,
              items:   [],
              keyPath: null
            });
            done++;
            if (done === stores.length) {
              resolve({ name: dbName, version: db.version, stores: storeData });
            }
          }
        }
      };
    });
  }, [baseName]);

  // 3) Reconstruit le panel
  const newPanel = renderIDBBasePanel(updatedBase, domain, tabId);

  // 4) Rouvre si besoin
  if (wasOpen) {
    const newBody = newPanel.children[1];
    if (newBody) newBody.style.display = '';
  }
  
  // 5) Remplace
  baseWrap.replaceWith(newPanel);
}

// Ajustement similaire pour refreshIDBDomain (lorsque vous chargez d’un coup toutes les bases)
async function refreshIDBDomain(section, domain, tabId) {
  // Invalider le cache IndexedDB avant de rafraîchir l’univers des bases
  cachedIDBData = null;
  // 1) Y avait-il un body visible ?
  const body = section.children[1];
 	const wasOpen = body && body.style.display !== 'none';

  // 2) Recharge toutes les bases via runInTab
  const result = await runInTab(tabId, async () => {
    if (!('indexedDB' in window)) return { bases: [] };
    if (!indexedDB.databases) return { bases: [] };
    const dbs = await indexedDB.databases();
    const bases = [];
    for (const dbInfo of dbs) {
      if (!dbInfo.name) continue;
      const req = indexedDB.open(dbInfo.name, dbInfo.version);
      const base = { name: dbInfo.name, version: dbInfo.version, stores: [] };
      await new Promise(resolve => {
        req.onsuccess = event => {
          const db = event.target.result;
          const stores = Array.from(db.objectStoreNames);
          let doneStores = 0;
          if (stores.length === 0) {
            resolve();
            return;
          }
          for (const sName of stores) {
            try {
              const storeObj = db.transaction(sName, "readonly").objectStore(sName);
              const getAllVals = storeObj.getAll();
              const getAllKeysReq = storeObj.getAllKeys();

              getAllVals.onsuccess = () => {
                const values = getAllVals.result;
                getAllKeysReq.onsuccess = () => {
                  const keys = getAllKeysReq.result;
                  const merged = (storeObj.keyPath === null)
                    ? values.map((obj, idx) => ({ __lsme_id: keys[idx], ...obj }))
                    : values;
                  base.stores.push({
                    name:    sName,
                    items:   merged,
                    keyPath: storeObj.keyPath
                  });
                  doneStores++;
                  if (doneStores === stores.length) resolve();
                };
                getAllKeysReq.onerror = () => {
                  base.stores.push({
                    name:    sName,
                    items:   [],
                    keyPath: storeObj.keyPath
                  });
                  doneStores++;
                  if (doneStores === stores.length) resolve();
                };
              };
              getAllVals.onerror = () => {
                base.stores.push({
                  name:    sName,
                  items:   [],
                  keyPath: storeObj.keyPath
                });
                doneStores++;
                if (doneStores === stores.length) resolve();
              };
            } catch {
              base.stores.push({
                name:    sName,
                items:   [],
                keyPath: null
              });
              doneStores++;
              if (doneStores === stores.length) resolve();
            }
          }
        };
        req.onerror = req.onblocked = () => resolve();
      });
      bases.push(base);
    }
    return { bases };
  });

  // 3) Reconstruit le panneau
  const newSection = renderIDBDomainPanel(domain, result.bases, tabId);

  // 4) Si on l’avait déroulé, on l’ouvre à nouveau
  if (wasOpen) {
    const newBody = newSection.children[1];
    if (newBody) newBody.style.display = '';
  }

  // 5) Remplace
  section.replaceWith(newSection);
}

// On lance le rendu une fois que tout est initialisé
renderMain();
