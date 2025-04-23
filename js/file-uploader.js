// File Uploader for Song Length Checker
// Handles file selection, folder selection, and drag-drop functionality

class FileUploader {
    constructor() {
        this.localFiles = [];
    }
    
    // Getter for local files
    getLocalFiles() {
        return this.localFiles;
    }
    
    // Setter for local files
    setLocalFiles(files) {
        this.localFiles = files;
        
        // Trigger an event when files are set
        if (typeof window.triggerFilesAddedEvent === 'function') {
            window.triggerFilesAddedEvent();
        } else {
            // Fallback: create and dispatch event directly
            const event = new CustomEvent('filesAdded', { 
                detail: { fileCount: files.length }
            });
            document.dispatchEvent(event);
        }
        
        // Log the state after setting files
        logger.debug(`Files updated: count=${files.length}`);
    }
    
    // Handle file selection with enhanced functionality
    handleFileSelection(event, fileHandler, uiManager) {
        // Show the loading state on the drag-drop area if it exists
        if (uiManager.dragDropArea) {
            uiManager.dragDropArea.classList.add('processing');
        }
        
        // Process the files and show progress
        const files = fileHandler.processSelectedFiles(event.target.files);
        this.setLocalFiles(files); // Use the setter to trigger events
        
        uiManager.updateFileListUI(files, this);
        
        // Store file input id to help with identifying which input was used
        if (event.target.id) {
            localStorage.setItem('lastUsedFileInput', event.target.id);
        }
        
        // Update UI after processing files
        if (typeof uiManager.updateUIState === 'function') {
            uiManager.updateUIState();
        }

        // Remove processing state
        if (uiManager.dragDropArea) {
            uiManager.dragDropArea.classList.remove('processing');
        }
    }
    
    // Check if the File System Access API is available
    isFileSystemAccessAPIAvailable() {
        return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
    }
    
    // Use modern file picker API if available
    async useModernFilePicker(fileHandler, uiManager) {
        if (!this.isFileSystemAccessAPIAvailable()) {
            // Fallback to traditional file input
            uiManager.filesSelector.click();
            return;
        }
        
        try {
            if (uiManager.dragDropArea) uiManager.dragDropArea.classList.add('processing');
            
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
            this.localFiles = processedFiles;
            
            uiManager.updateFileListUI(processedFiles, this);
            
            // Update UI state
            if (typeof uiManager.updateUIState === 'function') {
                uiManager.updateUIState();
            }
        } catch (error) {
            console.error('Error using modern file picker:', error);
        } finally {
            // Always remove processing state
            if (uiManager.dragDropArea) uiManager.dragDropArea.classList.remove('processing');
            
            if (error && error.name !== 'AbortError') {
                alert(`Error selecting files: ${error.message}`);
            }
        }
    }
    
    // Use modern folder picker API if available
    async useModernFolderPicker(fileHandler, uiManager) {
        if (!this.isFileSystemAccessAPIAvailable()) {
            // Fallback to traditional folder input
            uiManager.folderSelector.click();
            return;
        }
        
        try {
            if (uiManager.dragDropArea) uiManager.dragDropArea.classList.add('processing');
            
            const dirHandle = await window.showDirectoryPicker();
            const files = await this.collectFilesFromDirectory(dirHandle);
            
            // Process the collected files
            const processedFiles = fileHandler.processSelectedFiles(files);
            this.localFiles = processedFiles;
            
            uiManager.updateFileListUI(processedFiles, this);
            
            // Update UI state
            if (typeof uiManager.updateUIState === 'function') {
                uiManager.updateUIState();
            }
        } catch (error) {
            console.error('Error using modern folder picker:', error);
        } finally {
            // Always remove processing state
            if (uiManager.dragDropArea) uiManager.dragDropArea.classList.remove('processing');
            
            if (error && error.name !== 'AbortError') {
                alert(`Error selecting folder: ${error.message}`);
            }
        }
    }
    
