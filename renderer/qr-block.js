(function exposeHandoutQr(root, factory) {
  const api = factory(root.qrcode || (typeof require === "function" ? require("qrcode-generator") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HandoutQr = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function makeHandoutQr(qrcodeFactory) {
  "use strict";

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  }

  function validatedUrl(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return { error: "QR code URL is empty." };
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { error: "QR code URL must begin with http:// or https://." };
      }
      return { url: candidate };
    } catch {
      return { error: "QR code URL is invalid." };
    }
  }

  function renderQrBlock(value, attributes = '') {
    const result = validatedUrl(value);
    if (result.error) {
      return `<div class="qr-code-error" role="note">${escapeHtml(result.error)}</div>`;
    }
    if (typeof qrcodeFactory !== "function") {
      return '<div class="qr-code-error" role="note">QR code generator is unavailable.</div>';
    }

    try {
      const qr = qrcodeFactory(0, "H");
      qr.addData(result.url, "Byte");
      qr.make();
      const svg = qr.createSvgTag({
        cellSize: 1,
        margin: 4,
        scalable: true
      }).replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
      const safeUrl = escapeHtml(result.url);
      const attributeText = String(attributes);
      const width = attributeText.match(/(?:^|\s)width=([0-9.]+(?:in|cm|mm|px|%))(?:\s|$)/i);
      const float = attributeText.match(/(?:^|\s)\.(float-left|float-right)(?:\s|$)/i);
      const classes = `qr-code${float ? ` ${float[1].toLowerCase()}` : ''}`;
      return `<figure class="${classes}" data-qr-value="${safeUrl}" role="img" aria-label="QR code for ${safeUrl}"${width ? ` style="width:${width[1]}"` : ''}>${svg}</figure>`;
    } catch {
      return '<div class="qr-code-error" role="note">This URL is too long to make a QR code.</div>';
    }
  }

  return { renderQrBlock, validatedUrl };
});
