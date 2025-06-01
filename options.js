// options.js
const cb = document.getElementById('showEmpty');
chrome.storage.sync.get({showEmpty:false}, opts=>{
  cb.checked = opts.showEmpty;
});
cb.onchange = ()=>chrome.storage.sync.set({showEmpty: cb.checked});