    // Recursively collect files from a directory using File System Access API
    async collectFilesFromDirectory(dirHandle, path = '') {
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
                const subDirFiles = await this.collectFilesFromDirectory(entry, entryPath);
                files.push(...subDirFiles);
            }
        }
        
        return files;
    }
    
    // Handle drag over event
    handleDragOver(event, uiManager) {
        event.preventDefault();
        event.stopPropagation();
        uiManager.dragDropArea.classList.add('active');
        uiManager.dragDropArea.classList.remove('empty');
    }
    
    // Handle drag leave event
    handleDragLeave(event, uiManager) {
        event.preventDefault();
        event.stopPropagation();
        uiManager.dragDropArea.classList.remove('active');
        if (this.localFiles.length === 0) {
            uiManager.dragDropArea.classList.add('empty');
        }
    }
    
    // Handle file drop event
    async handleFileDrop(event, fileHandler, uiManager) {
        event.preventDefault();
        event.stopPropagation();
        
        uiManager.dragDropArea.classList.remove('active');
        uiManager.dragDropArea.classList.add('processing');
        
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
                        const dirFiles = await this.traverseFileTree(entry);
                        allFiles.push(...dirFiles);
                    } else {
                        // Handle as regular file
                        const file = item.getAsFile();
                        if (file) allFiles.push(file);
                    }
                }));
                
                // Process collected files
                const processedFiles = fileHandler.processSelectedFiles(allFiles);
                this.localFiles = processedFiles;
                
                uiManager.updateFileListUI(processedFiles, this);
                
                // Update UI state
                if (typeof uiManager.updateUIState === 'function') {
                    uiManager.updateUIState();
                }
            } else {
                // Fallback to regular files
                const files = event.dataTransfer.files;
                const processedFiles = fileHandler.processSelectedFiles(files);
                this.localFiles = processedFiles;
                
                uiManager.updateFileListUI(processedFiles, this);
                
                // Update UI state
                if (typeof uiManager.updateUIState === 'function') {
                    uiManager.updateUIState();
                }
            }
        } catch (error) {
            console.error('Error handling dropped files:', error);
            alert(`Error processing dropped files: ${error.message}`);
        } finally {
            // Always remove processing state
            uiManager.dragDropArea.classList.remove('processing');
            
            // Reset UI if no files were processed
            if (this.localFiles.length === 0) {
                uiManager.dragDropArea.classList.add('empty');
            }
        }
    }
    
    // Recursively traverse directory structure from drag and drop
    async traverseFileTree(entry, path = '') {
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
            const entries = await this.readAllDirectoryEntries(dirReader);
            
            for (const childEntry of entries) {
                const childPath = path ? `${path}/${entry.name}` : entry.name;
                const childFiles = await this.traverseFileTree(childEntry, childPath);
                files.push(...childFiles);
            }
        }
        
        return files;
    }
    
    // Helper to read all entries from a directory reader
    // (needed because readEntries() might not return all entries in a single call)
    async readAllDirectoryEntries(dirReader) {
        const entries = [];
        let readEntries = await this.readEntriesPromise(dirReader);
        
        while (readEntries.length) {
            entries.push(...readEntries);
            readEntries = await this.readEntriesPromise(dirReader);
        }
        
        return entries;
    }
    
    // Promise wrapper for readEntries()
    readEntriesPromise(dirReader) {
        return new Promise((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
        });
    }
    
    // Trigger the appropriate file picker based on selected upload type
    triggerAppropriateFilePicker(fileHandler, uiManager) {
        if (uiManager.folderOption.checked) {
            if (this.isFileSystemAccessAPIAvailable()) {
                this.useModernFolderPicker(fileHandler, uiManager);
            } else {
                uiManager.folderSelector.click();
            }
        } else {
            if (this.isFileSystemAccessAPIAvailable()) {
                this.useModernFilePicker(fileHandler, uiManager);
            } else {
                uiManager.filesSelector.click();
            }
        }
    }
}

// Create a singleton instance
const fileUploader = new FileUploader();