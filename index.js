// ========== Thème sombre automatique + bouton manuel ==========
const themeBtn = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
const THEME_KEY = 'lsme-theme';

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
  const sys = getSystemTheme();
  const realTheme = pref === 'auto' ? sys : pref;
  setThemeToBody(realTheme);

  let icon = '⚡', txt = 'Auto';
  if (pref === 'dark') { icon = '🌙'; txt = 'Sombre'; }
  else if (pref === 'light') { icon = '☀️'; txt = 'Clair'; }
  else { icon = '⚡'; txt = 'Auto'; }
  themeIcon.textContent = icon;
  themeLabel.textContent = txt;
}
// Bascule entre auto -> forcé clair -> forcé sombre -> auto...
themeBtn.onclick = () => {
  let current = getPref();
  let next;
  if (current === 'auto') next = (getSystemTheme() === 'dark') ? 'light' : 'dark';
  else if (current === 'light') next = 'dark';
  else if (current === 'dark') next = 'auto';
  else next = 'auto';
  localStorage.setItem(THEME_KEY, next);
  updateTheme();
};
// Réagit au changement de thème système en mode auto
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);
updateTheme();

// ========== Sélecteur de stockage =============
let currentMode = 'localStorage';
document.querySelectorAll('#storageSelector button').forEach(btn => {
  btn.onclick = function() {
    document.querySelectorAll('#storageSelector button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    renderMain();
  };
});

// ========== Champ filtre =======================
let filter = '';
const filterInput = document.getElementById('filter');
filterInput.oninput = () => { filter = filterInput.value.trim().toLowerCase(); renderMain(); };

// ========== Placeholder pour la suite ==========
function renderMain() {
  if (currentMode === "localStorage") {
    renderLocalStorage();
  } else if (currentMode === "sessionStorage") {
    renderSessionStorage();
  } else {
    // Placeholder
    document.getElementById('content').innerHTML = `<div style="color:var(--muted);padding:3em 0;text-align:center;">
      <strong>Mode :</strong> <span style="color:var(--accent)">${currentMode}</span>
      <br><br>
      (L’affichage du stockage sélectionné sera ici)
    </div>`;
  }
}

// --- Helpers injection / extraction ---
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

async function getTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter(tab => tab.url && tab.url.startsWith('http'));
}
function runInTab(tabId, func, args=[]) {
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
  const content = document.getElementById('content');
  content.innerHTML = "Chargement…";
  const tabs = await getTabs();
  const byDomain = {};
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
        byDomain[domain] = {data, tabId: tab.id};
      }
    } catch {}
  }
  if (Object.keys(byDomain).length === 0) {
    content.innerHTML = "<div style='color:var(--muted);padding:3em;text-align:center;'>Aucun domaine avec localStorage détecté</div>";
    return;
  }

  // Création de chaque panneau domaine
  content.innerHTML = "";

  // Bouton "Exporter tout"
  const exportAllBtn = el('button', {
    style: 'margin-bottom:1.5em;',
    onclick: () => {
      // Regroupe tout dans un objet {domaine: {clé: valeur}}
      const allData = {};
      Object.entries(byDomain).forEach(([domain, {data}]) => {
        allData[domain] = data;
      });
      const blob = new Blob([JSON.stringify(allData, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'localStorage-all.json';
      document.body.appendChild(a);
      a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},500);
    }
  }, 'Exporter tout');
  content.appendChild(exportAllBtn);

  Object.entries(byDomain).forEach(([domain, {data, tabId}]) => {
    content.appendChild(renderDomainPanel(domain, data, tabId));
  });
}

// --- Affichage du sessionStorage multi-onglets ---
async function renderSessionStorage() {
  const content = document.getElementById('content');
  content.innerHTML = "Chargement…";
  const tabs = await getTabs();
  const byTab = {};
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
      byTab[tab.id] = {data, tab};
    } catch {}
  }
  if (Object.keys(byTab).length === 0) {
    content.innerHTML = "<div style='color:var(--muted);padding:3em;text-align:center;'>Aucun onglet avec sessionStorage détecté</div>";
    return;
  }
  
  // Création de chaque panneau domaine
  content.innerHTML = "";

  // Bouton d'export global
  const exportAllBtn = el('button', {
    style: 'margin-bottom:1.5em;',
    onclick: () => {
      const allData = {};
      Object.values(byTab).forEach(({data, tab}) => {
        const tabInfo = `${tab.title} | ${tab.url}`;
        allData[tabInfo] = data;
      });
      const blob = new Blob([JSON.stringify(allData, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'sessionStorage-all.json';
      document.body.appendChild(a);
      a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},500);
    }
  }, 'Exporter tout');
  content.appendChild(exportAllBtn);

  // Création de chaque panneau onglet
  Object.values(byTab).forEach(({data, tab}) => {
    content.appendChild(renderTabPanel(tab, data));
  });
}

