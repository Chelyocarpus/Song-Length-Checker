// UI Manager for Song Length Checker
// Handles UI initialization, state management and updates

class UIManager {
    constructor() {
        // DOM elements - main
        this.clientIdInput = document.getElementById('client-id');
        this.clientSecretInput = document.getElementById('client-secret');
        this.rememberSecretCheckbox = document.getElementById('remember-secret');
        this.authButton = document.getElementById('auth-button');
        this.authStatus = document.getElementById('auth-status');
        
        // DOM elements - file inputs
        this.folderOption = document.getElementById('folder-option');
        this.filesOption = document.getElementById('files-option');
        this.folderInputContainer = document.getElementById('folder-input-container');
        this.filesInputContainer = document.getElementById('files-input-container');
        this.folderSelector = document.getElementById('folder-selector');
        this.filesSelector = document.getElementById('files-selector');
        this.modernFilePickerBtn = document.getElementById('modern-file-picker');
        this.modernFolderPickerBtn = document.getElementById('modern-folder-picker');
        this.dragDropArea = document.getElementById('drag-drop-area');
        
        // DOM elements - results
        this.fileList = document.getElementById('file-list');
        this.compareButton = document.getElementById('compare-button');
        this.loadingIndicator = document.getElementById('loading');
        this.resultsTable = document.getElementById('results-table');
        this.resultsBody = document.getElementById('results-body');
        this.resultsSummary = document.getElementById('results-summary');
        
        // DOM elements - cache
        this.cacheStatus = document.getElementById('cache-status');
        this.clearCacheButton = document.getElementById('clear-cache-button');
        this.cacheEnabledToggle = document.getElementById('cache-enabled-toggle');
        
        // DOM elements - filters
        this.showAllIssuesCheckbox = document.getElementById('show-all-issues');
        this.showWarningsCheckbox = document.getElementById('show-warnings');
        this.showErrorsCheckbox = document.getElementById('show-errors');
        this.showNotFoundCheckbox = document.getElementById('show-not-found');
        
        // Attach filter styling if elements exist
        this.addFilterOptionStyles();

        // Progress tracking elements
        this.progressBar = document.getElementById('progress-bar');
        this.progressFill = this.progressBar?.querySelector('.progress-fill');
        this.progressCount = document.getElementById('progress-count');
        
        // Processing state
        this.totalFiles = 0;
        this.processedFiles = 0;
    }
    
    // Initialize UI elements
    initUI() {
        // Reset file inputs
        if (this.folderSelector) this.folderSelector.value = '';
        if (this.filesSelector) this.filesSelector.value = '';
        
        // Reset file list display
        this.fileList.innerHTML = '';
        
        // Reset drag-drop area if it exists
        if (this.dragDropArea) {
            this.dragDropArea.classList.remove('has-files', 'active', 'processing');
            this.dragDropArea.classList.add('empty');
            
            // Set the correct text based on selected upload type
            if (this.folderOption && this.folderOption.checked) {
                this.dragDropArea.setAttribute('data-text', 'Drag & drop a folder here or click to browse');
            } else {
                this.dragDropArea.setAttribute('data-text', 'Drag & drop audio files here or click to browse');
            }
        }
        
        // Set initial upload containers visibility
        if (this.folderOption && this.folderOption.checked) {
            this.folderInputContainer.classList.remove('hidden');
            this.filesInputContainer.classList.add('hidden');
        } else if (this.filesOption && this.filesOption.checked) {
            this.folderInputContainer.classList.add('hidden');
            this.filesInputContainer.classList.remove('hidden');
        }
    }
    
    // Helper function to safely add styles to filter options
    addFilterOptionStyles() {
        const allIssuesLabel = document.querySelector('label[for="show-all-issues"]');
        const warningsLabel = document.querySelector('label[for="show-warnings"]');
        const errorsLabel = document.querySelector('label[for="show-errors"]');
        const notFoundLabel = document.querySelector('label[for="show-not-found"]');
        
        if (allIssuesLabel) allIssuesLabel.parentElement.classList.add('all-issues');
        if (warningsLabel) warningsLabel.parentElement.classList.add('warnings');
        if (errorsLabel) errorsLabel.parentElement.classList.add('errors');
        if (notFoundLabel) notFoundLabel.parentElement.classList.add('not-found');
    }
    
