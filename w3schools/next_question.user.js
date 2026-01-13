// ==UserScript==
// @name         W3Schools Next Question Auto-Continue
// @description  Auto-click the "Next Question" button on W3Schools quiz modals after clicking "Submit Answer".
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://www.w3schools.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=w3schools.com
// @version      1.0.1
// @grant        none
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/w3schools/next_question.user.js
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/w3schools/next_question.user.js
// ==/UserScript==

(function () {
    'use strict';

    function waitForContinueAndClick() {
        const btn = document.querySelector('button.ws-btn[onclick="goto_next_question()"]');
        if (btn) {
            console.log('[TM] Clicking Next Question modal Continue');
            btn.click();
        } else {
            requestAnimationFrame(waitForContinueAndClick);
        }
    }

    function hookNextButton() {
        const submitBtn = document.querySelector(
            'button#answerbutton[onclick="submit_answer()"]'
        );

        if (!submitBtn) {
            requestAnimationFrame(hookNextButton);
            return;
        }

        submitBtn.addEventListener('click', () => {
            console.log('[TM] Submit Answer clicked, waiting for Next Question modal...');
            waitForContinueAndClick();
        }, true);
        submitBtn.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                waitForContinueAndClick();
            }
        });
    }

    hookNextButton();
})();