function renderTabPanel(tab, data) {
  const tabInfo = `${tab.title || '(sans titre)'} | ${tab.url}`;
  // Filtrage selon le champ "filter"
  const filtered = Object.entries(data)
    .filter(([k,v]) => !filter || k.toLowerCase().includes(filter) || (v && v.toLowerCase().includes(filter)));
  const total = Object.keys(data).length, shown = filtered.length;

  // Création des éléments
  const section = el('div', {className:'domain-section', style:'margin-bottom:2em;box-shadow:0 2px 8px #eee;border-radius:8px;overflow:hidden;'});
  const head = el('div', {style:"display:flex;align-items:center;gap:1em;background:var(--panel);padding:0.7em 1em;cursor:pointer;"},
    el('h2', {style:"margin:0;font-size:1em;flex:1;"}, tabInfo),
    el('span', {style:'font-size:0.95em;color:var(--muted);'}, `${shown} / ${total}`),
    el('button', {
      onclick: (e) => {
        e.stopPropagation();
        refreshTabPanel(section, tab);
      }
    }, 'Refresh'),
    el('button', {
      onclick: (e) => {
        e.stopPropagation();
        body.style.display = (body.style.display === 'none' ? '' : 'none');
      }
    }, 'Afficher/Masquer')
  );
  section.appendChild(head);

  const body = el('div', {style:'display:none;background:var(--bg);padding:1em 1em 0.5em;'});
  section.appendChild(body);

  // Tableau des clés/valeurs
  const table = el('table', {style:'width:100%;'},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Clé'),
      el('th', {}, 'Valeur'),
      el('th', {}, 'Taille'),
      el('th', {}, 'Actions')
    )),
    el('tbody', {},
      ...filtered.map(([k, v]) => renderSessionRow(tab, k, v))
    )
  );
  body.appendChild(table);

  // Ligne d'ajout
  const addRow = el('tr', {},
    el('td', {}, el('input', {type:'text',placeholder:'Nouvelle clé',className:'key',style:'width:100%;'})),
    el('td', {}, el('input', {type:'text',placeholder:'Valeur',className:'value',style:'width:100%;'})),
    el('td', {}, ''),
    el('td', {}, el('button', {
      onclick: () => addSessionItem(tab, addRow)
    }, 'Ajouter'))
  );
  table.querySelector('tbody').appendChild(addRow);

  // Export bouton
  body.appendChild(el('button', {
    onclick: () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `sessionStorage-${(tab.title || 'onglet').replace(/[^a-z0-9]/gi,'_')}.json`;
      document.body.appendChild(a);
      a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},500);
    }
  }, 'Exporter cet onglet'));

  head.onclick = () => { body.style.display = (body.style.display === 'none' ? '' : 'none'); };
  return section;
}

function renderSessionRow(tab, k, v) {
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

  const row = el('tr', {},
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
          renderMain();
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
          if (confirm(`Supprimer ${keyInput.value} de cet onglet ? Cette action est irréversible.`)) delSessionItem(tab.id, keyInput.value);
        }
      }, 'Supprimer')
    )
  );
  setTimeout(() => { updateValueSize(); checkDirty(); }, 0);
  return row;
}

// -- Fonctions d’ajout/suppression sessionStorage --
async function addSessionItem(tab, row) {
  const key = row.querySelector('.key').value;
  const value = row.querySelector('.value').value;
  if(!key) return;
  await runInTab(tab.id, (k,v)=>sessionStorage.setItem(k,v), [key,value]);
  renderMain();
}
async function delSessionItem(tabId, k) {
  await runInTab(tabId, (k)=>sessionStorage.removeItem(k), [k]);
  renderMain();
}

