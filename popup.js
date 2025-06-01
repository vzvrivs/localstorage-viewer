(async function() {
  const tabs = await chrome.tabs.query({});
  let html = "";
  for (const tab of tabs) {
    if (!tab.url.startsWith('http')) continue;
    try {
      const [result] = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: () => JSON.stringify(localStorage, null, 2)
      });
      const domain = new URL(tab.url).origin;
      const data = JSON.parse(result.result);
      html += `<h2>${domain}</h2>`;
      if (Object.keys(data).length === 0) {
        html += `<div>(Vide)</div>`;
      } else {
        html += `<pre>${JSON.stringify(data, null, 2)}</pre>`;
      }
    } catch(e) {
      // Pas de localStorage accessible
    }
  }

  document.getElementById("openBtn").onclick = () => {
    chrome.tabs.create({url: chrome.runtime.getURL("index.html")});
    window.close();
  };
})();
