javascript: (function () {
  const KEY = "cps-global-components-test-override";
  const VALUE = "true";

  const existingDialog = document.getElementById("cps-bookmarklet-dialog");
  if (existingDialog) {
    existingDialog.remove();
    return;
  }

  const dialog = document.createElement("div");
  dialog.id = "cps-bookmarklet-dialog";
  dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 2px solid #333;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 999999;
        font-family: Arial, sans-serif;
        min-width: 300px;
        max-height: 160px;
    `;

  const title = document.createElement("h3");
  title.textContent = "CPS Global Components Test Override";
  title.style.cssText = "margin: 0 0 15px 0; color: #333;";

  const currentValue = localStorage.getItem(KEY);
  const status = document.createElement("p");
  status.style.cssText = "margin: 0 0 15px 0; color: #666;";
  status.textContent = currentValue
    ? `Current value: "${currentValue}"`
    : "No value set";

  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText =
    "display: flex; gap: 10px; justify-content: space-between;";

  const setButton = document.createElement("button");
  setButton.textContent = "Set Value";
  setButton.style.cssText = `
        padding: 8px 16px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        max-height: 34px;
    `;
  setButton.onmouseover = function () {
    this.style.background = "#45a049";
  };
  setButton.onmouseout = function () {
    this.style.background = "#4CAF50";
  };
  setButton.onclick = function () {
    localStorage.setItem(KEY, VALUE);
    alert(`localStorage["${KEY}"] set to "${VALUE}"`);
    dialog.remove();
  };

  const removeButton = document.createElement("button");
  removeButton.textContent = "Remove Value";
  removeButton.style.cssText = `
        padding: 8px 16px;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        max-height: 34px;
    `;
  removeButton.onmouseover = function () {
    this.style.background = "#da190b";
  };
  removeButton.onmouseout = function () {
    this.style.background = "#f44336";
  };
  removeButton.onclick = function () {
    localStorage.removeItem(KEY);
    alert(`localStorage["${KEY}"] removed`);
    dialog.remove();
  };

  const closeButton = document.createElement("button");
  closeButton.textContent = "Close";
  closeButton.style.cssText = `
        padding: 8px 16px;
        background: #ddd;
        color: #333;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        max-height: 34px;
    `;
  closeButton.onmouseover = function () {
    this.style.background = "#ccc";
  };
  closeButton.onmouseout = function () {
    this.style.background = "#ddd";
  };
  closeButton.onclick = function () {
    dialog.remove();
  };

  buttonContainer.appendChild(setButton);
  buttonContainer.appendChild(removeButton);
  buttonContainer.appendChild(closeButton);

  dialog.appendChild(title);
  dialog.appendChild(status);
  dialog.appendChild(buttonContainer);

  document.body.appendChild(dialog);
})();
