// Main application logic
document.addEventListener('DOMContentLoaded', () => {
    // State variables
    let isAuthenticated = false;
    let usingCacheOnly = false;
    
    // Update compare button state based on authentication and cached data
    const updateCompareButtonState = function() {
        const localFiles = fileUploader.getLocalFiles();
        const hasFiles = localFiles && localFiles.length > 0;
        const isAuthenticated = spotifyApi.isAuthenticated();
        const hasCachedData = spotifyApi.hasCachedData();
        
        logger.debug(`Updating compare button state: authenticated=${isAuthenticated}, hasCachedData=${hasCachedData}, hasFiles=${hasFiles}, fileCount=${localFiles?.length || 0}`);
        
        // Set global authentication state
        window.isAuthenticated = isAuthenticated;
        
        // Check if uiManager has the new updateUIState method
        if (typeof uiManager.updateUIState === 'function') {
            uiManager.updateUIState();
            usingCacheOnly = !isAuthenticated && hasCachedData;
        } else {
            // Fallback to old method
            usingCacheOnly = uiManager.updateCompareButtonState(hasFiles, isAuthenticated, hasCachedData);
        }
    };
    
    // Handle Spotify authentication
    const authenticateSpotify = async function() {
        const clientId = uiManager.clientIdInput.value.trim();
        const clientSecret = uiManager.clientSecretInput.value.trim();
        const rememberSecret = uiManager.rememberSecretCheckbox.checked;
        
        if (!clientId || !clientSecret) {
            uiManager.authStatus.textContent = 'Please enter both Client ID and Client Secret';
            uiManager.authStatus.className = 'error';
            return;
        }
        
        uiManager.authButton.disabled = true;
        uiManager.authStatus.textContent = 'Authenticating...';
        uiManager.authStatus.className = '';
        
        try {
            const success = await spotifyApi.authenticate(clientId, clientSecret);
            
            if (success) {
                uiManager.authStatus.textContent = 'Authentication successful!';
                uiManager.authStatus.className = 'success';
                isAuthenticated = true;
                updateCompareButtonState();
                
                // Save client ID for convenience
                localStorage.setItem('spotifyClientId', clientId);
                
                // Handle remembering the client secret if checkbox is checked
                localStorage.setItem('spotifyRememberSecret', rememberSecret.toString());
                if (rememberSecret) {
                    // Simple encoding for demo purposes (not secure encryption)
                    const encodedSecret = btoa(clientSecret);
                    localStorage.setItem('spotifyClientSecret', encodedSecret);
                } else {
                    // Remove any previously saved secret if not remembering
                    localStorage.removeItem('spotifyClientSecret');
                }
            } else {
                uiManager.authStatus.textContent = 'Authentication failed. Check your credentials.';
                uiManager.authStatus.className = 'error';
                isAuthenticated = false;
                updateCompareButtonState();
            }
        } catch (error) {
            uiManager.authStatus.textContent = `Error: ${error.message}`;
            uiManager.authStatus.className = 'error';
            isAuthenticated = false;
            updateCompareButtonState();
        } finally {
            uiManager.authButton.disabled = false;
        }
    };

    // Compare local files with Spotify data
    const compareSongs = async function() {
        const localFiles = fileUploader.getLocalFiles();
        if (localFiles.length === 0) {
            return;
        }
        
        // Verify we can proceed (either authenticated or using cache)
        if (!isAuthenticated && !usingCacheOnly) {
            return;
        }
        
        // Show loading
        uiManager.showLoading();
        
        // Process local files to get durations
        const processedFiles = await fileHandler.processFilesWithDuration();
        
        // Array to store results
        const results = [];
        let issues = 0;
        
        // Compare each file with Spotify data
        for (const fileData of processedFiles) {
            try {
                // Store the original title before any modifications
                const originalTitle = fileData.title;
                
                // Ensure proper Unicode normalization for non-Latin scripts
                const normalizedTitle = fileData.title ? fileData.title.normalize('NFC') : '';
                const normalizedArtist = fileData.artist ? fileData.artist.normalize('NFC') : '';
                const normalizedAlbum = fileData.album ? fileData.album.normalize('NFC') : '';
                
                // Search for track on Spotify (use cache-only mode if not authenticated)
                // Now with album information if available
                let searchResults = await spotifyApi.searchTrack(
                    normalizedTitle, 
                    normalizedArtist, 
                    normalizedAlbum, 
                    usingCacheOnly
                );
                
                // Pass album name to findBestMatch for better album comparison
                let bestMatch = spotifyApi.findBestMatch(
                    searchResults, 
                    normalizedTitle, 
                    normalizedArtist,
                    normalizedAlbum // Add album parameter
                );
                
                let status = config.statusMessages.notFound;
                let spotifyDuration = null;
                let spotifyDurationFormatted = 'N/A';
                let difference = null;
                let differenceFormatted = 'N/A';
                let hasIssue = false;
                let titleModified = false;
                let notFoundReason = '';
                
                // If no match found, determine reason and try variations
                if (!bestMatch) {
                    // Check if search returned any results
                    if (searchResults.length === 0) {
                        notFoundReason = 'No search results returned.';
                        
                        // If artist is provided, suggest it could be misspelled or different on Spotify
                        if (fileData.artist) {
                            // Check for slash in artist name which indicates a collaboration
                            if (fileData.artist.includes('/')) {
                                notFoundReason += `. Check if "${fileData.artist}" is spelled correctly or appears differently on Spotify.`;
                            }
                            
                            // Add different note based on whether using API or cache
                            if (usingCacheOnly) {
                                notFoundReason += ` This track may not be in your local cache yet. Try authenticating to search Spotify directly.`;
                            } else {
                                notFoundReason += ` The track might be region-restricted or recently added to Spotify.`;
                            }
                        } else {
                            notFoundReason += `. Consider adding artist information to the filename.`;
                            
                            // Add different note based on whether using API or cache
                            if (usingCacheOnly) {
                                notFoundReason += ` Limited cache data may prevent finding tracks without artist information.`;
                            } else {
                                notFoundReason += ` Spotify searches are more effective with artist names.`;
                            }
                        }
                    } else {
                        notFoundReason = `Found ${searchResults.length} results, but none matched closely enough. The closest match was "${
                            searchResults[0].name}" by ${searchResults[0].artists.map(a => a.name).join(', ')}.`;
                    }
                    
                    // Try stripping trailing numbers if present
                    if (resultsManager.hasTrailingNumber(fileData.title)) {
                        const strippedTitle = resultsManager.stripTrailingNumber(fileData.title);
                        searchResults = await spotifyApi.searchTrack(strippedTitle, fileData.artist, fileData.album || '', usingCacheOnly);
                        bestMatch = spotifyApi.findBestMatch(searchResults, strippedTitle, fileData.artist);
                        
                        if (bestMatch) {
                            titleModified = true;
                            fileData.title = strippedTitle; // Change the working title for Spotify matching
                            notFoundReason = ''; // Clear the reason since we found a match
                        } else {
                            notFoundReason += ` Tried without the number (${strippedTitle}) but still no match.`;
                        }
                    }
                }
                
                if (bestMatch) {
                    spotifyDuration = bestMatch.duration_ms;
                    spotifyDurationFormatted = fileHandler.formatDuration(spotifyDuration);
                    difference = Math.abs(fileData.durationMs - spotifyDuration);
                    differenceFormatted = fileHandler.formatDuration(difference);
                    
                    // Determine status based on difference
                    if (difference <= config.lengthToleranceMs) {
                        status = config.statusMessages.ok;
                        hasIssue = false;
                    } else if (difference <= config.warningToleranceMs) {
                        status = config.statusMessages.warning;
                        hasIssue = true;
                        issues++;
                    } else {
                        status = config.statusMessages.error;
                        hasIssue = true;
                        issues++;
                    }
                } else {
                    // Track not found on Spotify
                    hasIssue = true;
                    issues++;
                }
                
                // Add to results
                results.push({
                    fileName: fileData.fileName,
                    title: fileData.title, // This is possibly modified
                    originalTitle: originalTitle, // Keep the unmodified title
                    titleModified: titleModified,
                    artist: fileData.artist,
                    localDuration: fileData.durationMs,
                    localDurationFormatted: fileData.formattedDuration,
                    spotifyDuration: spotifyDuration,
                    spotifyDurationFormatted: spotifyDurationFormatted,
                    difference: difference,
                    differenceFormatted: differenceFormatted,
                    status: status,
                    hasIssue: hasIssue,
                    spotifyData: bestMatch,
                    notFoundReason: notFoundReason,
                    errorDetails: status === config.statusMessages.error ? 
                        `The track is ${differenceFormatted} ${fileData.durationMs > spotifyDuration ? 'longer' : 'shorter'} than the Spotify version.` : 
                        undefined
                });
                
            } catch (error) {
                console.error(`Error comparing ${fileData.fileName}:`, error);
                
                // Create a more descriptive error message for the user
                let errorMessage = error.message;
                let errorDetails = '';
                
                // Add more context based on error type
                if (error.message.includes('authenticate') || error.message.includes('Authentication')) {
                    errorDetails = 'Please check your Spotify authentication status and try again.';
                } else if (error.message.includes('timeout') || error.message.includes('network')) {
                    errorDetails = 'There was a network issue when connecting to Spotify. Please check your internet connection.';
                } else if (error.message.includes('rate limit')) {
                    errorDetails = 'Spotify API rate limit exceeded. Please wait a moment and try again.';
                } else {
                    errorDetails = 'There was an issue comparing this track with Spotify. Try authenticating again or check the file format.';
                }
                
                results.push({
                    fileName: fileData.fileName,
                    title: fileData.title,
                    artist: fileData.artist,
                    localDuration: fileData.durationMs,
                    localDurationFormatted: fileData.formattedDuration,
                    spotifyDuration: null,
                    spotifyDurationFormatted: 'N/A',
                    difference: null,
                    differenceFormatted: 'N/A',
                    status: 'ERROR',
                    hasIssue: true,
                    error: errorMessage,
                    errorDetails: errorDetails
                });
                issues++;
            }
        }
        
        // Display results
        resultsManager.displayResults(results, issues, uiManager);
        
        // Hide loading
        uiManager.hideLoading();
        
        // Update the summary text to indicate cache-only mode if applicable
        if (usingCacheOnly) {
            uiManager.resultsSummary.innerHTML += ' <span class="cache-mode-indicator">(Using cached data)</span>';
        }
        
        // Update cache status information after processing
        cacheManager.updateCacheStatus(uiManager);
    };

    // Event to trigger when files are added
    const triggerFilesAddedEvent = function() {
        // Create a custom event
        const filesAddedEvent = new CustomEvent('filesAdded', {
            detail: { files: fileUploader.getLocalFiles() }
        });
        
        // Dispatch the event
        document.dispatchEvent(filesAddedEvent);
    };
    
    // Modify the file uploader to dispatch an event when files change
    const originalSetLocalFiles = fileUploader.setLocalFiles;
    fileUploader.setLocalFiles = function(files) {
        originalSetLocalFiles.call(this, files);
        triggerFilesAddedEvent();
    };

    // Initialize UI elements
    uiManager.initUI();
    
    // Initialize cache UI and settings
    cacheManager.initCacheUI(uiManager);
    
    // Connect FileHandler with UIManager
    fileHandler.setUIManager(uiManager);
    
    // Load saved credentials from localStorage if available
    cacheManager.loadSavedCredentials(uiManager);
    
    // Check if we can enable the compare button with cached data
    updateCompareButtonState();
    
    // Event Listeners
    uiManager.authButton.addEventListener('click', authenticateSpotify);
    uiManager.folderSelector.addEventListener('change', e => fileUploader.handleFileSelection(e, fileHandler, uiManager));
    uiManager.filesSelector.addEventListener('change', e => fileUploader.handleFileSelection(e, fileHandler, uiManager));
    uiManager.compareButton.addEventListener('click', compareSongs);
    uiManager.clearCacheButton.addEventListener('click', () => cacheManager.clearCache(uiManager));
    uiManager.cacheEnabledToggle.addEventListener('change', e => cacheManager.toggleCacheEnabled(e, uiManager));
    
    // Upload type toggle handlers
    uiManager.folderOption.addEventListener('change', e => uiManager.toggleUploadType(e, fileUploader));
    uiManager.filesOption.addEventListener('change', e => uiManager.toggleUploadType(e, fileUploader));
    
    // Add filter event listeners only if elements exist
    if (uiManager.showAllIssuesCheckbox) {
        uiManager.showAllIssuesCheckbox.addEventListener('change', () => resultsManager.filterIssues(uiManager));
    }
    if (uiManager.showWarningsCheckbox) {
        uiManager.showWarningsCheckbox.addEventListener('change', () => resultsManager.filterIssues(uiManager));
    }
    if (uiManager.showErrorsCheckbox) {
        uiManager.showErrorsCheckbox.addEventListener('change', () => resultsManager.filterIssues(uiManager));
    }
    if (uiManager.showNotFoundCheckbox) {
        uiManager.showNotFoundCheckbox.addEventListener('change', () => resultsManager.filterIssues(uiManager));
    }
    
    // Add new event listeners for modern file selection
    if (uiManager.modernFilePickerBtn) {
        uiManager.modernFilePickerBtn.addEventListener('click', () => fileUploader.useModernFilePicker(fileHandler, uiManager));
    }
    if (uiManager.modernFolderPickerBtn) {
        uiManager.modernFolderPickerBtn.addEventListener('click', () => fileUploader.useModernFolderPicker(fileHandler, uiManager));
    }
    if (uiManager.dragDropArea) {
        uiManager.dragDropArea.addEventListener('dragover', e => fileUploader.handleDragOver(e, uiManager));
        uiManager.dragDropArea.addEventListener('dragleave', e => fileUploader.handleDragLeave(e, uiManager));
        uiManager.dragDropArea.addEventListener('drop', e => fileUploader.handleFileDrop(e, fileHandler, uiManager));
        uiManager.dragDropArea.addEventListener('click', () => fileUploader.triggerAppropriateFilePicker(fileHandler, uiManager));
    }
    
    // Add or modify these event handlers

    // Authenticate button click handler
    document.getElementById('auth-button').addEventListener('click', async () => {
        const clientId = document.getElementById('client-id').value.trim();
        const clientSecret = document.getElementById('client-secret').value.trim();
        const rememberSecret = document.getElementById('remember-secret').checked;
        
        // Clear previous errors
        uiManager.showError('');
        
        if (!clientId || !clientSecret) {
            uiManager.showError('Please enter both Client ID and Client Secret');
            return;
        }
        
        uiManager.authStatus.innerHTML = '<span>Authenticating...</span> <div class="inline-spinner"></div>';
        
        try {
            logger.info('Starting authentication process...');
            const success = await spotifyApi.authenticate(clientId, clientSecret);
            
            if (success) {
                // Save credentials if requested
                localStorage.setItem('spotifyClientId', clientId);
                
                if (rememberSecret) {
                    // Simple encoding (not secure, just to avoid plaintext)
                    const encodedSecret = btoa(clientSecret);
                    localStorage.setItem('spotifyClientSecret', encodedSecret);
                    localStorage.setItem('spotifyRememberSecret', 'true');
                } else {
                    localStorage.removeItem('spotifyClientSecret');
                    localStorage.setItem('spotifyRememberSecret', 'false');
                }
                
                logger.info('Authentication successful, updating UI');
                // Update UI to reflect authenticated state
                uiManager.updateUIState();
            } else {
                uiManager.showError('Authentication failed. Please check your credentials and try again.');
                uiManager.authStatus.innerHTML = '<span class="auth-error">Authentication failed! ❌</span>';
                
                // Debug info
                logger.error('Authentication failed:', spotifyApi.getAuthDebugInfo());
            }
        } catch (error) {
            logger.error('Error during authentication:', error);
            uiManager.showError(`Authentication error: ${error.message}`);
            uiManager.authStatus.innerHTML = '<span class="auth-error">Authentication error! ❌</span>';
        }
    });

    // Add a debug command in the console for troubleshooting
    window.debugAuth = () => {
        return uiManager.showAuthDebugInfo();
    };

    // Compare button click handler
    document.getElementById('compare-button').addEventListener('click', async () => {
        if (!spotifyApi.isAuthenticated() && !spotifyApi.hasCachedData()) {
            logger.error('Cannot compare: Not authenticated and no cached data available');
            uiManager.showError('Authentication required. Please authenticate with Spotify or enable cached data.');
            return;
        }
        
        if (!uiManager.hasFiles()) {
            logger.error('Cannot compare: No files selected');
            uiManager.showError('No files selected. Please select audio files first.');
            return;
        }
        
        // Log authentication state for debugging
        logger.info('Starting comparison with auth state:', {
            isAuthenticated: spotifyApi.isAuthenticated(),
            hasCachedData: spotifyApi.hasCachedData(),
            tokenExpiry: spotifyApi.tokenExpiry ? new Date(spotifyApi.tokenExpiry).toISOString() : 'No token'
        });
        
        // Call the existing comparison function instead of duplicating code
        compareSongs();
    });

    // When files are added, ensure compare button state is updated
    document.addEventListener('filesAdded', () => {
        logger.debug('Files added event received, updating compare button state');
        updateCompareButtonState();
    });
});