    // Toggle between folder upload and individual files upload
    toggleUploadType(event, fileUploader) {
        if (event.target.value === 'folder') {
            this.folderInputContainer.classList.remove('hidden');
            this.filesInputContainer.classList.add('hidden');
            
            // Update the drag-drop area text if it exists
            if (this.dragDropArea) {
                this.dragDropArea.setAttribute('data-text', 'Drag & drop a folder here or click to browse');
            }
            
            // Reset file selectors when switching
            if (this.filesSelector.value) this.filesSelector.value = '';
            this.fileList.innerHTML = '';
            fileUploader.setLocalFiles([]);
            
            // Reset drag-drop UI state
            if (this.dragDropArea) {
                this.dragDropArea.classList.remove('has-files');
                this.dragDropArea.classList.add('empty');
            }
        } else {
            this.folderInputContainer.classList.add('hidden');
            this.filesInputContainer.classList.remove('hidden');
            
            // Update the drag-drop area text if it exists
            if (this.dragDropArea) {
                this.dragDropArea.setAttribute('data-text', 'Drag & drop audio files here or click to browse');
            }
            
            // Reset file selectors when switching
            if (this.folderSelector.value) this.folderSelector.value = '';
            this.fileList.innerHTML = '';
            fileUploader.setLocalFiles([]);
            
            // Reset drag-drop UI state
            if (this.dragDropArea) {
                this.dragDropArea.classList.remove('has-files');
                this.dragDropArea.classList.add('empty');
            }
        }
    }
    
