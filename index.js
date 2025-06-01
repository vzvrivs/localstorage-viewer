async function getTabs() {
  const tabs = await chrome.tabs.query({});
  // Ne garde que http/https, pas d'URL système
  return tabs.filter(tab => tab.url && tab.url.startsWith('http'));
}

// Exécute une fonction dans le contexte d'un tab (promesse)
function runInTab(tabId, func) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func
  }).then(results => results[0]?.result);
}

// Charge tout le localStorage de chaque tab
async function getAllLocalStorages() {
  const tabs = await getTabs();
  const storageByDomain = {};
  for (const tab of tabs) {
    try {
      const domain = new URL(tab.url).origin;
      if (!storageByDomain[domain]) {
        const data = await runInTab(tab.id, () => {
          let o = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            o[k] = localStorage.getItem(k);
          }
          return o;
        });
        storageByDomain[domain] = data;
      }
    } catch (e) { /* domaine non accessible */ }
  }
  return storageByDomain;
}

// DOM helpers
function el(tag, props, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (let c of children) {
    if (typeof c === "string") c = document.createTextNode(c);
    if (c) e.appendChild(c);
  }
  return e;
}

document.getElementById('optionsBtn').onclick = () => {
  chrome.runtime.openOptionsPage();
};

function utf8Length(str) {
  return (new TextEncoder().encode(str)).length;
}

// Rendu principal
async function render() {
  const root = document.getElementById("domains");
  root.innerHTML = "Chargement…";
  const allData = await getAllLocalStorages();
  root.innerHTML = "";
  for (const [domain, kv] of Object.entries(allData)) {
    root.appendChild(renderDomain(domain, kv));
  }
  document.getElementById('exportAll').onclick = () => {
    const blob = new Blob([JSON.stringify(allData, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.getElementById('download');
    a.href = url;
    a.download = "localStorage-all.json";
    a.style.display = '';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
}

// Appels édition/suppression/ajout dans l’onglet cible
async function editItem(domain,k,v) {
  const tabId = await findTabForDomain(domain);
  await runInTab(tabId, (k,v)=>localStorage.setItem(k,v), [k,v]);
  render();
}
async function delItem(domain,k) {
  if (!confirm(`Supprimer ${k} de ${domain}?`)) return;
  const tabId = await findTabForDomain(domain);
  await runInTab(tabId, (k)=>localStorage.removeItem(k), [k]);
  render();
}
async function addItem(domain,row) {
  const key = row.querySelector('.key').value;
  const value = row.querySelector('.value').value;
  if(!key) return;
  const tabId = await findTabForDomain(domain);
  await runInTab(tabId, (k,v)=>localStorage.setItem(k,v), [key,value]);
  render();
}
async function findTabForDomain(domain) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      if (tab.url && new URL(tab.url).origin === domain) return tab.id;
    } catch {}
  }
  throw new Error("Onglet pour " + domain + " non trouvé. Ouvre la page cible.");
}

async function refreshDomain(section, domain) {
  // Recharge la map locale du domaine concerné et remplace le contenu
  const tabs = await getTabs();
  let tabId = null;
  for (const tab of tabs) {
    try {
      if (tab.url && new URL(tab.url).origin === domain) {
        tabId = tab.id;
        break;
      }
    } catch {}
  }
  if (!tabId) {
    alert("Onglet pour ce domaine non trouvé.");
    return;
  }
  const kv = await runInTab(tabId, () => {
    let o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      o[k] = localStorage.getItem(k);
    }
    return o;
  });
  // On remplace le .domain-section (section) par un nouveau rendu
  section.replaceWith(renderDomain(domain, kv));
}