// -- Refresh d’un onglet (remplace le panneau par sa version à jour) --
async function refreshTabPanel(section, tab) {
  const data = await runInTab(tab.id, () => {
    let o = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      o[k] = sessionStorage.getItem(k);
    }
    return o;
  });
  section.replaceWith(renderTabPanel(tab, data));
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

  // Création des éléments
  const section = el('div', {className:'domain-section', style:'margin-bottom:2em;box-shadow:0 2px 8px #eee;border-radius:8px;overflow:hidden;'});
  const head = el('div', {style:"display:flex;align-items:center;gap:1em;background:var(--panel);padding:0.7em 1em;cursor:pointer;"},
    el('h2', {style:"margin:0;font-size:1.1em;flex:1;"}, domain),
    el('span', {style:'font-size:0.95em;color:var(--muted);'}, `${shown} / ${total}`),
    el('button', {
      onclick: (e) => {
        e.stopPropagation();
        refreshDomain(section, domain);
      }
    }, 'Refresh'),
    el('button', {
      onclick: (e) => {
        e.stopPropagation();
        body.style.display = (body.style.display === 'none' ? '' : 'none');
      }
    }, 'Afficher/Masquer')
  );
  section.appendChild(head);

  const body = el('div', {style:'display:none;background:var(--bg);padding:1em 1em 0.5em;'});
  section.appendChild(body);

  // Tableau des clés/valeurs
  const table = el('table', {style:'width:100%;'},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Clé'),
      el('th', {}, 'Valeur'),
      el('th', {}, 'Taille'),
      el('th', {}, 'Actions')
    )),
    el('tbody', {},
      ...filtered.map(([k, v]) => renderRow(domain, tabId, k, v))
    )
  );
  body.appendChild(table);

  // Ligne d'ajout
  const addRow = el('tr', {},
    el('td', {}, el('input', {type:'text',placeholder:'Nouvelle clé',className:'key',style:'width:100%;'})),
    el('td', {}, el('input', {type:'text',placeholder:'Valeur',className:'value',style:'width:100%;'})),
    el('td', {}, ''),
    el('td', {}, el('button', {
      onclick: () => addItem(domain, tabId, addRow)
    }, 'Ajouter'))
  );
  table.querySelector('tbody').appendChild(addRow);

  // Export bouton
  body.appendChild(el('button', {
    onclick: () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `localStorage-${domain.replace(/[^a-z0-9]/gi,'_')}.json`;
      document.body.appendChild(a);
      a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},500);
    }
  }, 'Exporter ce domaine'));

  // Ouvre/ferme au clic sur le header
  head.onclick = () => { body.style.display = (body.style.display === 'none' ? '' : 'none'); };
  return section;
}

// -- Ligne d’un couple clé/valeur (édition, suppression, refresh, taille, sécurité) --
function renderRow(domain, tabId, k, v) {
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

  // Ligne
  const row = el('tr', {},
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
          renderMain();
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
          if (confirm(`Supprimer ${keyInput.value} de ${domain}? Cette action est irréversible.`)) delItem(tabId, keyInput.value);
        }
      }, 'Supprimer')
    )
  );
  setTimeout(() => { updateValueSize(); checkDirty(); }, 0);
  return row;
}

// -- Fonctions d’ajout/suppression --
async function addItem(domain, tabId, row) {
  const key = row.querySelector('.key').value;
  const value = row.querySelector('.value').value;
  if(!key) return;
  await runInTab(tabId, (k,v)=>localStorage.setItem(k,v), [key,value]);
  renderMain();
}
async function delItem(tabId, k) {
  await runInTab(tabId, (k)=>localStorage.removeItem(k), [k]);
  renderMain();
}

// -- Refresh domaine (remplace le panneau par sa version à jour) --
async function refreshDomain(section, domain) {
  const tabs = await getTabs();
  let tabId = null;
  for (const tab of tabs) {
    try {
      if (tab.url && new URL(tab.url).origin === domain) {
        tabId = tab.id; break;
      }
    } catch {}
  }
  if (!tabId) { alert("Onglet pour ce domaine non trouvé."); return; }
  const data = await runInTab(tabId, () => {
    let o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      o[k] = localStorage.getItem(k);
    }
    return o;
  });
  section.replaceWith(renderDomainPanel(domain, data, tabId));
}

renderMain();
