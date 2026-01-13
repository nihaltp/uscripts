// ==UserScript==
// @name         W3Schools Auto Run SQL
// @namespace    https://github.com/nihaltp
// @version      1.0.0
// @description  Automatically clicks the "Run SQL »" button on W3Schools SQL tutorial pages when the page loads
// @author       nihaltp
// @match        https://www.w3schools.com/sql/try*.asp*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=w3schools.com
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/w3schools/run_sql.user.js
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/w3schools/run_sql.user.js
// @grant        none
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
