// ==UserScript==
// @name         Assignment Table Sorter
// @description  Add sortable columns to the assignment table and remember sorting
// @author       nihaltp
// @namespace    https://github.com/nihaltp/uscripts
// @supportURL   https://github.com/nihaltp/uscripts/issues/new?template=bug.yml
// @homepageURL  https://github.com/nihaltp/uscripts
// @homepage     https://github.com/nihaltp/uscripts
// @license      MIT
// @match        https://*.etlab.in/student/assignments
// @icon         https://rit.etlab.in/favicon.ico
// @version      1.0.0
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/nihaltp/uscripts/main/etlab/assignment_table.user.js
// @updateURL    https://raw.githubusercontent.com/nihaltp/uscripts/main/etlab/assignment_table.user.js
// ==/UserScript==

(function () {
    'use strict';

    const tables = document.querySelectorAll('table.items.table');

    if (!tables.length) return;

    tables.forEach((table, tableIndex) => {
        setupTable(table, tableIndex);
    });

    function setupTable(table, tableIndex) {
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');

        if (!thead || !tbody) return;

        const headers = [...thead.querySelectorAll('th')];

        /*
         * Storage key for this table.
         *
         * Example:
         * assignmentTableSort_0
         */
        const storageKey = `assignmentTableSort_${tableIndex}`;

        let currentColumn = -1;
        let ascending = true;

        /*
         * Create sort indicators
         */
        headers.forEach((header, columnIndex) => {
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';

            const indicator = document.createElement('span');

            indicator.className = 'sort-indicator';
            indicator.style.marginLeft = '6px';
            indicator.style.opacity = '0.6';

            header.appendChild(indicator);

            header.addEventListener('click', () => {
                if (currentColumn === columnIndex) {
                    // Same column → reverse order
                    ascending = !ascending;
                } else {
                    // New column → ascending by default
                    currentColumn = columnIndex;
                    ascending = true;
                }

                sortTable(columnIndex, ascending);
                updateIndicators(columnIndex, ascending);
                saveSortState();
            });
        });

        /*
         * Restore previous sorting
         */
        restoreSortState();

        function getCellValue(row, columnIndex) {
            const cell = row.children[columnIndex];

            if (!cell) return '';

            return cell.textContent
                .replace(/\s+/g, ' ')
                .trim();
        }

        function parseDate(value) {
            /*
             * Example:
             * 1st Sep '26 12:07 PM
             *
             * Convert:
             * 1st → 1
             * 2nd → 2
             * 3rd → 3
             * 4th → 4
             */
            value = value
                .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
                .replace(/'/g, '20');

            const date = new Date(value);

            return Number.isNaN(date.getTime())
                ? null
                : date.getTime();
        }

        function sortTable(columnIndex, ascending) {
            const rows = [...tbody.querySelectorAll('tr')];

            // Issued On and Last Date
            const isDateColumn =
                columnIndex === 5 ||
                columnIndex === 6;

            rows.sort((a, b) => {
                const valueA = getCellValue(a, columnIndex);
                const valueB = getCellValue(b, columnIndex);

                let comparison;

                if (isDateColumn) {
                    const dateA = parseDate(valueA);
                    const dateB = parseDate(valueB);

                    if (dateA !== null && dateB !== null) {
                        comparison = dateA - dateB;
                    } else {
                        comparison = valueA.localeCompare(
                            valueB,
                            undefined,
                            { sensitivity: 'base' }
                        );
                    }
                } else {
                    comparison = valueA.localeCompare(
                        valueB,
                        undefined,
                        {
                            numeric: true,
                            sensitivity: 'base'
                        }
                    );
                }

                return ascending
                    ? comparison
                    : -comparison;
            });

            rows.forEach(row => tbody.appendChild(row));
        }

        function updateIndicators(columnIndex, ascending) {
            headers.forEach((header, index) => {
                const indicator =
                    header.querySelector('.sort-indicator');

                if (index === columnIndex) {
                    indicator.textContent =
                        ascending ? '▲' : '▼';
                } else {
                    indicator.textContent = '';
                }
            });
        }

        function saveSortState() {
            if (currentColumn === -1) return;

            const state = {
                column: currentColumn,
                ascending: ascending
            };

            localStorage.setItem(
                storageKey,
                JSON.stringify(state)
            );
        }

        function restoreSortState() {
            const saved =
                localStorage.getItem(storageKey);

            if (!saved) return;

            try {
                const state = JSON.parse(saved);

                if (
                    typeof state.column !== 'number' ||
                    typeof state.ascending !== 'boolean'
                ) {
                    return;
                }

                if (
                    state.column < 0 ||
                    state.column >= headers.length
                ) {
                    return;
                }

                currentColumn = state.column;
                ascending = state.ascending;

                sortTable(
                    currentColumn,
                    ascending
                );

                updateIndicators(
                    currentColumn,
                    ascending
                );

            } catch (error) {
                console.warn(
                    'Could not restore table sort state:',
                    error
                );
            }
        }
    }
})();
