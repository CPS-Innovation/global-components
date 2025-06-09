chrome.storage.sync.get(['urlRoots', 'extensionActive', 'injectScript'], function(result) {
  const isActive = result.extensionActive !== false; // Default to true if not set
  const shouldInjectScript = result.injectScript !== false; // Default to true if not set
  
  if (isActive && result.urlRoots && result.urlRoots.length > 0) {
    const currentUrl = window.location.href;
    
    for (const urlRoot of result.urlRoots) {
      if (currentUrl.startsWith(urlRoot)) {
        if (shouldInjectScript) {
          injectGlobalComponentsScript();
        }
        hideHeadersAndInjectComponent();
        break;
      }
    }
  }
});

function injectGlobalComponentsScript() {
  const script = document.createElement('script');
  script.type = 'module';
  script.referrerPolicy = 'no-referrer-when-downgrade';
  script.src = 'https://sacpsglobalcomponents.blob.core.windows.net/unstable/cps-global-components.js';
  document.head.appendChild(script);
}

function hideHeadersAndInjectComponent() {
  // Hide headers
  const headers = document.querySelectorAll('header:not(cps-global-header header)');
  headers.forEach((header) => {
    if (!header.closest('cps-global-header')) {
      header.style.display = 'none';
    }
  });
  
  // Hide BlueLine
  const blueLine = document.getElementById('b1-BlueLine');
  if (blueLine) {
    blueLine.style.display = 'none';
  }
  
  // Insert cps-global-header at the beginning of the first div with role="main"
  const mainDiv = document.querySelector('div[role="main"]');
  if (mainDiv && !document.querySelector('cps-global-header')) {
    const cpsHeader = document.createElement('cps-global-header');
    cpsHeader.style.cssText = 'top: -50px; position: relative;';
    mainDiv.insertBefore(cpsHeader, mainDiv.firstChild);
    console.log('[Header Hider Extension] cps-global-header component added to div[role="main"]');
  }
  
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList') {
        // Check for removed cps-global-header
        mutation.removedNodes.forEach(node => {
          if (node.nodeType === 1 && node.tagName === 'CPS-GLOBAL-HEADER') {
            console.log('[Header Hider Extension] cps-global-header component was REMOVED from DOM');
          }
        });
        
        // Check for added cps-global-header
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.tagName === 'CPS-GLOBAL-HEADER') {
            console.log('[Header Hider Extension] cps-global-header component was ADDED back to DOM');
          }
        });
        
        // Hide new headers
        const newHeaders = document.querySelectorAll('header:not(cps-global-header header)');
        newHeaders.forEach(header => {
          if (!header.closest('cps-global-header') && header.style.display !== 'none') {
            header.style.display = 'none';
          }
        });
        
        // Hide BlueLine if it reappears
        const newBlueLine = document.getElementById('b1-BlueLine');
        if (newBlueLine && newBlueLine.style.display !== 'none') {
          newBlueLine.style.display = 'none';
        }
        
        // Check if cps-global-header still exists, if not, re-add it
        const existingCpsHeader = document.querySelector('cps-global-header');
        if (!existingCpsHeader) {
          const mainDiv = document.querySelector('div[role="main"]');
          if (mainDiv) {
            const cpsHeader = document.createElement('cps-global-header');
            cpsHeader.style.cssText = 'top: -50px; position: relative;';
            mainDiv.insertBefore(cpsHeader, mainDiv.firstChild);
            console.log('[Header Hider Extension] cps-global-header component RE-INSERTED to div[role="main"] after being removed');
          }
        }
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}