    // Update file list UI with selected files
    updateFileListUI(files, fileUploader) {
        this.fileList.innerHTML = '';
        
        if (files.length === 0) {
            this.fileList.innerHTML = '<p>No supported audio files found.</p>';
            if (this.dragDropArea) {
                this.dragDropArea.classList.remove('active', 'processing');
                this.dragDropArea.classList.add('empty');
                
                // Ensure the correct text is set
                if (this.folderOption && this.folderOption.checked) {
                    this.dragDropArea.setAttribute('data-text', 'Drag & drop a folder here or click to browse');
                } else {
                    this.dragDropArea.setAttribute('data-text', 'Drag & drop audio files here or click to browse');
                }
            }
            this.compareButton.disabled = true;
            return;
        }
        
        // Create a document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.textContent = file.name;
            fragment.appendChild(fileItem);
        });
        
        this.fileList.appendChild(fragment);
        
        if (this.dragDropArea) {
            this.dragDropArea.classList.remove('active', 'processing', 'empty');
            this.dragDropArea.classList.add('has-files');
        }
    }
    
    // Update compare button state based on authentication status and files
    updateCompareButtonState(localFiles, isAuthenticated, hasCachedData) {
        // Enable compare button if we have files and either:
        // 1. We're authenticated with Spotify, or
        // 2. We have cached data available
        let usingCacheOnly = false;
        
        if (localFiles.length > 0 && (isAuthenticated || hasCachedData)) {
            this.compareButton.disabled = false;
            
            // Show indicator if we're going to use cached data
            if (!isAuthenticated && hasCachedData) {
                this.compareButton.textContent = "Compare with Cached Data";
                this.compareButton.classList.add("cache-mode");
                usingCacheOnly = true;
            } else {
                this.compareButton.textContent = "Compare with Spotify";
                this.compareButton.classList.remove("cache-mode");
                usingCacheOnly = false;
            }
        } else {
            this.compareButton.disabled = true;
            this.compareButton.textContent = "Compare with Spotify";
            this.compareButton.classList.remove("cache-mode");
        }
        
        return usingCacheOnly;
    }
    
    // Show loading state
    showLoading() {
        this.compareButton.disabled = true;
        this.loadingIndicator.classList.remove('hidden');
        this.resultsTable.classList.add('hidden');
        this.resultsSummary.textContent = '';
        this.resultsSummary.className = '';
        
        // Reset progress tracking
        this.totalFiles = 0;
        this.processedFiles = 0;
        this.updateProgress(0, 0);
    }
    
    // Initialize progress tracking with total files
    initializeProgress(totalFiles) {
        this.totalFiles = totalFiles;
        this.processedFiles = 0;
        this.updateProgress(0, totalFiles);
    }
    
    // Update progress display
    updateProgress(processed, total = null) {
        if (total !== null) {
            this.totalFiles = total;
        }
        this.processedFiles = processed;
        
        const percentage = Math.round((this.processedFiles / this.totalFiles) * 100) || 0;
        
        // Update progress bar
        if (this.progressFill) {
            this.progressFill.style.width = `${percentage}%`;
        }
        if (this.progressBar) {
            this.progressBar.setAttribute('aria-valuenow', percentage);
        }
        
        // Update count display
        if (this.progressCount) {
            this.progressCount.textContent = `(${this.processedFiles}/${this.totalFiles} files)`;
            // Update aria-label for better screen reader experience
            this.loadingIndicator.setAttribute('aria-label', 
                `Processing files: ${this.processedFiles} of ${this.totalFiles} complete, ${percentage}% done`
            );
        }
    }

    // Hide loading state
    hideLoading() {
        this.loadingIndicator.classList.add('hidden');
        this.compareButton.disabled = false;
    }

    // Add or modify these functions to fix authentication state handling

    updateUIState() {
        // Get file state before updating UI
        const hasFiles = this.hasFiles();
        const isAuthenticated = spotifyApi.isAuthenticated();
        
        // Log debug information
        logger.debug('Current state before UI update:', { 
            hasFiles, 
            isAuthenticated, 
            fileList: document.getElementById('file-list')?.children?.length || 0
        });
        
        // Update authentication status display
        this.updateAuthStatus();
        
        // Update compare button state with explicit values
        this.updateCompareButtonState(hasFiles, isAuthenticated);
        
        // Log current state for debugging
        logger.debug('UI State updated:', {
            authenticated: isAuthenticated,
            hasFiles: hasFiles,
            compareButtonEnabled: !this.compareButton.disabled
        });
    }
    
    updateAuthStatus() {
        if (spotifyApi.isAuthenticated()) {
            this.authStatus.innerHTML = '<span class="auth-success">Authentication successful! ✅</span>';
            this.authStatus.classList.add('auth-success-box');
            this.authButton.textContent = 'Re-Authenticate';
        } else if (spotifyApi.hasCachedData()) {
            this.authStatus.innerHTML = `
                <span class="auth-warning">Not authenticated, but cache available.</span>
                <div class="auth-info">You can use cached data for tracks you've looked up before</div>
            `;
            this.authStatus.classList.add('auth-warning-box');
        } else {
            this.authStatus.innerHTML = '<span class="auth-neutral">Not authenticated</span>';
            this.authStatus.classList.remove('auth-success-box', 'auth-warning-box');
            this.authButton.textContent = 'Authenticate';
        }
    }
    
    updateCompareButtonState(hasFiles = null, isAuthenticated = null) {
        // If parameters not provided, get them
        const filesAvailable = hasFiles !== null ? hasFiles : this.hasFiles();
        const isAuth = isAuthenticated !== null ? isAuthenticated : spotifyApi.isAuthenticated();
        const hasCachedData = spotifyApi.hasCachedData();
        
        // Enable compare button if authenticated or cache available AND files selected
        const canCompare = (isAuth || hasCachedData) && filesAvailable;
        
        logger.debug(`Compare button evaluation: filesAvailable=${filesAvailable}, isAuth=${isAuth}, hasCachedData=${hasCachedData}, canCompare=${canCompare}`);
        
        this.compareButton.disabled = !canCompare;
        
        // Update button text based on authentication state
        if (isAuth) {
            this.compareButton.textContent = 'Compare with Spotify';
            this.compareButton.classList.remove('cache-mode');
        } else if (hasCachedData) {
            this.compareButton.textContent = 'Compare with Cached Data';
            this.compareButton.classList.add('cache-mode');
        } else {
            this.compareButton.textContent = 'Compare with Spotify';
            this.compareButton.classList.remove('cache-mode');
        }
        
        logger.debug(`Compare button ${canCompare ? 'enabled' : 'disabled'}, Auth state: ${isAuth ? 'authenticated' : 'not authenticated'}`);
        
        // Return whether we're using cache-only mode
        return !isAuth && hasCachedData && filesAvailable;
    }
    
    hasFiles() {
        // First check if we have files in the fileList element
        const fileList = document.getElementById('file-list');
        if (fileList && fileList.children.length > 0) {
            // Make sure we're not just showing "No files found" message
            if (fileList.children.length === 1 && 
                fileList.children[0].tagName === 'P' &&
                fileList.children[0].textContent.includes('No')) {
                return false;
            }
            return true;
        }
        
        // As a backup, check with the fileUploader
        if (typeof fileUploader !== 'undefined' && fileUploader.getLocalFiles) {
            const localFiles = fileUploader.getLocalFiles();
            return Array.isArray(localFiles) && localFiles.length > 0;
        }
        
        return false;
    }
    
    // Add a debug function to help diagnose issues
    showAuthDebugInfo() {
        const debugInfo = spotifyApi.getAuthDebugInfo();
        
        // Create a readable debug message
        const message = `
    Authentication Debug:
    - Has token: ${debugInfo.hasToken}
    - Token expires: ${debugInfo.tokenExpiry || 'N/A'}
    - Is expired: ${debugInfo.isExpired}
    - Last attempt: ${debugInfo.lastAttempt || 'Never'}
    - Recent errors: ${debugInfo.errors.length ? debugInfo.errors.map(e => `\n  * ${e.time}: ${e.error}`).join('') : 'None'}
    `;
    
        logger.info(message);
        console.log(message);
        
        // You could also display this in the UI or alert it
        return message;
    }

    // Add this method to the UIManager class

    showError(message) {
        // Check if we have a dedicated error element
        const errorElement = document.getElementById('error-message');
        
        if (errorElement) {
            // If we have a dedicated error element, use it
            errorElement.textContent = message;
            errorElement.style.display = message ? 'block' : 'none';
        } else if (this.authStatus) {
            // Otherwise, use the auth status element for errors
            if (message) {
                this.authStatus.innerHTML = `<span class="auth-error">${message} ❌</span>`;
                this.authStatus.classList.add('auth-error-box');
            } else {
                // Clear error if empty message
                this.authStatus.classList.remove('auth-error-box');
            }
        } else {
            // Fallback to alert if no suitable UI element
            if (message) {
                console.error('UI Error:', message);
                alert(`Error: ${message}`);
            }
        }
        
        // Log error to console
        if (message) {
            logger.error('UI Error:', message);
        }
    }
}

// Create a singleton instance
const uiManager = new UIManager();