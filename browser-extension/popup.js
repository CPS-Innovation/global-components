document.addEventListener('DOMContentLoaded', function() {
  loadUrls();
  loadActivationState();
  
  document.getElementById('addUrl').addEventListener('click', addUrl);
  document.getElementById('newUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addUrl();
    }
  });
  
  document.getElementById('activateToggle').addEventListener('change', function(e) {
    const isActive = e.target.checked;
    chrome.storage.sync.set({ extensionActive: isActive }, function() {
      showStatus(isActive ? 'Extension activated' : 'Extension deactivated', 'success');
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
          if (tab.url) {
            chrome.tabs.reload(tab.id);
          }
        });
      });
    });
  });
  
  document.getElementById('scriptToggle').addEventListener('change', function(e) {
    const injectScript = e.target.checked;
    chrome.storage.sync.set({ injectScript: injectScript }, function() {
      showStatus(injectScript ? 'Script injection enabled' : 'Script injection disabled', 'success');
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
          if (tab.url) {
            chrome.tabs.reload(tab.id);
          }
        });
      });
    });
  });
});

function loadUrls() {
  chrome.storage.sync.get(['urlRoots'], function(result) {
    const urlList = document.getElementById('urlList');
    urlList.innerHTML = '';
    
    const urls = result.urlRoots || [];
    
    urls.forEach((url, index) => {
      const urlItem = document.createElement('div');
      urlItem.className = 'url-item';
      
      const urlText = document.createElement('span');
      urlText.textContent = url;
      urlText.className = 'url-text';
      
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'remove-btn';
      removeBtn.addEventListener('click', () => removeUrl(index));
      
      urlItem.appendChild(urlText);
      urlItem.appendChild(removeBtn);
      urlList.appendChild(urlItem);
    });
    
    if (urls.length === 0) {
      urlList.innerHTML = '<p class="no-urls">No URLs configured yet.</p>';
    }
  });
}

function addUrl() {
  const newUrlInput = document.getElementById('newUrl');
  const newUrl = newUrlInput.value.trim();
  
  if (!newUrl) {
    showStatus('Please enter a URL', 'error');
    return;
  }
  
  chrome.storage.sync.get(['urlRoots'], function(result) {
    const urls = result.urlRoots || [];
    
    if (urls.includes(newUrl)) {
      showStatus('URL already exists', 'error');
      return;
    }
    
    urls.push(newUrl);
    
    chrome.storage.sync.set({ urlRoots: urls }, function() {
      showStatus('URL added successfully', 'success');
      newUrlInput.value = '';
      loadUrls();
      reloadAffectedTabs(newUrl);
    });
  });
}

function removeUrl(index) {
  chrome.storage.sync.get(['urlRoots'], function(result) {
    const urls = result.urlRoots || [];
    const removedUrl = urls[index];
    urls.splice(index, 1);
    
    chrome.storage.sync.set({ urlRoots: urls }, function() {
      showStatus('URL removed successfully', 'success');
      loadUrls();
      reloadAffectedTabs(removedUrl);
    });
  });
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
  
  setTimeout(() => {
    status.textContent = '';
    status.className = '';
  }, 3000);
}

function reloadAffectedTabs(url) {
  chrome.tabs.query({}, function(tabs) {
    tabs.forEach(tab => {
      if (tab.url && tab.url.startsWith(url)) {
        chrome.tabs.reload(tab.id);
      }
    });
  });
}

function loadActivationState() {
  chrome.storage.sync.get(['extensionActive', 'injectScript'], function(result) {
    const isActive = result.extensionActive !== false; // Default to true if not set
    const injectScript = result.injectScript !== false; // Default to true if not set
    document.getElementById('activateToggle').checked = isActive;
    document.getElementById('scriptToggle').checked = injectScript;
  });
}