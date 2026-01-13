// ==UserScript==
// @name         W3Schools Auto Run SQL
// @description  Automatically clicks the "Run SQL »" button on W3Schools SQL tutorial pages when the page loads
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://www.w3schools.com/sql/try*.asp*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=w3schools.com
// @version      1.0.0
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/w3schools/run_sql.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/w3schools/run_sql.user.js
// ==/UserScript==

(function () {
    'use strict';

    let clicked = false;

    function clickRunOnce() {
        if (clicked) return;

        const btn = document.querySelector(
            'button.ws-btn[onclick*="w3schoolsSQLSubmit"]'
        );

        if (btn) {
            clicked = true;
            console.log('[TM] Auto-clicking Run SQL');
            btn.click();
        } else {
            requestAnimationFrame(clickRunOnce);
        }
    }

    clickRunOnce();
})();
