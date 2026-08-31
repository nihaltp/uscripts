import { log } from './logging.js';
import { config } from './config.js';

function getHourHeight() {
  const col = document.querySelector('div[role="gridcell"][data-datekey]');
  if (col && col.clientHeight) {
     // A full day column represents exactly 24 hours.
     // This perfectly accounts for any zoom level or screen size!
     return col.clientHeight / 24;
  }
  return 60; // Safe fallback
}

function extractTimes(chip) {
  const text = chip.getAttribute('aria-label') || chip.textContent || '';
  // Match "10 AM", "10:30 AM", "14:00"
  const timeRegex = /\b((?:1[0-2]|[1-9])(?::[0-5][0-9])?\s*(?:am|pm|AM|PM)|(?:[01]?[0-9]|2[0-3]):[0-5][0-9])\b/g;
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
    
    return { hour, minute, decimal: hour + (minute / 60) };
  }

  if (matches.length >= 2) {
    return {
      start: parseTimeMatch(matches[0][0]),
      end: parseTimeMatch(matches[matches.length - 1][0])
    };
  } else if (matches.length === 1) {
    return {
      start: parseTimeMatch(matches[0][0]),
      end: { hour: 24, minute: 0, decimal: 24 }
    };
  }
  
  return {
    start: { hour: 0, minute: 0, decimal: 0 },
    end: { hour: 24, minute: 0, decimal: 24 }
  };
}

export function processCalendar() {
  log('Processing calendar for multi-day events...');
  
  const allDayChips = document.querySelectorAll('[data-eventchip]');
  if (allDayChips.length === 0) return;

  const gridColumns = document.querySelectorAll('div[role="gridcell"][data-datekey]');
  if (gridColumns.length === 0) return;
  
  // Find an existing hourly event to dynamically steal its CSS classes
  // This ensures our clones perfectly match Google Calendar's native hourly event styling
  // Pre-calculate a global baseline of common classes across the entire week 
  // to use as a fallback if a specific day has 0 or 1 events.
  let globalCommonClasses = '';
  const allHourlyEvents = document.querySelectorAll('div[role="gridcell"][data-datekey] [data-eventchip]:not(.gcal-multiday-clone)');
  if (allHourlyEvents.length > 0) {
    let common = Array.from(allHourlyEvents[0].classList);
    for (let i = 1; i < allHourlyEvents.length; i++) {
      const currentClasses = Array.from(allHourlyEvents[i].classList);
      common = common.filter(c => currentClasses.includes(c));
    }
    globalCommonClasses = common.join(' ');
  }
  
  document.querySelectorAll('.gcal-multiday-clone').forEach(el => el.remove());
  
  const hourHeight = getHourHeight();
  
  allDayChips.forEach(chip => {
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
          
          // If event ends exactly at midnight on the last day, skip drawing that tiny sliver
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
              common = common.filter(c => curr.includes(c));
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

          // Copy Google Calendar's event delegation attributes so clicking works natively!
          ['jsaction', 'data-eventid', 'jscontroller', 'data-keyboardactiontype', 'jslog', 'data-opens-details'].forEach(attr => {
            if (chip.hasAttribute(attr)) {
              gridClone.setAttribute(attr, chip.getAttribute(attr));
            }
          });
          
          const innerButton = chip.querySelector('[role="button"]');
          if (innerButton) {
             const buttonClone = innerButton.cloneNode(true);
             buttonClone.style.height = '100%';
             buttonClone.style.width = '100%';
             buttonClone.style.boxSizing = 'border-box';
             buttonClone.style.display = 'block';
             gridClone.appendChild(buttonClone);
          } else {
             gridClone.style.backgroundColor = chip.style.borderColor || '#039be5';
             gridClone.textContent = chip.textContent;
          }
          
          
          col.style.position = 'relative';
          col.appendChild(gridClone);
        }
      }
    }
  });
}
