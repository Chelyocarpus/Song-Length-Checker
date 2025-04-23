// Results Manager for Song Length Checker
// Handles displaying, updating, and filtering comparison results

class ResultsManager {
    constructor() {
        // Track current results
        this.results = [];
        this.issueCount = 0;
    }
    
    // Function to check if a title has a trailing number (e.g., "Song 2", "Track 3")
    hasTrailingNumber(title) {
        return /\s+\d+\s*$/.test(title);
    }
    
    // Function to strip trailing numbers from a title
    stripTrailingNumber(title) {
        return title.replace(/\s+\d+\s*$/, '').trim();
    }
    
    // Display comparison results
    displayResults(results, issueCount, uiManager) {
        this.results = results;
        this.issueCount = issueCount;
        
        const { resultsBody, resultsTable, resultsSummary, showAllIssuesCheckbox, 
                showWarningsCheckbox, showErrorsCheckbox, showNotFoundCheckbox } = uiManager;
        
        resultsBody.innerHTML = '';
        
        // Add each result to the table
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
                } else if (status === errorStatus) {
                    row.dataset.issueType = 'error';
                } else if (status === notFound) {
                    row.dataset.issueType = 'not-found';
                } else if (status === 'ERROR') {
                    row.dataset.issueType = 'error';
                }
            }
            
            // Use the complete filename instead of just the title
            const titleDisplay = fileName;
            
            // Add issue badge to status column for visual emphasis
            let statusDisplay = status;
            if (hasIssue) {
                statusDisplay = `${status} <span class="issue-badge">!</span>`;
            }
            
            // Song (without Artist column)
            row.innerHTML = `
                <td>${titleDisplay}</td>
                <td>${localDurationFormatted}</td>
                <td>${spotifyDurationFormatted}</td>
                <td>${differenceFormatted}</td>
                <td class="status-${status.toLowerCase()}">${statusDisplay}</td>
            `;
            
            // Add the row to the table
            resultsBody.appendChild(row);
            
            // Add not found reason row if applicable
            if (status === config.statusMessages.notFound && notFoundReason) {
                const reasonRow = document.createElement('tr');
                reasonRow.className = 'not-found-reason-row';
                reasonRow.dataset.resultType = 'reason-row';
                reasonRow.dataset.issueType = 'not-found';
                
                // Link this row to its parent
                reasonRow.dataset.parentIndex = index;
                
                const reasonCell = document.createElement('td');
                reasonCell.colSpan = 5; // Reduced by 1 because we removed the artist column
                reasonCell.className = 'not-found-reason';
                reasonCell.innerHTML = `
                    <div class="reason-content">
                        <span class="reason-label">Reason:</span> ${notFoundReason}
                    </div>
                `;
                
                reasonRow.appendChild(reasonCell);
                resultsBody.appendChild(reasonRow);
            }
            
            // Add error reason row if applicable
            if ((status === config.statusMessages.error || status === 'ERROR') && 
                (error || errorDetails)) {
                const errorRow = document.createElement('tr');
                errorRow.className = 'error-reason-row';
                errorRow.dataset.resultType = 'reason-row';
                errorRow.dataset.issueType = 'error';
                
                // Link this row to its parent
                errorRow.dataset.parentIndex = index;
                
                const errorCell = document.createElement('td');
                errorCell.colSpan = 5;
                errorCell.className = 'error-reason';
                
                // Combine the technical error with the user-friendly explanation
                const errorContent = errorDetails 
                    ? `${errorDetails} ${error ? `<span class="technical-error">(${error})</span>` : ''}`
                    : (error || 'Unknown error');
                
                errorCell.innerHTML = `
                    <div class="reason-content">
                        <span class="reason-label">Error:</span> ${errorContent}
                    </div>
                `;
                
                errorRow.appendChild(errorCell);
                resultsBody.appendChild(errorRow);
            }
        });
        
        // Show table and update summary
        resultsTable.classList.remove('hidden');
        
        // Update summary text with more prominence for issues
        if (issueCount === 0) {
            resultsSummary.textContent = `✅ All ${results.length} tracks match their Spotify versions within tolerance.`;
            resultsSummary.className = 'no-issues';
        } else {
            resultsSummary.innerHTML = `⚠️ <strong>Found ${issueCount} issues</strong> out of ${results.length} tracks.`;
            resultsSummary.className = 'has-issues';
        }
        
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
    
    // Filter issues in the results table
    filterIssues(uiManager) {
        // Only proceed if the filter elements exist
        if (!uiManager.showAllIssuesCheckbox || !uiManager.showWarningsCheckbox || 
            !uiManager.showErrorsCheckbox || !uiManager.showNotFoundCheckbox) {
            console.warn('Filter elements not found in the DOM');
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
        
        // Determine if any filter is active
        const anyFilterActive = showWarnings || showErrors || showNotFound;
        
        // Create a map to track visible parent rows
        const visibleParentRows = new Set();
        const rows = uiManager.resultsBody.querySelectorAll('tr');
        
        // Apply filters to rows
        rows.forEach(row => {
            // Skip reason rows in the first pass (both not-found and error reason rows)
            if (row.dataset.resultType === 'reason-row') {
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
            
            // Track visible parent rows for associated reason rows
            if (showThisRow && row.dataset.index) {
                visibleParentRows.add(row.dataset.index);
            }
        });
        
        // Second pass: handle all types of reason rows based on parent visibility
        rows.forEach(row => {
            if (row.dataset.resultType === 'reason-row') {
                const parentIndex = row.dataset.parentIndex;
                if (visibleParentRows.has(parentIndex)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            }
        });
        
        // Restore the scroll position after the DOM has been updated
        // Use setTimeout to ensure this happens after the DOM update
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