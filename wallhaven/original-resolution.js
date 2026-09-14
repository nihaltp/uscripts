// ==UserScript==
// @name         Wallhaven Auto Resolution Filler
// @description  Automatically fill in the resolution for Wallhaven images when crop and download overlay is shown.
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?template=bug.yml
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @include      https://wallhaven.cc/w/*
// @icon         https://wallhaven.cc/favicon.ico
// @version      1.0.0
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/wallhaven/original-resolution.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/wallhaven/original-resolution.js
// @run-at       document-idle
// ==/UserScript==

const overlay = document.querySelector("#overlay");

const observer = new MutationObserver(() => {
  if (!overlay.classList.contains("overlay-hidden")) {
    const resolution = document.querySelector(".showcase-resolution");
    if (!resolution) return;

    const match = resolution.textContent.match(/(\d+)\s*[×x]\s*(\d+)/);
    if (!match) return;

    const width = match[1];
    const height = match[2];

    const customResPicker = overlay.querySelector(".respicker-custom");
    const widthInput = customResPicker.querySelector("#form-respicker-custom-width");
    const heightInput = customResPicker.querySelector("#form-respicker-custom-height");
    widthInput.value = width;
    heightInput.value = height;
  }
});

observer.observe(overlay, {
  attributes: true,
  attributeFilter: ["class"]
});
