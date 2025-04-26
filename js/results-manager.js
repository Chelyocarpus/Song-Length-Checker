// Results Manager for Song Length Checker
// Handles displaying, updating, and filtering comparison results

class ResultsManager {
    constructor() {
        // Track current results
        this.results = [];
        this.issueCount = 0;
        
        // Debounced filter function to avoid excessive re-rendering
        this.debouncedFilter = this.debounce((uiManager) => {
            this.filterIssues(uiManager);
        }, 250);
    }
    
    // Function to check if a title has a trailing number (e.g., "Song 2", "Track 3")
    hasTrailingNumber(title) {
        return /\s+\d+\s*$/.test(title);
    }
    
    // Function to strip trailing numbers from a title
    stripTrailingNumber(title) {
        return title.replace(/\s+\d+\s*$/, '').trim();
    }
    
    // Debounce helper function for performance optimization
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
    
    // Display comparison results
    displayResults(results, issueCount, uiManager) {
        this.results = results;
        this.issueCount = issueCount;
        
        const { resultsBody, resultsTable, resultsSummary, showAllIssuesCheckbox, 
                showWarningsCheckbox, showErrorsCheckbox, showNotFoundCheckbox } = uiManager;
        
        resultsBody.innerHTML = '';
        
        // Group results by status for better organization
        const groupedResults = this.groupResultsByStatus(results);
        
        // Add each result to the table with improved formatting
        results.forEach((result, index) => {
            const { hasIssue, status, fileName, localDurationFormatted, 
                    spotifyDurationFormatted, differenceFormatted, 
                    notFoundReason, error, errorDetails } = result;
            
            // Create the main result row
            const row = document.createElement('tr');
            row.dataset.index = index;
            row.dataset.resultType = 'main-row';
            
            if (hasIssue) {
                row.className = 'issue-row';
                row.id = `issue-${index}`;
                
                // Add issue type as a data attribute for better filtering
                const { warning, error: errorStatus, notFound } = config.statusMessages;
                
                if (status === warning) {
                    row.dataset.issueType = 'warning';
                } else if (status === errorStatus || status === 'ERROR') {
                    row.dataset.issueType = 'error';
                } else if (status === notFound) {
                    row.dataset.issueType = 'not-found';
                }
                
                // Add accessible attributes
                row.setAttribute('aria-expanded', 'false');
                row.setAttribute('aria-controls', `details-${index}`);
                row.tabIndex = 0;
            }
            
            // Use the complete filename instead of just the title
            const titleDisplay = fileName;
            
            // Improve status display with icon and better visual cues
            let statusDisplay = this.formatStatus(status);
            
            // Song (without Artist column)
            row.innerHTML = `
                <td class="song-name-cell">${titleDisplay}</td>
                <td class="duration-cell">${localDurationFormatted}</td>
                <td class="duration-cell">${spotifyDurationFormatted}</td>
                <td class="difference-cell">${differenceFormatted}</td>
                <td class="status-cell status-${status.toLowerCase()}">${statusDisplay}</td>
            `;
            
            // Add the row to the table
            resultsBody.appendChild(row);
            
            // Add expandable detail row for issues
            if (hasIssue) {
                const detailRow = this.createDetailRow(result, index);
                resultsBody.appendChild(detailRow);
                
                // Add click event to toggle details
                row.addEventListener('click', () => this.toggleDetails(row, detailRow));
                
                // Support keyboard navigation
                row.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.toggleDetails(row, detailRow);
                    }
                });
            }
        });
        
        // Show table and update summary
        resultsTable.classList.remove('hidden');
        
        // Update summary text with more prominence for issues and better statistics
        this.updateSummary(resultsSummary, results, issueCount);
        
        // Reset all filter checkboxes if they exist
        if (showAllIssuesCheckbox) {
            showAllIssuesCheckbox.checked = false;
        }
        if (showWarningsCheckbox) {
            showWarningsCheckbox.checked = false;
        }
        if (showErrorsCheckbox) {
            showErrorsCheckbox.checked = false;
        }
        if (showNotFoundCheckbox) {
            showNotFoundCheckbox.checked = false;
        }
        
        // Remove active class from all filter options
        document.querySelectorAll('.filter-option').forEach(option => {
            option.classList.remove('active');
        });
    }
    
    // Create expandable detail row for issues
    createDetailRow(result, index) {
        const { status, notFoundReason, error, errorDetails, 
                spotifyData, localDurationFormatted, spotifyDurationFormatted } = result;
        
        const detailRow = document.createElement('tr');
        detailRow.className = 'detail-row';
        detailRow.id = `details-${index}`;
        detailRow.dataset.resultType = 'detail-row';
        detailRow.dataset.parentIndex = index;
        detailRow.dataset.issueType = result.hasIssue ? 
            this.getIssueTypeFromStatus(status) : '';
            
        // Hide by default
        detailRow.style.display = 'none';
        
        const detailCell = document.createElement('td');
        detailCell.colSpan = 5;
        detailCell.className = 'detail-cell';
        
        // Create appropriate content based on issue type
        let detailContent = '';
        const notFoundClass = status === config.statusMessages.notFound ? 'detail-not-found' : '';
        const errorClass = (status === config.statusMessages.error || status === 'ERROR') ? 'detail-error' : '';
        const warningClass = status === config.statusMessages.warning ? 'detail-warning' : '';
        
        if (status === config.statusMessages.notFound && notFoundReason) {
            // Not found details
            detailContent = `
                <div class="detail-content ${notFoundClass}">
                    <div class="detail-header">
                        <span class="detail-icon">🔍</span>
                        <h4>Track Not Found</h4>
                    </div>
                    <div class="detail-body">
                        <p>${notFoundReason}</p>
                        <div class="detail-tips">
                            <h5>Suggestions:</h5>
                            <ul>
                                <li>Check the file naming format (Artist - Title)</li>
                                <li>Verify the song exists on Spotify</li>
                                <li>Try authenticating if using cached data</li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        } else if ((status === config.statusMessages.error || status === 'ERROR') && 
                  (error || errorDetails)) {
            // Error details with recording-specific tips
            const errorContent = errorDetails 
                ? `${errorDetails} ${error ? `<span class="technical-error">(${error})</span>` : ''}`
                : (error || 'Unknown error');
            
            // Calculate the difference in seconds for more context
            const diffSeconds = result.difference ? Math.round(result.difference / 1000) : 0;
            const diffDirection = result.localDuration > result.spotifyDuration ? 'longer' : 'shorter';
            
            detailContent = `
                <div class="detail-content ${errorClass}">
                    <div class="detail-header">
                        <span class="detail-icon">⚠️</span>
                        <h4>Duration Mismatch</h4>
                    </div>
                    <div class="detail-body">
                        <p>${errorContent}</p>
                        <div class="detail-comparison">
                            <div class="comparison-item">
                                <div class="comparison-label">Local File:</div>
                                <div class="comparison-value">${localDurationFormatted}</div>
                            </div>
                            <div class="comparison-item">
                                <div class="comparison-label">Spotify Track:</div>
                                <div class="comparison-value">${spotifyDurationFormatted}</div>
                            </div>
                            <div class="comparison-item">
                                <div class="comparison-label">Difference:</div>
                                <div class="comparison-value">${diffSeconds} seconds ${diffDirection}</div>
                            </div>
                        </div>
                        <div class="detail-tips">
                            <h5>Possible causes for recorded files:</h5>
                            <ul>
                                <li>Live recording vs studio version</li>
                                <li>Extended intro/outro in recording</li>
                                <li>DJ mix or transition effects</li>
                                <li>Recording includes intro/outro talking or applause</li>
                                <li>Silence at beginning or end of recording</li>
                                <li>Different version of song (radio edit vs. album version)</li>
                                <li>Audio/Time skipping or glitches</li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        } else if (status === config.statusMessages.warning) {
            // Warning details with recording-specific tips
            detailContent = `
                <div class="detail-content ${warningClass}">
                    <div class="detail-header">
                        <span class="detail-icon">⚠️</span>
                        <h4>Minor Duration Difference</h4>
                    </div>
                    <div class="detail-body">
                        <p>The local file duration differs slightly from the Spotify version.</p>
                        <div class="detail-comparison">
                            <div class="comparison-item">
                                <div class="comparison-label">Local File:</div>
                                <div class="comparison-value">${localDurationFormatted}</div>
                            </div>
                            <div class="comparison-item">
                                <div class="comparison-label">Spotify Track:</div>
                                <div class="comparison-value">${spotifyDurationFormatted}</div>
                            </div>
                        </div>
                        <p>This small difference is usually not significant and might be due to:</p>
                        <ul>
                            <li>Encoding differences in recording</li>
                            <li>Minor silence at start/end of recording</li>
                            <li>Metadata precision differences</li>
                            <li>Sample rate variations</li>
                        </ul>
                    </div>
                </div>
            `;
        }
        
        detailCell.innerHTML = detailContent;
        detailRow.appendChild(detailCell);
        
        return detailRow;
    }
    
    // Toggle details visibility
    toggleDetails(row, detailRow) {
        const isExpanded = row.getAttribute('aria-expanded') === 'true';
        
        if (isExpanded) {
            detailRow.style.display = 'none';
            row.setAttribute('aria-expanded', 'false');
            row.classList.remove('expanded');
        } else {
            detailRow.style.display = 'table-row';
            row.setAttribute('aria-expanded', 'true');
            row.classList.add('expanded');
        }
    }
    
    // Format status with appropriate icon and text
    formatStatus(status) {
        const statusMap = {
            [config.statusMessages.ok]: '✅ OK',
            [config.statusMessages.warning]: '⚠️ WARNING',
            [config.statusMessages.error]: '❌ ERROR',
            [config.statusMessages.notFound]: '🔍 NOT FOUND',
            'ERROR': '❌ ERROR'
        };
        
        return statusMap[status] || status;
    }
    
    // Get issue type from status
    getIssueTypeFromStatus(status) {
        if (status === config.statusMessages.warning) {
            return 'warning';
        } else if (status === config.statusMessages.error || status === 'ERROR') {
            return 'error';
        } else if (status === config.statusMessages.notFound) {
            return 'not-found';
        }
        return '';
    }
    
    // Group results by status for summary display
    groupResultsByStatus(results) {
        const grouped = {
            ok: 0,
            warning: 0,
            error: 0,
            notFound: 0
        };
        
        results.forEach(result => {
            const { status } = result;
            
            if (status === config.statusMessages.ok) {
                grouped.ok++;
            } else if (status === config.statusMessages.warning) {
                grouped.warning++;
            } else if (status === config.statusMessages.error || status === 'ERROR') {
                grouped.error++;
            } else if (status === config.statusMessages.notFound) {
                grouped.notFound++;
            }
        });
        
        return grouped;
    }
    
    // Update summary with detailed statistics
    updateSummary(resultsSummary, results, issueCount) {
        const grouped = this.groupResultsByStatus(results);
        
        if (issueCount === 0) {
            resultsSummary.innerHTML = `
                <span class="summary-icon">✅</span> 
                All ${results.length} tracks match their Spotify versions within tolerance.
            `;
            resultsSummary.className = 'no-issues';
        } else {
            let summaryHTML = `
                <span class="summary-icon">⚠️</span>
                <strong>Found ${issueCount} issues</strong> out of ${results.length} tracks:
                <div class="summary-details">
            `;
            
            if (grouped.warning > 0) {
                summaryHTML += `<span class="summary-warning">⚠️ ${grouped.warning} warnings</span>`;
            }
            
            if (grouped.error > 0) {
                summaryHTML += `<span class="summary-error">❌ ${grouped.error} errors</span>`;
            }
            
            if (grouped.notFound > 0) {
                summaryHTML += `<span class="summary-not-found">🔍 ${grouped.notFound} not found</span>`;
            }
            
            summaryHTML += `</div>`;
            resultsSummary.innerHTML = summaryHTML;
            resultsSummary.className = 'has-issues';
        }
    }
    
    // Filter issues in the results table
    filterIssues(uiManager) {
        // Only proceed if the filter elements exist
        if (!uiManager.showAllIssuesCheckbox || !uiManager.showWarningsCheckbox || 
            !uiManager.showErrorsCheckbox || !uiManager.showNotFoundCheckbox) {
            logger.warn('Filter elements not found in the DOM');
            return;
        }
        
        // Save the current scroll position before applying filters
        const scrollY = window.scrollY;
        
        // Get checkbox states directly from the DOM elements
        const showAllIssues = uiManager.showAllIssuesCheckbox.checked;
        const showWarnings = uiManager.showWarningsCheckbox.checked;
        const showErrors = uiManager.showErrorsCheckbox.checked;
        const showNotFound = uiManager.showNotFoundCheckbox.checked;
        
        // Update visual state of filter options
        const allIssuesOption = document.querySelector('label[for="show-all-issues"]')?.parentElement;
        const warningsOption = document.querySelector('label[for="show-warnings"]')?.parentElement;
        const errorsOption = document.querySelector('label[for="show-errors"]')?.parentElement;
        const notFoundOption = document.querySelector('label[for="show-not-found"]')?.parentElement;
        
        if (allIssuesOption) {
            allIssuesOption.classList.toggle('active', showAllIssues);
        }
        if (warningsOption) {
            warningsOption.classList.toggle('active', showWarnings);
        }
        if (errorsOption) {
            errorsOption.classList.toggle('active', showErrors);
        }
        if (notFoundOption) {
            notFoundOption.classList.toggle('active', showNotFound);
        }
        
        // Check which checkbox triggered the event
        const activeElement = document.activeElement;
        
        if (activeElement === uiManager.showAllIssuesCheckbox) {
            // If "All Issues" was clicked, set all other checkboxes to match
            uiManager.showWarningsCheckbox.checked = showAllIssues;
            uiManager.showErrorsCheckbox.checked = showAllIssues;
            uiManager.showNotFoundCheckbox.checked = showAllIssues;
            
            // Update the active states
            if (warningsOption) {
                warningsOption.classList.toggle('active', showAllIssues);
            }
            if (errorsOption) {
                errorsOption.classList.toggle('active', showAllIssues);
            }
            if (notFoundOption) {
                notFoundOption.classList.toggle('active', showAllIssues);
            }
        } else {
            // If individual filter was clicked, update "All Issues" based on the state of all specific filters
            const allSpecificFiltersChecked = showWarnings && showErrors && showNotFound;
            const noSpecificFiltersChecked = !showWarnings && !showErrors && !showNotFound;
            
            // Only update "All Issues" if all specific filters are either all checked or all unchecked
            if (allSpecificFiltersChecked && !showAllIssues) {
                uiManager.showAllIssuesCheckbox.checked = true;
                if (allIssuesOption) {
                    allIssuesOption.classList.add('active');
                }
            } else if (noSpecificFiltersChecked && showAllIssues) {
                uiManager.showAllIssuesCheckbox.checked = false;
                if (allIssuesOption) {
                    allIssuesOption.classList.remove('active');
                }
            }
        }
        
        // Apply filters with improved handling for detail rows
        this.applyRowFilters(uiManager, scrollY);
    }
    
    // Apply filter to table rows
    applyRowFilters(uiManager, scrollY) {
        // Determine if any filter is active
        const showWarnings = uiManager.showWarningsCheckbox.checked;
        const showErrors = uiManager.showErrorsCheckbox.checked;
        const showNotFound = uiManager.showNotFoundCheckbox.checked;
        const anyFilterActive = showWarnings || showErrors || showNotFound;
        
        // Create a map to track visible parent rows
        const visibleParentRows = new Set();
        const rows = uiManager.resultsBody.querySelectorAll('tr');
        
        // Apply filters to rows
        rows.forEach(row => {
            // Skip detail rows in the first pass
            if (row.dataset.resultType === 'detail-row') {
                return;
            }
            
            // When no filters are active, show all rows
            if (!anyFilterActive) {
                row.style.display = '';
                if (row.dataset.index) {
                    visibleParentRows.add(row.dataset.index);
                }
                return;
            }
            
            // If this is not an issue row, hide it when filters are active
            if (!row.classList.contains('issue-row')) {
                row.style.display = 'none';
                return;
            }
            
            // Get the issue type from the row's data attribute
            const issueType = row.dataset.issueType;
            
            // Determine if this row should be shown based on active filters
            const showThisRow = (issueType === 'warning' && showWarnings) || 
                             (issueType === 'error' && showErrors) || 
                             (issueType === 'not-found' && showNotFound);
            
            // Show or hide the row
            row.style.display = showThisRow ? '' : 'none';
            
            // Track visible parent rows for associated detail rows
            if (showThisRow && row.dataset.index) {
                visibleParentRows.add(row.dataset.index);
            }
        });
        
        // Second pass: handle detail rows based on parent visibility
        rows.forEach(row => {
            if (row.dataset.resultType === 'detail-row') {
                const parentIndex = row.dataset.parentIndex;
                const parentRow = document.querySelector(`tr[data-index="${parentIndex}"]`);
                
                // Only display if parent is visible AND expanded
                const parentExpanded = parentRow && parentRow.getAttribute('aria-expanded') === 'true';
                
                if (visibleParentRows.has(parentIndex) && parentExpanded) {
                    row.style.display = 'table-row';
                } else {
                    row.style.display = 'none';
                }
            }
        });
        
        // Restore the scroll position after the DOM has been updated
        setTimeout(() => {
            window.scrollTo({
                top: scrollY,
                behavior: 'auto' // Use 'auto' instead of 'smooth' to prevent visible jump
            });
        }, 0);
    }
}

// Create a singleton instance
const resultsManager = new ResultsManager();