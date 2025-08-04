export const setupOverrideMode = ({ document }: Window) => {
  try {
    let favicon = (document.querySelector("link[rel*='icon']") || document.createElement("link")) as HTMLLinkElement;
    favicon.type = "image/x-icon";
    favicon.rel = "shortcut icon";
    favicon.href =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAuJJREFUOE9VknlIFGEYxp9v9nDdw5TyzrYsDcVYkzSCDqMLvChCosIwhAwkOjAjK9mEDiTJFIqiPwo7of4wWYqoLIUktSjIQhF123VdRXe91t1xZ+arGdec/eCD+R7m/T3vRSA7jmNmrWLGvYVS1AKUAyMUgSo9WqV/0supjhLCD0Y9bnghjyHiw1lUrhN4do9Cq7upXpe6QtSo1wthcooVRsfUwqzPDtAEolZDERM5yNmc9Sxok/FJXX8AcMaiyVyfQ3RaMAa93AC8yw3fp8+Spk5LgSopEb62dghjrt7op/VrJcBIcXm3JntzKng+CEB5HmzHN/DOUQkgGihjo8ENWB2UFx7GPK2vlADDh05kgTJlnknXtrB0k1GTlgJ/3wDmbHaQmVkpeHx4CNNuF3RLIloijYn5MY03PBJUqtdWGAqnt8T1nS3sbWC3RkTFgQoCJkaGoVCqQBgG1OdDmE4D40XSrYkPaYOav0JMr+2EthRroB9v5Wd9md4eG8behGPmTygIIVD6VZIDDTgZNk7BkOGCOnapeG3wa9IJ7cwvAeh9KU8KcJMcGJ0S4ICJVgHaJAJuer6vehOBwHJgQpSBRpPThHbm1QA4u9D6jh9uPLPYcflkCgwiCMC0h0PVrd84mLscWaaIxSlR1BLalX8OlF5fUC0fR9D0zoHqU6mIWRYiyc4xFlV1v7B3ZxxysqPlgEpCuwq2gwofFlR2TsDg0CzWGHUQsxGP6Npn9WBlvBYhaka2J3QXoS3ZSuj1fQCM8g16bhnC+/b5+e/YFIUDufFBCwbABjK8en6MXwsOQxAeyf+oqPmJiSm/JIWHqVBTkRYMUJAjJKO5UQJIkM68O//KPb7wvna3FwM2aVewKkGH86XJMgC5RzKbS0VhEWA2M8jtugTgAgCV1eHFg5dWKah4vxHGuFDxU0zpKiwbqonZLAQB/mfyZV8yFFwZKN0NIDGg94OQt6DkNsl81SOv5S+tZSNenp3Z+QAAAABJRU5ErkJggg==";

    document.getElementsByTagName("head")[0].appendChild(favicon);
  } catch (err) {}
};
