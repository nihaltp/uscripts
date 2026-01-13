// ==UserScript==
// @name         W3Schools Auto Continue
// @namespace    https://github.com/nihaltp
// @version      2026-01-13
// @description  Auto-click modal Continue after Next is clicked
// @author       nihaltp
// @match        https://www.w3schools.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=w3schools.com
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/w3schools/auto_continue.user.js
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/w3schools/auto_continue.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function waitForContinueAndClick() {
        const btn = document.querySelector('#modalContinueBtn');
        if (btn) {
            console.log('[TM] Clicking modal Continue');
            btn.click();
        } else {
            requestAnimationFrame(waitForContinueAndClick);
        }
    }

    function hookNextButton() {
        const nextBtn = document.querySelector(
            'a.w3-btn.w3-right'
        );

        if (!nextBtn) {
            requestAnimationFrame(hookNextButton);
            return;
        }

        nextBtn.addEventListener('click', () => {
            console.log('[TM] Next clicked, waiting for modal...');
            waitForContinueAndClick();
        }, true);
    }

    hookNextButton();
})();
