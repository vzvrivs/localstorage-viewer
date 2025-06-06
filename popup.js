document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById("openBtn");
  if (openBtn) {
    openBtn.onclick = () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
      window.close();
    };
  }
});