function renderDomain(domain, kv) {
  // Ajout d'un bouton d'affichage/masquage
  const section = el('div', {className:'domain-section'});
    const head = el('div', {style:"display:flex;align-items:center;gap:1em;"},
    el('h2', {style:"margin:0;"}, domain),
    el('button', {
        onclick: function() {
        refreshDomain(section, domain);
        }
    }, 'Refresh'),
    el('button', {
        onclick: function() {
        tableWrap.style.display = (tableWrap.style.display === 'none' ? '' : 'none');
        }
    }, 'Afficher/Masquer')
    );

  section.appendChild(head);

  const tableWrap = el('div', {});
  tableWrap.style.display = 'none'; // caché par défaut

  const table = el('table',{},
    el('thead',{},el('tr',{},
      el('th',{},'Clé'),
      el('th',{},'Valeur'),
      el('th',{},'Actions')
    )),
    el('tbody',{},
      ...Object.entries(kv||{}).map(([k,v]) => renderRow(domain,k,v))
    )
  );
  tableWrap.appendChild(table);

  // Ajout d’une ligne pour une nouvelle entrée
  const addRow = el('tr',{},
    el('td',{},el('input',{type:'text',placeholder:'Nouvelle clé',className:'key'})),
    el('td',{},el('input',{type:'text',placeholder:'Valeur',className:'value'})),
    el('td',{},
      el('button',{onclick:()=>addItem(domain,addRow)},'Ajouter')
    )
  );
  table.querySelector('tbody').appendChild(addRow);

  // Export JSON par domaine
  tableWrap.appendChild(el('button',{
    onclick:()=>{
      const blob = new Blob([JSON.stringify(kv,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `localStorage-${domain.replace(/[^a-z0-9]/gi,'_')}.json`;
      document.body.appendChild(a);
      a.click(); setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},500);
    }
  },'Exporter ce domaine'));
  section.appendChild(tableWrap);

  return section;
}

function renderRow(domain, k, v) {
  let keyInput, valueInput, saveBtn, dirtyIcon, valueSize;
  let pristineKey = k, pristineValue = v;

  // Helper pour rafraîchir l'état "modifié"
  function checkDirty() {
    const dirty = (keyInput.value !== pristineKey || valueInput.value !== pristineValue);
    dirtyIcon.style.display = dirty ? '' : 'none';
    saveBtn.disabled = !dirty;
  }

  function updateValueSize() {
    const len = utf8Length(valueInput.value);
    valueSize.textContent = `(${len} o)`;
    if (len > 100_000) {
      valueSize.style.color = "red";
      valueSize.title = "Très volumineux : risque de plantage !";
    } else {
      valueSize.style.color = "";
      valueSize.title = "";
    }
  }

  // La ligne du tableau
  const row = el('tr',{},
    el('td',{}, keyInput = el('input',{
      type:'text',
      value:k,
      className:'key',
      style:"width:100%",
      oninput: function() { checkDirty(); }
    })),
    el('td',{},
      valueInput = el('input',{
        type:'text',
        value:v,
        className:'value',
        style:"width:100%",
        oninput: function() { checkDirty(); updateValueSize(); }
      }),
      ' ',
      valueSize = el('span', {style:"color:#888;font-size:0.9em;"}),
      dirtyIcon = el('span', {style:"color:red;display:none;font-size:1.2em;margin-left:6px;"}, '•')
    ),
    el('td',{className:'actions'},
      saveBtn = el('button',{
        disabled:true,
        onclick: async () => {
          if (!keyInput.value) return;
          const tabId = await findTabForDomain(domain);

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

          render();
        }
      }, 'Enregistrer'),
      el('button',{
        onclick: async () => {
          // Refresh de la valeur brute depuis localStorage (sans tout reload)
          const tabId = await findTabForDomain(domain);
          const value = await runInTab(tabId, (k) => localStorage.getItem(k), [pristineKey]);
          if (value === null) {
            alert("La clé n'existe plus dans localStorage.");
            return;
          }
          // Réinitialise l'édition
          keyInput.value = pristineKey;
          valueInput.value = value;
          pristineValue = value;
          setTimeout(() => {
            checkDirty();
            updateValueSize();
          }, 0);
        }
      }, 'Refresh'),
      el('button',{
        onclick:()=>{
          if (confirm(`Supprimer ${keyInput.value} de ${domain}? Cette action est irréversible.`)) delItem(domain,keyInput.value);
        }
      },'Supprimer')
    )
  );

  // Initialisation après création du row
  setTimeout(() => { updateValueSize(); checkDirty(); }, 0);

  return row;
}


// Edition de la valeur (déjà existant)
async function editItem(domain,k,v) {
  const tabId = await findTabForDomain(domain);
  await runInTab(tabId, (k,v)=>localStorage.setItem(k,v), [k,v]);
  render();
}

// Edition de la clé
async function editKey(domain, oldKey, newKey, value) {
  if (!newKey || newKey === oldKey) return;
  const tabId = await findTabForDomain(domain);
  // Vérifie collision clé
  const keys = await runInTab(tabId, () => Object.keys(localStorage));
  if (keys.includes(newKey)) {
    alert("Une clé identique existe déjà.");
    render();
    return;
  }
  await runInTab(tabId, (ok, nk, v) => {
    const oldVal = localStorage.getItem(ok);
    localStorage.setItem(nk, v ?? oldVal);
    localStorage.removeItem(ok);
  }, [oldKey, newKey, value]);
  render();
}



render();
