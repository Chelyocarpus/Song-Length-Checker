// Main application logic
document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const clientIdInput = document.getElementById('client-id');
    const clientSecretInput = document.getElementById('client-secret');
    const rememberSecretCheckbox = document.getElementById('remember-secret');
    const authButton = document.getElementById('auth-button');
    const authStatus = document.getElementById('auth-status');
    
    // File upload elements
    const folderOption = document.getElementById('folder-option');
    const filesOption = document.getElementById('files-option');
    const folderInputContainer = document.getElementById('folder-input-container');
    const filesInputContainer = document.getElementById('files-input-container');
    const folderSelector = document.getElementById('folder-selector');
    const filesSelector = document.getElementById('files-selector');
    const modernFilePickerBtn = document.getElementById('modern-file-picker');
    const modernFolderPickerBtn = document.getElementById('modern-folder-picker');
    const dragDropArea = document.getElementById('drag-drop-area');
    
    const fileList = document.getElementById('file-list');
    const compareButton = document.getElementById('compare-button');
    const loadingIndicator = document.getElementById('loading');
    const resultsTable = document.getElementById('results-table');
    const resultsBody = document.getElementById('results-body');
    const resultsSummary = document.getElementById('results-summary');
    
    // Cache management DOM elements
    const cacheStatus = document.getElementById('cache-status');
    const clearCacheButton = document.getElementById('clear-cache-button');
    const cacheEnabledToggle = document.getElementById('cache-enabled-toggle');
    
    // Get filter elements if they exist
    const showAllIssuesCheckbox = document.getElementById('show-all-issues');
    const showWarningsCheckbox = document.getElementById('show-warnings');
    const showErrorsCheckbox = document.getElementById('show-errors');
    const showNotFoundCheckbox = document.getElementById('show-not-found');
    
    // State variables
    let localFiles = [];
    let isAuthenticated = false;
    let usingCacheOnly = false;
    
    // Initialize UI elements
    initUI();
    
    // Event Listeners
    authButton.addEventListener('click', authenticateSpotify);
    folderSelector.addEventListener('change', handleFileSelection);
    filesSelector.addEventListener('change', handleFileSelection);
    compareButton.addEventListener('click', compareSongs);
    clearCacheButton.addEventListener('click', clearCache);
    cacheEnabledToggle.addEventListener('change', toggleCacheEnabled);
    
    // Upload type toggle handlers
    folderOption.addEventListener('change', toggleUploadType);
    filesOption.addEventListener('change', toggleUploadType);
    
    // Add filter event listeners only if elements exist
    if (showAllIssuesCheckbox) showAllIssuesCheckbox.addEventListener('change', filterIssues);
    if (showWarningsCheckbox) showWarningsCheckbox.addEventListener('change', filterIssues);
    if (showErrorsCheckbox) showErrorsCheckbox.addEventListener('change', filterIssues);
    if (showNotFoundCheckbox) showNotFoundCheckbox.addEventListener('change', filterIssues);
    
    // Add styling to filter options only if they exist
    addFilterOptionStyles();
    
    // Add new event listeners for modern file selection
    if (modernFilePickerBtn) modernFilePickerBtn.addEventListener('click', useModernFilePicker);
    if (modernFolderPickerBtn) modernFolderPickerBtn.addEventListener('click', useModernFolderPicker);
    if (dragDropArea) {
        dragDropArea.addEventListener('dragover', handleDragOver);
        dragDropArea.addEventListener('dragleave', handleDragLeave);
        dragDropArea.addEventListener('drop', handleFileDrop);
        dragDropArea.addEventListener('click', triggerAppropriateFilePicker);
    }
    
    // Helper function to safely add styles to filter options
    function addFilterOptionStyles() {
        const allIssuesLabel = document.querySelector('label[for="show-all-issues"]');
        const warningsLabel = document.querySelector('label[for="show-warnings"]');
        const errorsLabel = document.querySelector('label[for="show-errors"]');
        const notFoundLabel = document.querySelector('label[for="show-not-found"]');
        
        if (allIssuesLabel) allIssuesLabel.parentElement.classList.add('all-issues');
        if (warningsLabel) warningsLabel.parentElement.classList.add('warnings');
        if (errorsLabel) errorsLabel.parentElement.classList.add('errors');
        if (notFoundLabel) notFoundLabel.parentElement.classList.add('not-found');
    }
    
    // Initialize the cache UI
    initCacheUI();
    
    // Load saved credentials from localStorage if available
    loadSavedCredentials();
    
    // Check if we can enable the compare button with cached data
    updateCompareButtonState();
    
    // Initialize UI elements
    function initUI() {
        // Reset file inputs
        if (folderSelector) folderSelector.value = '';
        if (filesSelector) filesSelector.value = '';
        
        // Reset file list display
        fileList.innerHTML = '';
        
        // Reset drag-drop area if it exists
        if (dragDropArea) {
            dragDropArea.classList.remove('has-files', 'active', 'processing');
            dragDropArea.classList.add('empty');
            
            // Set the correct text based on selected upload type
            if (folderOption && folderOption.checked) {
                dragDropArea.setAttribute('data-text', 'Drag & drop a folder here or click to browse');
            } else {
                dragDropArea.setAttribute('data-text', 'Drag & drop audio files here or click to browse');
            }
        }
        
        // Set initial upload containers visibility
        if (folderOption && folderOption.checked) {
            folderInputContainer.classList.remove('hidden');
            filesInputContainer.classList.add('hidden');
        } else if (filesOption && filesOption.checked) {
            folderInputContainer.classList.add('hidden');
            filesInputContainer.classList.remove('hidden');
        }
        
        // Initialize the cache UI
        initCacheUI();
        
        // Load saved credentials from localStorage if available
        loadSavedCredentials();
        
        // Check if we can enable the compare button with cached data
        updateCompareButtonState();
    }
    
    // Load Spotify credentials from local storage
    function loadSavedCredentials() {
        if (localStorage.getItem('spotifyClientId')) {
            clientIdInput.value = localStorage.getItem('spotifyClientId');
        }
        
        // Check if client secret is saved (and should be loaded)
        if (localStorage.getItem('spotifyRememberSecret') === 'true' && 
            localStorage.getItem('spotifyClientSecret')) {
            try {
                // Decrypt the client secret (simple encoding for demo purposes)
                const encryptedSecret = localStorage.getItem('spotifyClientSecret');
                const secret = atob(encryptedSecret);
                clientSecretInput.value = secret;
                rememberSecretCheckbox.checked = true;
            } catch (error) {
                console.error('Error loading saved client secret:', error);
            }
        }
    }
    
    // Initialize cache UI and settings
    function initCacheUI() {
        // Set toggle based on config setting
        cacheEnabledToggle.checked = config.cache.enabled;
        
        // Update cache status display
        updateCacheStatus();
        
        // Load cache enabled setting from localStorage if available
        const savedCacheEnabled = localStorage.getItem('spotifyCacheEnabled');
        if (savedCacheEnabled !== null) {
            const isEnabled = savedCacheEnabled === 'true';
            config.cache.enabled = isEnabled;
            cacheEnabledToggle.checked = isEnabled;
        }
    }
    
    // Update cache status display
    function updateCacheStatus() {
        try {
            // Get cache statistics
            const searches = localStorage.getItem('spotifySearchCache');
            const tracks = localStorage.getItem('spotifyTrackCache');
            
            const searchCache = searches ? JSON.parse(searches) : {};
            const trackCache = tracks ? JSON.parse(tracks) : {};
            
            const searchCount = Object.keys(searchCache).length;
            const trackCount = Object.keys(trackCache).length;
            
            // Calculate cache size (approximate)
            const searchSize = searches ? searches.length : 0;
            const trackSize = tracks ? tracks.length : 0;
            const totalSize = (searchSize + trackSize) / 1024; // Convert to KB
            
            if (config.cache.enabled) {
                cacheStatus.innerHTML = `
                    <span class="cache-enabled">✅ Cache enabled</span><br>
                    ${searchCount} searches, ${trackCount} tracks cached<br>
                    Approx. size: ${totalSize.toFixed(1)} KB
                `;
            } else {
                cacheStatus.innerHTML = `
                    <span class="cache-disabled">❌ Cache disabled</span><br>
                    ${searchCount} searches, ${trackCount} tracks stored<br>
                    Approx. size: ${totalSize.toFixed(1)} KB
                `;
            }
        } catch (error) {
            console.error('Error updating cache status:', error);
            cacheStatus.textContent = `Error getting cache status: ${error.message}`;
        }
    }
    
    // Clear the Spotify API cache
    function clearCache() {
        spotifyApi.clearCache();
        updateCacheStatus();
        alert('Spotify API cache has been cleared');
    }
    
    // Toggle cache enabled/disabled
    function toggleCacheEnabled(event) {
        const isEnabled = event.target.checked;
        config.cache.enabled = isEnabled;
        localStorage.setItem('spotifyCacheEnabled', isEnabled.toString());
        updateCacheStatus();
    }
    
    // Handle Spotify authentication
    async function authenticateSpotify() {
        const clientId = clientIdInput.value.trim();
        const clientSecret = clientSecretInput.value.trim();
        const rememberSecret = rememberSecretCheckbox.checked;
        
        if (!clientId || !clientSecret) {
            authStatus.textContent = 'Please enter both Client ID and Client Secret';
            authStatus.className = 'error';
            return;
        }
        
        authButton.disabled = true;
        authStatus.textContent = 'Authenticating...';
        authStatus.className = '';
        
        try {
            const success = await spotifyApi.authenticate(clientId, clientSecret);
            
            if (success) {
                authStatus.textContent = 'Authentication successful!';
                authStatus.className = 'success';
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
                
                // Enable compare button if we have files
                if (localFiles.length > 0) {
                    compareButton.disabled = false;
                }
            } else {
                authStatus.textContent = 'Authentication failed. Check your credentials.';
                authStatus.className = 'error';
                isAuthenticated = false;
                updateCompareButtonState();
            }
        } catch (error) {
            authStatus.textContent = `Error: ${error.message}`;
            authStatus.className = 'error';
            isAuthenticated = false;
            updateCompareButtonState();
        } finally {
            authButton.disabled = false;
        }
    }
    
    // Handle file selection with enhanced functionality
    function handleFileSelection(event) {
        // Show the loading state on the drag-drop area if it exists
        if (dragDropArea) {
            dragDropArea.classList.add('processing');
        }
        
        const files = fileHandler.processSelectedFiles(event.target.files);
        updateFileListUI(files);
        
        // Store file input id to help with identifying which input was used
        if (event.target.id) {
            localStorage.setItem('lastUsedFileInput', event.target.id);
        }
    }
    
    // Update file list UI with selected files
    function updateFileListUI(files) {
        localFiles = files;
        
        // Update the UI with selected files
        fileList.innerHTML = '';
        
        if (files.length === 0) {
            fileList.innerHTML = '<p>No supported audio files found.</p>';
            if (dragDropArea) {
                dragDropArea.classList.remove('active', 'processing');
                dragDropArea.classList.add('empty');
                
                // Ensure the correct text is set
                if (folderOption && folderOption.checked) {
                    dragDropArea.setAttribute('data-text', 'Drag & drop a folder here or click to browse');
                } else {
                    dragDropArea.setAttribute('data-text', 'Drag & drop audio files here or click to browse');
                }
            }
            compareButton.disabled = true;
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
        
        fileList.appendChild(fragment);
        
        if (dragDropArea) {
            dragDropArea.classList.remove('active', 'processing', 'empty');
            dragDropArea.classList.add('has-files');
        }
        
        // Enable compare button based on authentication status and cache
        updateCompareButtonState();
    }
    
    // Check if the File System Access API is available
    function isFileSystemAccessAPIAvailable() {
        return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
    }
    
    // Use modern file picker API if available
    async function useModernFilePicker() {
        if (!isFileSystemAccessAPIAvailable()) {
            // Fallback to traditional file input
            filesSelector.click();
            return;
        }
        
        try {
            if (dragDropArea) dragDropArea.classList.add('processing');
            
            const options = {
                types: [
                    {
                        description: 'Audio Files',
                        accept: {
                            'audio/*': config.supportedAudioFormats
                        }
                    }
                ],
                excludeAcceptAllOption: false,
                multiple: true
            };
            
            const fileHandles = await window.showOpenFilePicker(options);
            const files = await Promise.all(fileHandles.map(handle => handle.getFile()));
            
            // Process the selected files
            const processedFiles = fileHandler.processSelectedFiles(files);
            updateFileListUI(processedFiles);
        } catch (error) {
            console.error('Error using modern file picker:', error);
            // If user canceled or error occurred, remove processing state
            if (dragDropArea) dragDropArea.classList.remove('processing');
            
            // Only show error for non-abort errors
            if (error.name !== 'AbortError') {
                alert(`Error selecting files: ${error.message}`);
            }
        }
    }
    
    // Use modern folder picker API if available
    async function useModernFolderPicker() {
        if (!isFileSystemAccessAPIAvailable()) {
            // Fallback to traditional folder input
            folderSelector.click();
            return;
        }
        
        try {
            if (dragDropArea) dragDropArea.classList.add('processing');
            
            const dirHandle = await window.showDirectoryPicker();
            const files = await collectFilesFromDirectory(dirHandle);
            
            // Process the collected files
            const processedFiles = fileHandler.processSelectedFiles(files);
            updateFileListUI(processedFiles);
        } catch (error) {
            console.error('Error using modern folder picker:', error);
            // If user canceled or error occurred, remove processing state
            if (dragDropArea) dragDropArea.classList.remove('processing');
            
            // Only show error for non-abort errors
            if (error.name !== 'AbortError') {
                alert(`Error selecting folder: ${error.message}`);
            }
        }
    }
    
    // Recursively collect files from a directory using File System Access API
    async function collectFilesFromDirectory(dirHandle, path = '') {
        const files = [];
        
        // Iterate through all entries in the directory
        for await (const entry of dirHandle.values()) {
            const entryPath = path ? `${path}/${entry.name}` : entry.name;
            
            if (entry.kind === 'file') {
                // Check if it's a supported audio file
                const extension = '.' + entry.name.split('.').pop().toLowerCase();
                if (config.supportedAudioFormats.includes(extension)) {
                    const file = await entry.getFile();
                    // Create a new File object with the path information
                    files.push(new File(
                        [file], 
                        entryPath, 
                        { type: file.type, lastModified: file.lastModified }
                    ));
                }
            } else if (entry.kind === 'directory') {
                // Recursively process subdirectories
                const subDirFiles = await collectFilesFromDirectory(entry, entryPath);
                files.push(...subDirFiles);
            }
        }
        
        return files;
    }
    
    // Handle drag over event
    function handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        dragDropArea.classList.add('active');
        dragDropArea.classList.remove('empty');
    }
    
    // Handle drag leave event
    function handleDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        dragDropArea.classList.remove('active');
        if (localFiles.length === 0) {
            dragDropArea.classList.add('empty');
        }
    }
    
    // Handle file drop event
    async function handleFileDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        
        dragDropArea.classList.remove('active');
        dragDropArea.classList.add('processing');
        
        try {
            // Check if the dataTransfer contains items (for folder support)
            if (event.dataTransfer.items) {
                const items = event.dataTransfer.items;
                const allFiles = [];
                
                // Process all items
                await Promise.all(Array.from(items).map(async item => {
                    // Try to get as FileSystemEntry first (for directory support)
                    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                    
                    if (entry && entry.isDirectory) {
                        const dirFiles = await traverseFileTree(entry);
                        allFiles.push(...dirFiles);
                    } else {
                        // Handle as regular file
                        const file = item.getAsFile();
                        if (file) allFiles.push(file);
                    }
                }));
                
                // Process collected files
                const processedFiles = fileHandler.processSelectedFiles(allFiles);
                updateFileListUI(processedFiles);
            } else {
                // Fallback to regular files
                const files = event.dataTransfer.files;
                const processedFiles = fileHandler.processSelectedFiles(files);
                updateFileListUI(processedFiles);
            }
        } catch (error) {
            console.error('Error handling dropped files:', error);
            dragDropArea.classList.remove('processing');
            alert(`Error processing dropped files: ${error.message}`);
            
            // Reset UI if no files were processed
            if (localFiles.length === 0) {
                dragDropArea.classList.add('empty');
            }
        }
    }
    
    // Recursively traverse directory structure from drag and drop
    async function traverseFileTree(entry, path = '') {
        const files = [];
        
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file(file => {
                    // Create a new File object with path info if needed
                    const fullPath = path ? `${path}/${file.name}` : file.name;
                    const fileWithPath = path ? 
                        new File([file], fullPath, { type: file.type, lastModified: file.lastModified }) : 
                        file;
                    
                    files.push(fileWithPath);
                    resolve(files);
                }, err => {
                    console.error('Error getting file:', err);
                    resolve(files);
                });
            });
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const entries = await readAllDirectoryEntries(dirReader);
            
            for (const childEntry of entries) {
                const childPath = path ? `${path}/${entry.name}` : entry.name;
                const childFiles = await traverseFileTree(childEntry, childPath);
                files.push(...childFiles);
            }
        }
        
        return files;
    }
    
    // Helper to read all entries from a directory reader
    // (needed because readEntries() might not return all entries in a single call)
    async function readAllDirectoryEntries(dirReader) {
        const entries = [];
        let readEntries = await readEntriesPromise(dirReader);
        
        while (readEntries.length) {
            entries.push(...readEntries);
            readEntries = await readEntriesPromise(dirReader);
        }
        
        return entries;
    }
    
    // Promise wrapper for readEntries()
    function readEntriesPromise(dirReader) {
        return new Promise((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
        });
    }
    
    // Trigger the appropriate file picker based on selected upload type
    function triggerAppropriateFilePicker() {
        if (folderOption.checked) {
            if (isFileSystemAccessAPIAvailable()) {
                useModernFolderPicker();
            } else {
                folderSelector.click();
            }
        } else {
            if (isFileSystemAccessAPIAvailable()) {
                useModernFilePicker();
            } else {
                filesSelector.click();
            }
        }
    }
    
    // Toggle between folder upload and individual files upload
    function toggleUploadType(event) {
        if (event.target.value === 'folder') {
            folderInputContainer.classList.remove('hidden');
            filesInputContainer.classList.add('hidden');
            
            // Update the drag-drop area text if it exists
            if (dragDropArea) {
                dragDropArea.setAttribute('data-text', 'Drag & drop a folder here or click to browse');
            }
            
            // Reset file selectors when switching
            if (filesSelector.value) filesSelector.value = '';
            fileList.innerHTML = '';
            localFiles = [];
            
            // Reset drag-drop UI state
            if (dragDropArea) {
                dragDropArea.classList.remove('has-files');
                dragDropArea.classList.add('empty');
            }
            
            updateCompareButtonState();
        } else {
            folderInputContainer.classList.add('hidden');
            filesInputContainer.classList.remove('hidden');
            
            // Update the drag-drop area text if it exists
            if (dragDropArea) {
                dragDropArea.setAttribute('data-text', 'Drag & drop audio files here or click to browse');
            }
            
            // Reset file selectors when switching
            if (folderSelector.value) folderSelector.value = '';
            fileList.innerHTML = '';
            localFiles = [];
            
            // Reset drag-drop UI state
            if (dragDropArea) {
                dragDropArea.classList.remove('has-files');
                dragDropArea.classList.add('empty');
            }
            
            updateCompareButtonState();
        }
    }
    
    // Compare local files with Spotify data
    async function compareSongs() {
        if (localFiles.length === 0) {
            return;
        }
        
        // Verify we can proceed (either authenticated or using cache)
        if (!isAuthenticated && !usingCacheOnly) {
            return;
        }
        
        // Show loading
        compareButton.disabled = true;
        loadingIndicator.classList.remove('hidden');
        resultsTable.classList.add('hidden');
        resultsSummary.textContent = '';
        resultsSummary.className = '';
        
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
                    if (hasTrailingNumber(fileData.title)) {
                        const strippedTitle = stripTrailingNumber(fileData.title);
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
                        // Add specific reasoning for length errors
                        const errorDetails = `The track is ${differenceFormatted} ${fileData.durationMs > spotifyDuration ? 'longer' : 'shorter'} than the Spotify version.`;
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
        displayResults(results, issues);
        
        // Hide loading
        loadingIndicator.classList.add('hidden');
        compareButton.disabled = false;
        
        // Update the summary text to indicate cache-only mode if applicable
        if (usingCacheOnly) {
            resultsSummary.innerHTML += ' <span class="cache-mode-indicator">(Using cached data)</span>';
        }
        
        // Update cache status information after processing
        updateCacheStatus();
    }
    
    // Function to check if a title has a trailing number (e.g., "Song 2", "Track 3")
    function hasTrailingNumber(title) {
        return /\s+\d+\s*$/.test(title);
    }
    
    // Function to strip trailing numbers from a title
    function stripTrailingNumber(title) {
        return title.replace(/\s+\d+\s*$/, '').trim();
    }
    
    // Display comparison results
    function displayResults(results, issueCount) {
        resultsBody.innerHTML = '';
        
        // Add each result to the table
        results.forEach((result, index) => {
            // Create the main result row
            const row = document.createElement('tr');
            row.dataset.index = index;
            row.dataset.resultType = 'main-row';
            
            if (result.hasIssue) {
                row.className = 'issue-row';
                row.id = `issue-${index}`;
                
                // Add issue type as a data attribute for better filtering
                if (result.status === config.statusMessages.warning) {
                    row.dataset.issueType = 'warning';
                } else if (result.status === config.statusMessages.error) {
                    row.dataset.issueType = 'error';
                } else if (result.status === config.statusMessages.notFound) {
                    row.dataset.issueType = 'not-found';
                } else if (result.status === 'ERROR') {
                    row.dataset.issueType = 'error';
                }
            }
            
            // Use the complete filename instead of just the title
            let titleDisplay = result.fileName;
            
            // Add issue badge to status column for visual emphasis
            let statusDisplay = result.status;
            if (result.hasIssue) {
                statusDisplay = `${result.status} <span class="issue-badge">!</span>`;
            }
            
            // Song (without Artist column)
            row.innerHTML = `
                <td>${titleDisplay}</td>
                <td>${result.localDurationFormatted}</td>
                <td>${result.spotifyDurationFormatted}</td>
                <td>${result.differenceFormatted}</td>
                <td class="status-${result.status.toLowerCase()}">${statusDisplay}</td>
            `;
            
            // Add the row to the table
            resultsBody.appendChild(row);
            
            // Add not found reason row if applicable
            if (result.status === config.statusMessages.notFound && result.notFoundReason) {
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
                        <span class="reason-label">Reason:</span> ${result.notFoundReason}
                    </div>
                `;
                
                reasonRow.appendChild(reasonCell);
                resultsBody.appendChild(reasonRow);
            }
            
            // Add error reason row if applicable
            if ((result.status === config.statusMessages.error || result.status === 'ERROR') && 
                (result.error || result.errorDetails)) {
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
                const errorContent = result.errorDetails 
                    ? `${result.errorDetails} ${result.error ? `<span class="technical-error">(${result.error})</span>` : ''}`
                    : (result.error || 'Unknown error');
                
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
        if (showAllIssuesCheckbox) showAllIssuesCheckbox.checked = false;
        if (showWarningsCheckbox) showWarningsCheckbox.checked = false;
        if (showErrorsCheckbox) showErrorsCheckbox.checked = false;
        if (showNotFoundCheckbox) showNotFoundCheckbox.checked = false;
        
        // Remove active class from all filter options
        document.querySelectorAll('.filter-option').forEach(option => {
            option.classList.remove('active');
        });
    }
    
    // Updated filter function to handle multiple issue types and reason rows
    function filterIssues() {
        // Only proceed if the filter elements exist
        if (!showAllIssuesCheckbox || !showWarningsCheckbox || 
            !showErrorsCheckbox || !showNotFoundCheckbox) {
            console.warn('Filter elements not found in the DOM');
            return;
        }
        
        // Save the current scroll position before applying filters
        const scrollY = window.scrollY;
        
        // Get checkbox states directly from the DOM elements
        const showAllIssues = showAllIssuesCheckbox.checked;
        const showWarnings = showWarningsCheckbox.checked;
        const showErrors = showErrorsCheckbox.checked;
        const showNotFound = showNotFoundCheckbox.checked;
        
        // Update visual state of filter options
        const allIssuesOption = document.querySelector('label[for="show-all-issues"]')?.parentElement;
        const warningsOption = document.querySelector('label[for="show-warnings"]')?.parentElement;
        const errorsOption = document.querySelector('label[for="show-errors"]')?.parentElement;
        const notFoundOption = document.querySelector('label[for="show-not-found"]')?.parentElement;
        
        if (allIssuesOption) allIssuesOption.classList.toggle('active', showAllIssues);
        if (warningsOption) warningsOption.classList.toggle('active', showWarnings);
        if (errorsOption) errorsOption.classList.toggle('active', showErrors);
        if (notFoundOption) notFoundOption.classList.toggle('active', showNotFound);
        
        // Check which checkbox triggered the event
        const activeElement = document.activeElement;
        
        if (activeElement === showAllIssuesCheckbox) {
            // If "All Issues" was clicked, set all other checkboxes to match
            showWarningsCheckbox.checked = showAllIssues;
            showErrorsCheckbox.checked = showAllIssues;
            showNotFoundCheckbox.checked = showAllIssues;
            
            // Update the active states
            if (warningsOption) warningsOption.classList.toggle('active', showAllIssues);
            if (errorsOption) errorsOption.classList.toggle('active', showAllIssues);
            if (notFoundOption) notFoundOption.classList.toggle('active', showAllIssues);
        } else {
            // If individual filter was clicked, update "All Issues" based on the state of all specific filters
            const allSpecificFiltersChecked = showWarnings && showErrors && showNotFound;
            const noSpecificFiltersChecked = !showWarnings && !showErrors && !showNotFound;
            
            // Only update "All Issues" if all specific filters are either all checked or all unchecked
            if (allSpecificFiltersChecked && !showAllIssues) {
                showAllIssuesCheckbox.checked = true;
                if (allIssuesOption) allIssuesOption.classList.add('active');
            } else if (noSpecificFiltersChecked && showAllIssues) {
                showAllIssuesCheckbox.checked = false;
                if (allIssuesOption) allIssuesOption.classList.remove('active');
            }
        }
        
        // Determine if any filter is active
        const anyFilterActive = showWarnings || showErrors || showNotFound;
        
        // Create a map to track visible parent rows
        const visibleParentRows = new Set();
        const rows = resultsBody.querySelectorAll('tr');
        
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
    
    // Toggle between folder upload and individual files upload
    function toggleUploadType(event) {
        if (event.target.value === 'folder') {
            folderInputContainer.classList.remove('hidden');
            filesInputContainer.classList.add('hidden');
            
            // Update the drag-drop area text if it exists
            if (dragDropArea) {
                dragDropArea.setAttribute('data-text', 'Drag & drop a folder here or click to browse');
            }
            
            // Reset file selectors when switching
            if (filesSelector.value) filesSelector.value = '';
            fileList.innerHTML = '';
            localFiles = [];
            
            // Reset drag-drop UI state
            if (dragDropArea) {
                dragDropArea.classList.remove('has-files');
                dragDropArea.classList.add('empty');
            }
            
            updateCompareButtonState();
        } else {
            folderInputContainer.classList.add('hidden');
            filesInputContainer.classList.remove('hidden');
            
            // Update the drag-drop area text if it exists
            if (dragDropArea) {
                dragDropArea.setAttribute('data-text', 'Drag & drop audio files here or click to browse');
            }
            
            // Reset file selectors when switching
            if (folderSelector.value) folderSelector.value = '';
            fileList.innerHTML = '';
            localFiles = [];
            
            // Reset drag-drop UI state
            if (dragDropArea) {
                dragDropArea.classList.remove('has-files');
                dragDropArea.classList.add('empty');
            }
            
            updateCompareButtonState();
        }
    }
    
    // Update compare button state based on authentication and cached data
    function updateCompareButtonState() {
        // Enable compare button if we have files and either:
        // 1. We're authenticated with Spotify, or
        // 2. We have cached data available
        const canUseCachedData = spotifyApi.hasCachedData();
        
        if (localFiles.length > 0 && (isAuthenticated || canUseCachedData)) {
            compareButton.disabled = false;
            
            // Show indicator if we're going to use cached data
            if (!isAuthenticated && canUseCachedData) {
                compareButton.textContent = "Compare with Cached Data";
                compareButton.classList.add("cache-mode");
                usingCacheOnly = true;
            } else {
                compareButton.textContent = "Compare with Spotify";
                compareButton.classList.remove("cache-mode");
                usingCacheOnly = false;
            }
        } else {
            compareButton.disabled = true;
            compareButton.textContent = "Compare with Spotify";
            compareButton.classList.remove("cache-mode");
        }
    }
});