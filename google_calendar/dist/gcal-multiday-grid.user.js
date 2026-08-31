// ==UserScript==
// @name         Google Calendar Multi-Day Grid Viewer
// @description  Displays multi-day events in the hourly grid of Google Calendar rather than at the top.
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://calendar.google.com/calendar/*
// @icon         https://calendar.google.com/googlecalendar/images/favicons_2026/calendar_31_256.ico
// @version      1.0.0
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) =>
    function __init() {
      if (err) throw err[0];
      try {
        return (fn && (res = (0, fn[__getOwnPropNames(fn)[0]])((fn = 0))), res);
      } catch (e) {
        throw ((err = [e]), e);
      }
    };
  var __commonJS = (cb, mod) =>
    function __require() {
      try {
        return (
          mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod),
          mod.exports
        );
      } catch (e) {
        throw ((mod = 0), e);
      }
    };

  // google_calendar/core/logging.js
  function log(...args) {
    if (window.gcalMultidayDebug) {
      console.log('[GCAL MULTIDAY]', ...args);
    }
  }
  var init_logging = __esm({
    'google_calendar/core/logging.js'() {
      window.gcalMultidayDebug = false;
    },
  });

  // google_calendar/core/config.js
  var config;
  var init_config = __esm({
    'google_calendar/core/config.js'() {
      config = {
        get hideOriginals() {
          return localStorage.getItem('gcal-hide-original') === 'true';
        },
        set hideOriginals(value) {
          localStorage.setItem('gcal-hide-original', value ? 'true' : 'false');
        },
      };
    },
  });

  // google_calendar/core/dom.js
  function buildFingerprint(chips, columns) {
    const colKeys = Array.from(columns)
      .map((c) => c.getAttribute('data-datekey'))
      .join(',');
    const chipIds = Array.from(chips)
      .filter((c) => !c.classList.contains('gcal-multiday-clone'))
      .map((c) => c.getAttribute('data-eventid') || c.getAttribute('aria-label') || '')
      .sort()
      .join(';');
    return `${colKeys}::${chipIds}`;
  }
  function getHourHeight() {
    const col = document.querySelector('div[role="gridcell"][data-datekey]');
    if (col && col.clientHeight) {
      return col.clientHeight / 24;
    }
    return 60;
  }
  function extractTimes(chip) {
    const text = chip.getAttribute('aria-label') || chip.textContent || '';
    const timeRegex =
      /\b((?:1[0-2]|[1-9])(?::[0-5][0-9])?\s*(?:am|pm|AM|PM)|(?:[01]?[0-9]|2[0-3]):[0-5][0-9])\b/g;
    const matches = [...text.matchAll(timeRegex)];
    function parseTimeMatch(matchStr) {
      matchStr = matchStr.toLowerCase().trim();
      let hour = 0;
      let minute = 0;
      if (matchStr.includes('am') || matchStr.includes('pm')) {
        const isPm = matchStr.includes('pm');
        const timePart = matchStr.replace(/(am|pm)/g, '').trim();
        const parts = timePart.split(':');
        hour = parseInt(parts[0], 10);
        minute = parts.length > 1 ? parseInt(parts[1], 10) : 0;
        if (isPm && hour < 12) hour += 12;
        if (!isPm && hour === 12) hour = 0;
      } else {
        const parts = matchStr.split(':');
        hour = parseInt(parts[0], 10);
        minute = parseInt(parts[1], 10);
      }
      return { hour, minute, decimal: hour + minute / 60 };
    }
    if (matches.length >= 2) {
      return {
        start: parseTimeMatch(matches[0][0]),
        end: parseTimeMatch(matches[matches.length - 1][0]),
      };
    } else if (matches.length === 1) {
      return {
        start: parseTimeMatch(matches[0][0]),
        end: { hour: 24, minute: 0, decimal: 24 },
      };
    }
    return {
      start: { hour: 0, minute: 0, decimal: 0 },
      end: { hour: 24, minute: 0, decimal: 24 },
    };
  }
  function findBestTextOffset(col, cloneTop, cloneHeight, textHeight) {
    const cloneBottom = cloneTop + cloneHeight;
    const existingEvents = col.querySelectorAll('[data-eventchip]:not(.gcal-multiday-clone)');
    const blockers = [];
    existingEvents.forEach((evt) => {
      const evtTop = parseFloat(evt.style.top) || 0;
      const evtHeight = parseFloat(evt.style.height) || 0;
      const evtBottom = evtTop + evtHeight;
      if (evtTop < cloneBottom && evtBottom > cloneTop) {
        blockers.push({
          top: Math.max(evtTop - cloneTop, 0),
          bottom: Math.min(evtBottom - cloneTop, cloneHeight),
        });
      }
    });
    if (blockers.length === 0) return 0;
    blockers.sort((a, b) => a.top - b.top);
    const merged = [];
    for (const b of blockers) {
      if (merged.length > 0 && b.top <= merged[merged.length - 1].bottom) {
        merged[merged.length - 1].bottom = Math.max(merged[merged.length - 1].bottom, b.bottom);
      } else {
        merged.push({ top: b.top, bottom: b.bottom });
      }
    }
    const gaps = [];
    let scanPos = 0;
    for (const b of merged) {
      if (b.top > scanPos) {
        gaps.push({ top: scanPos, size: b.top - scanPos });
      }
      scanPos = Math.max(scanPos, b.bottom);
    }
    if (scanPos < cloneHeight) {
      gaps.push({ top: scanPos, size: cloneHeight - scanPos });
    }
    if (gaps.length === 0) return 0;
    const fittingGap = gaps.find((g) => g.size >= textHeight);
    if (fittingGap) return fittingGap.top;
    return gaps.reduce((a, b) => (a.size > b.size ? a : b)).top;
  }
  function processCalendar() {
    log('Processing calendar for multi-day events...');
    const allDayChips = document.querySelectorAll('[data-eventchip]');
    if (allDayChips.length === 0) return;
    const gridColumns = document.querySelectorAll('div[role="gridcell"][data-datekey]');
    if (gridColumns.length === 0) return;
    const fingerprint = [
      buildFingerprint(allDayChips, gridColumns),
      Array.from(gridColumns)
        .map((column) => {
          const rect = column.getBoundingClientRect();
          return `${rect.left},${rect.top},${rect.width},${rect.height}`;
        })
        .join(';'),
      Array.from(allDayChips)
        .filter((chip) => !chip.classList.contains('gcal-multiday-clone'))
        .map((chip) => {
          const rect = chip.getBoundingClientRect();
          return `${rect.left},${rect.top},${rect.width},${rect.height}`;
        })
        .join(';'),
    ].join('::');
    if (fingerprint === lastFingerprint && document.querySelector('.gcal-multiday-clone')) {
      log('Skipping rebuild \u2014 no structural change detected.');
      return;
    }
    lastFingerprint = fingerprint;
    let globalCommonClasses = '';
    const allHourlyEvents = document.querySelectorAll(
      'div[role="gridcell"][data-datekey] [data-eventchip]:not(.gcal-multiday-clone)'
    );
    if (allHourlyEvents.length > 0) {
      let common = Array.from(allHourlyEvents[0].classList);
      for (let i = 1; i < allHourlyEvents.length; i++) {
        const currentClasses = Array.from(allHourlyEvents[i].classList);
        common = common.filter((c) => currentClasses.includes(c));
      }
      globalCommonClasses = common.join(' ');
    }
    document.querySelectorAll('.gcal-multiday-clone').forEach((el) => el.remove());
    const hourHeight = getHourHeight();
    allDayChips.forEach((chip) => {
      const chipHeight = parseFloat(chip.style.height) || chip.clientHeight || 0;
      if (chipHeight > 30) return;
      if (!chip.style.width || !chip.style.width.includes('%')) return;
      const widthPct = parseFloat(chip.style.width) || 14.28;
      const daysSpan = Math.round(widthPct / 14.28);
      const leftPct = parseFloat(chip.style.left) || 0;
      const startDayIndex = Math.round(leftPct / 14.28);
      if (daysSpan > 1) {
        if (config.hideOriginals) {
          chip.style.opacity = '0.4';
        }
        const times = extractTimes(chip);
        for (let i = 0; i < daysSpan; i++) {
          const targetColIndex = startDayIndex + i;
          if (targetColIndex < gridColumns.length) {
            let dayStartHour = 0;
            let dayEndHour = 24;
            if (i === 0) dayStartHour = times.start.decimal;
            if (i === daysSpan - 1) dayEndHour = times.end.decimal;
            if (i === daysSpan - 1 && dayEndHour === 0) continue;
            const topPx = dayStartHour * hourHeight;
            const heightPx = (dayEndHour - dayStartHour) * hourHeight;
            const col = gridColumns[targetColIndex];
            let dayClasses = globalCommonClasses;
            const dayEvents = col.querySelectorAll('[data-eventchip]:not(.gcal-multiday-clone)');
            if (dayEvents.length > 1) {
              let common = Array.from(dayEvents[0].classList);
              for (let j = 1; j < dayEvents.length; j++) {
                const curr = Array.from(dayEvents[j].classList);
                common = common.filter((c) => curr.includes(c));
              }
              dayClasses = common.join(' ');
            }
            const gridClone = document.createElement('div');
            gridClone.className = `gcal-multiday-clone ${dayClasses}`.trim();
            gridClone.style.position = 'absolute';
            gridClone.style.left = '0%';
            gridClone.style.width = '100%';
            gridClone.style.top = `${topPx}px`;
            gridClone.style.height = `${heightPx}px`;
            gridClone.style.zIndex = '3';
            gridClone.style.opacity = '1';
            gridClone.style.boxSizing = 'border-box';
            gridClone.style.padding = '0 2px';
            gridClone.style.cursor = 'pointer';
            [
              'jsaction',
              'data-eventid',
              'jscontroller',
              'data-keyboardactiontype',
              'jslog',
              'data-opens-details',
            ].forEach((attr) => {
              if (chip.hasAttribute(attr)) {
                gridClone.setAttribute(attr, chip.getAttribute(attr));
              }
            });
            const innerButton = chip.querySelector('[role="button"]');
            if (innerButton) {
              const buttonClone = innerButton.cloneNode(false);
              let titleText = 'Event';
              const titleSpan = chip.querySelector('.WBi6vc, .I0UMhf');
              if (titleSpan) {
                titleText = titleSpan.textContent;
              } else {
                const ariaLabel = chip.getAttribute('aria-label') || '';
                const parts = ariaLabel.split(',');
                titleText = parts.length > 1 ? parts[1].trim() : chip.textContent;
              }
              const formatTime = (decimal) => {
                if (decimal === 0 || decimal === 24) return '12am';
                const hrs = Math.floor(decimal);
                const mins = Math.round((decimal - hrs) * 60);
                const ampm = hrs >= 12 ? 'pm' : 'am';
                const dispHrs = hrs % 12 || 12;
                const dispMins = mins > 0 ? `:${mins.toString().padStart(2, '0')}` : '';
                return `${dispHrs}${dispMins}${ampm}`;
              };
              let timeStr = '';
              if (dayStartHour === 0 && dayEndHour === 24) {
                timeStr = 'All day';
              } else {
                timeStr = `${formatTime(dayStartHour)} - ${formatTime(dayEndHour)}`;
              }
              const BASE_PADDING = 4;
              buttonClone.style.height = '100%';
              buttonClone.style.width = '100%';
              buttonClone.style.boxSizing = 'border-box';
              buttonClone.style.display = 'flex';
              buttonClone.style.flexDirection = 'column';
              buttonClone.style.alignItems = 'flex-start';
              buttonClone.style.paddingTop = `${BASE_PADDING}px`;
              buttonClone.style.paddingLeft = '8px';
              buttonClone.style.paddingRight = '8px';
              buttonClone.style.overflow = 'hidden';
              buttonClone.style.color = '#fff';
              const titleDiv = document.createElement('div');
              titleDiv.textContent = titleText;
              titleDiv.style.fontWeight = '500';
              titleDiv.style.fontSize = '12px';
              titleDiv.style.lineHeight = '14px';
              titleDiv.style.marginBottom = '2px';
              titleDiv.style.whiteSpace = 'nowrap';
              titleDiv.style.textOverflow = 'ellipsis';
              titleDiv.style.overflow = 'hidden';
              titleDiv.style.width = '100%';
              const timeDiv = document.createElement('div');
              timeDiv.textContent = timeStr;
              timeDiv.style.fontSize = '11px';
              timeDiv.style.lineHeight = '12px';
              timeDiv.style.whiteSpace = 'nowrap';
              timeDiv.style.textOverflow = 'ellipsis';
              timeDiv.style.overflow = 'hidden';
              timeDiv.style.width = '100%';
              const contentWrapper = document.createElement('div');
              contentWrapper.style.display = 'flex';
              contentWrapper.style.flexDirection = 'column';
              contentWrapper.style.width = '100%';
              contentWrapper.appendChild(titleDiv);
              contentWrapper.appendChild(timeDiv);
              buttonClone.appendChild(contentWrapper);
              gridClone.appendChild(buttonClone);
            } else {
              gridClone.style.backgroundColor = chip.style.borderColor || '#039be5';
              gridClone.textContent = chip.textContent;
            }
            col.style.position = 'relative';
            col.appendChild(gridClone);
            if (innerButton) {
              const buttonClone = gridClone.querySelector('[role="button"]');
              const contentWrapper = buttonClone.firstElementChild;
              const dynamicTextHeight = contentWrapper.offsetHeight;
              const BASE_PADDING = 4;
              const textOffset = findBestTextOffset(col, topPx, heightPx, dynamicTextHeight);
              buttonClone.style.paddingTop = `${textOffset + BASE_PADDING}px`;
            }
          }
        }
      }
    });
  }
  var lastFingerprint;
  var init_dom = __esm({
    'google_calendar/core/dom.js'() {
      init_logging();
      init_config();
      lastFingerprint = '';
    },
  });

  // google_calendar/core/observer.js
  function setupObserver() {
    log('Setting up MutationObserver...');
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        observer.disconnect();
        processCalendar();
        observer.observe(document.body, { childList: true, subtree: true });
      }, 500);
    });
    processCalendar();
    observer.observe(document.body, { childList: true, subtree: true });
  }
  var debounceTimer;
  var init_observer = __esm({
    'google_calendar/core/observer.js'() {
      init_logging();
      init_dom();
      debounceTimer = null;
    },
  });

  // google_calendar/index.js
  var require_index = __commonJS({
    'google_calendar/index.js'() {
      init_logging();
      init_observer();
      log('Google Calendar Multi-Day Grid Userscript starting...');
      setupObserver();
    },
  });
  require_index();
})();
