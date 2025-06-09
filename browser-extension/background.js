// Update declarative net request rules when URL roots change
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'sync' && (changes.urlRoots || changes.extensionActive)) {
    updateCSPRules();
  }
});

// Initialize rules on installation
chrome.runtime.onInstalled.addListener(function() {
  updateCSPRules();
});

function updateCSPRules() {
  chrome.storage.sync.get(['urlRoots', 'extensionActive'], function(result) {
    const isActive = result.extensionActive !== false;
    const urlRoots = result.urlRoots || [];
    
    if (!isActive || urlRoots.length === 0) {
      // Remove all rules if extension is inactive or no URLs configured
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1]
      });
      return;
    }
    
    // Create URL filter patterns from URL roots
    const conditions = urlRoots.map((urlRoot, index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          {
            header: "content-security-policy",
            operation: "set",
            value: "base-uri 'self'; child-src https://view.officeapps.live.com/ 'self' gap:; frame-src https://view.officeapps.live.com/ 'self' gap:; connect-src https://dc.services.visualstudio.com/v2/track https://sacpsglobalcomponents.blob.core.windows.net https://uksouth-1.in.applicationinsights.azure.com/v2/track https://*.in.applicationinsights.azure.com/v2/track https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json https://js.monitor.azure.com/* 'self'; default-src 'self' gap: 'unsafe-inline' 'unsafe-eval'; font-src 'self' data:; img-src 'self' data: blob:; script-src https://sacpsglobalcomponents.blob.core.windows.net 'self' 'unsafe-inline' 'unsafe-eval'; style-src https://sacpsglobalcomponents.blob.core.windows.net 'self' 'unsafe-inline'; frame-ancestors 'self' gap:;"
          }
        ]
      },
      condition: {
        urlFilter: urlRoot + "*",
        resourceTypes: ["main_frame", "sub_frame"]
      }
    }));
    
    // Update dynamic rules
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: conditions.map(r => r.id),
      addRules: conditions
    });
  });
}