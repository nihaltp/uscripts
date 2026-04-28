// ==UserScript==
// @name         YouTube Playback Speed
// @description  Remembers and reapplies playback speed on YouTube
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://www.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @version      1.0.0
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/yt/playback_speed.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/yt/playback_speed.user.js
// ==/UserScript==

(function () {
  "use strict";

  // MARK: Globals
  const STORAGE_KEY = "yt-playback-speed";
  let ignoreNextRateChange = false;

  // MARK: Helpers
  function consoleLog(...args) {
    console.log("[YT Speed]", ...args);
  }

  function getSavedSpeed() {
    const val = localStorage.getItem(STORAGE_KEY);
    const speed = parseFloat(val);
    return Number.isFinite(speed) && speed > 0 ? speed : 1;
  }

  function saveSpeed(speed) {
    localStorage.setItem(STORAGE_KEY, speed);
  }

  function getPlaybackRate(player) {
    if (player && player.getPlaybackRate) {
      return player.getPlaybackRate();
    }
  }

  function setPlaybackRate(player, speed) {
    if (player && player.setPlaybackRate) {
      player.setPlaybackRate(speed);
    }
  }

  function getVideoRate(video) {
    return video ? video.playbackRate : undefined;
  }

  function setVideoRate(video, speed) {
    if (video) {
      video.playbackRate = speed;
    }
  }

  function getPlayer() {
    return document.querySelector(".html5-video-player");
  }

  function getVideo() {
    return document.querySelector("video");
  }

  function applySpeed() {
    const player = getPlayer();
    const speed = getSavedSpeed();
    if (player && player.setPlaybackRate && player.getPlaybackRate) {
      const current = getPlaybackRate(player);
      if (current !== speed) {
        ignoreNextRateChange = true;
        setPlaybackRate(player, speed);
        consoleLog("Applied (player):", speed);
      }
    } else {
      const video = getVideo();
      if (video) {
        const current = getVideoRate(video);
        if (current !== speed) {
          ignoreNextRateChange = true;
          setVideoRate(video, speed);
          consoleLog("Applied (video):", speed);
        }
      }
    }
  }

  function waitForVideo() {
    return new Promise((resolve) => {
      const check = () => {
        const video = getVideo();
        if (video) return resolve(video);
        requestAnimationFrame(check);
      };
      check();
    });
  }

  // MARK: Logic
  async function setup() {
    const video = await waitForVideo();

    if (!video || video._ytSpeedAttached) return;
    video._ytSpeedAttached = true;

    // 🎯 Apply when playback actually starts
    video.addEventListener(
      "playing",
      () => {
        consoleLog("Video started → applying speed");
        applySpeed();
      },
      { once: true },
    );

    // Listen ONLY to actual speed changes
    video.addEventListener(
      "ratechange",
      () => {
        if (ignoreNextRateChange) {
          ignoreNextRateChange = false;
          return;
        }
        const speed = video.playbackRate;
        saveSpeed(speed);
        consoleLog("Saved:", speed);

        // Force UI update if another extension changed the speed
        const player = getPlayer();
        if (
          player &&
          player.setPlaybackRate &&
          player.getPlaybackRate &&
          player.getPlaybackRate() !== speed
        ) {
          ignoreNextRateChange = true;
          setPlaybackRate(player, speed);
          consoleLog("Synced UI (player):", speed);
        }
      },
      { passive: true },
    );
  }

  window.addEventListener("yt-navigate-finish", () => {
    setup();
  });

  // Initial load
  setup();
})();
