// File Handler for local music files
class FileHandler {
    constructor() {
        this.files = [];
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.uiManager = null;
    }

    setUIManager(uiManager) {
        this.uiManager = uiManager;
    }

    // Process selected files from the input element
    processSelectedFiles(fileList) {
        this.files = [];
        const supportedExtensions = config.supportedAudioFormats;
        
        // Filter for supported audio files
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const extension = '.' + file.name.split('.').pop().toLowerCase();
            
            if (supportedExtensions.includes(extension)) {
                this.files.push(file);
            }
        }
        
        return this.files;
    }

    // Extract track info from filename
    extractTrackInfo(filename) {
        // Remove file extension
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
        
        // Normalize unicode characters for better handling of non-Latin scripts
        const normalizedName = nameWithoutExt.normalize('NFC');
        
        // Try to extract artist and title from common patterns
        // Pattern: Artist - Title
        let match = normalizedName.match(/(.+?)\s*-\s*(.+)/);
        if (match) {
            return {
                artist: match[1].trim(),
                title: match[2].trim()
            };
        }
        
        // Pattern: Title (feat. Artist)
        match = normalizedName.match(/(.+?)\s*[\(\[]feat\.?\s*(.+?)[\)\]]/i);
        if (match) {
            return {
                title: match[1].trim(),
                artist: match[2].trim()
            };
        }
        
        // If no pattern matched, return whole filename as title
        return {
            title: normalizedName.trim(),
            artist: ''
        };
    }

    // Get audio duration from file
    async getAudioDuration(file) {
        return new Promise((resolve, reject) => {
            // For MP3, M4A, etc. we use the audio element
            const audioElement = new Audio();
            const objectUrl = URL.createObjectURL(file);
            
            audioElement.addEventListener('loadedmetadata', () => {
                // Convert to milliseconds for consistent comparison with Spotify
                const durationMs = Math.round(audioElement.duration * 1000);
                URL.revokeObjectURL(objectUrl);
                resolve(durationMs);
            });
            
            audioElement.addEventListener('error', (err) => {
                URL.revokeObjectURL(objectUrl);
                
                // Fallback to AudioContext for formats that Audio element can't handle
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const arrayBuffer = e.target.result;
                        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        const durationMs = Math.round(audioBuffer.duration * 1000);
                        resolve(durationMs);
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.onerror = error => reject(error);
                reader.readAsArrayBuffer(file);
            });
            
            audioElement.src = objectUrl;
        });
    }

    // Round milliseconds to nearest second to avoid tiny differences
    roundToNearestSecond(ms) {
        return Math.round(ms / 1000) * 1000;
    }

    // Format milliseconds as mm:ss with rounding
    formatDuration(ms) {
        const roundedMs = this.roundToNearestSecond(ms);
        const totalSeconds = Math.floor(roundedMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Process all files to get their durations
    async processFilesWithDuration() {
        const fileData = [];
        let processedCount = 0;
        
        // Initialize progress tracking at the start of actual processing
        if (this.uiManager) {
            this.uiManager.initializeProgress(this.files.length);
        }
        
        for (const file of this.files) {
            try {
                const duration = await this.getAudioDuration(file);
                const roundedDuration = this.roundToNearestSecond(duration); // Round duration
                const trackInfo = this.extractTrackInfo(file.name);
                
                // Attempt to get album info from optional metadata tag
                let album = '';
                try {
                    // Only try to read tags if it's an MP3 file
                    if (file.name.toLowerCase().endsWith('.mp3')) {
                        logger.debug(`Reading tags from ${file.name}`);
                        const arrayBuffer = await file.arrayBuffer();
                        const result = await this.readID3Tags(arrayBuffer);
                        if (result) {
                            logger.debug(`Tags extracted from ${file.name}:`, result);
                            if (result.album) {
                                album = result.album;
                                logger.debug(`Album tag found: "${album}"`);
                                
                                // Additional check for problematic album names
                                if (album.includes('�')) {
                                    logger.warn(`Album name "${album}" contains replacement characters, cleaning...`);
                                    album = album.replace(/�/g, '');
                                    logger.debug(`Cleaned album name: "${album}"`);
                                }
                            } else {
                                logger.debug(`No album tag found in ${file.name}`);
                            }
                            
                            // Override filename-based info if ID3 tags are available
                            if (result.title) {
                                trackInfo.title = result.title;
                                logger.debug(`Using ID3 title: "${trackInfo.title}"`);
                            }
                            if (result.artist) {
                                trackInfo.artist = result.artist;
                                logger.debug(`Using ID3 artist: "${trackInfo.artist}"`);
                            }
                        } else {
                            logger.debug(`No tags found in ${file.name}`);
                        }
                    }
                } catch (tagError) {
                    logger.warn(`Couldn't read ID3 tags from ${file.name}:`, tagError);
                }
                
                fileData.push({
                    file: file,
                    fileName: file.name,
                    title: trackInfo.title,
                    artist: trackInfo.artist,
                    album: album,
                    durationMs: roundedDuration, // Use rounded duration
                    formattedDuration: this.formatDuration(duration)
                });
                
                // Update progress
                processedCount++;
                if (this.uiManager) {
                    this.uiManager.updateProgress(processedCount);
                }
                
                logger.info(`Processed ${file.name}:`, {
                    title: trackInfo.title,
                    artist: trackInfo.artist,
                    album: album,
                    duration: this.formatDuration(duration)
                });
            } catch (error) {
                logger.error(`Error processing file ${file.name}:`, error);
                // Still increment progress even if there's an error
                processedCount++;
                if (this.uiManager) {
                    this.uiManager.updateProgress(processedCount);
                }
            }
        }
        
        return fileData;
    }
    
    // Helper function to sanitize text from ID3 tags
    sanitizeTagText(text) {
        if (!text) return '';
        
        // Remove null characters and trim
        text = text.replace(/\0/g, '').trim();
        
        // Normalize Unicode (NFC form)
        text = text.normalize('NFC');
        
        // Replace any remaining replacement characters (�) with empty string
        text = text.replace(/�/g, '');
        
        return text;
    }

    // Basic ID3 tag reader for MP3 files with improved character encoding support
    async readID3Tags(arrayBuffer) {
        try {
            const bytes = new Uint8Array(arrayBuffer);
            logger.trace("Reading ID3 tags from file with size:", bytes.length);
            
            // Check for ID3v2 header
            if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) { // "ID3"
                logger.debug("ID3v2 tag found");
                const tags = {};
                
                // Get the ID3v2 version
                const majorVersion = bytes[3];
                const minorVersion = bytes[4];
                logger.trace(`ID3v2 version: ${majorVersion}.${minorVersion}`);
                
                // Very simple ID3v2 parsing - this is not complete but works for basic tags
                let offset = 10; // Skip the header
                
                while (offset < bytes.length - 10) {
                    // Frame ID (4 characters)
                    const frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
                    
                    // Check if we've reached padding or invalid data
                    if (frameId === '\0\0\0\0' || frameId[0] === '\0') {
                        logger.debug("Reached padding or end of tags");
                        break;
                    }
                    
                    // Handle corrupted tags or invalid frame ids
                    if (!frameId.match(/[A-Z0-9]{4}/)) {
                        logger.warn(`Invalid frame ID encountered: "${frameId.replace(/[^\x20-\x7E]/g, '?')}" at offset ${offset}`);
                        // Skip ahead one byte and try again
                        offset += 1;
                        continue;
                    }
                    
                    // Frame size (4 bytes) - handle based on version
                    let frameSize;
                    try {
                        if (majorVersion < 4) {
                            // ID3v2.2 and ID3v2.3 use big-endian
                            frameSize = (bytes[offset+4] << 24) | (bytes[offset+5] << 16) | (bytes[offset+6] << 8) | bytes[offset+7];
                        } else {
                            // ID3v2.4 uses synchsafe integers
                            frameSize = (bytes[offset+4] & 0x7f) << 21 | 
                                       (bytes[offset+5] & 0x7f) << 14 | 
                                       (bytes[offset+6] & 0x7f) << 7 | 
                                       (bytes[offset+7] & 0x7f);
                        }
                    } catch (e) {
                        logger.warn(`Error reading frame size for ${frameId}: ${e.message}`);
                        offset += 10;  // Skip this frame header and continue
                        continue;
                    }
                    
                    // Validate frame size to prevent corrupted data processing
                    if (frameSize <= 0 || frameSize > bytes.length - offset - 10) {
                        logger.warn(`Invalid frame size for ${frameId}: ${frameSize}`);
                        // Skip this frame and continue
                        offset += 10;
                        continue;
                    }
                    
                    logger.trace(`Found frame: ${frameId}, size: ${frameSize}`);
                    
                    // Skip flags (2 bytes)
                    offset += 10;
                    
                    // Process known frame types
                    if (frameId === 'TALB' || frameId === 'TAL') { // Album title
                        // Get encoding byte to determine text encoding
                        try {
                            const encodingByte = bytes[offset];
                            let textData = null;
                            let usedEncoding = "unknown";
                            
                            // Handle different text encodings based on the encoding byte
                            if (encodingByte === 0) {
                                // ISO-8859-1
                                usedEncoding = "iso-8859-1";
                                textData = new TextDecoder('iso-8859-1').decode(bytes.slice(offset + 1, offset + frameSize));
                            } else if (encodingByte === 1 || encodingByte === 2) {
                                // UTF-16 (with or without BOM)
                                usedEncoding = "utf-16";
                                textData = new TextDecoder('utf-16').decode(bytes.slice(offset + 1, offset + frameSize));
                            } else if (encodingByte === 3) {
                                // UTF-8
                                usedEncoding = "utf-8";
                                textData = new TextDecoder('utf-8').decode(bytes.slice(offset + 1, offset + frameSize));
                            } else {
                                // Default to UTF-8 if unknown
                                usedEncoding = "utf-8 (default)";
                                textData = new TextDecoder('utf-8').decode(bytes.slice(offset + 1, offset + frameSize));
                            }
                            
                            logger.trace(`Raw album text (${usedEncoding}):`, textData);
                            
                            // Check for replacement characters which indicate encoding issues
                            if (textData.includes('�')) {
                                logger.warn("Encoding issues detected in album tag, trying alternative encodings");
                                throw new Error("Encoding issues detected");
                            }
                            
                            // Clean and sanitize
                            textData = this.sanitizeTagText(textData);
                            tags.album = textData;
                            logger.debug(`Final album tag: "${textData}"`);
                        } catch (decodeError) {
                            logger.warn(`Error decoding album tag: ${decodeError}`);
                            // Try multiple encodings one by one
                            const encodings = [
                                'utf-8', 
                                'iso-8859-1', 
                                'windows-1252',
                                'utf-16le',
                                'utf-16be'
                            ];
                            
                            for (const encoding of encodings) {
                                try {
                                    logger.trace(`Trying alternative encoding: ${encoding}`);
                                    textData = new TextDecoder(encoding).decode(bytes.slice(offset + 1, offset + frameSize));
                                    logger.trace(`Result with ${encoding}:`, textData);
                                    
                                    if (textData && !textData.includes('�')) {
                                        textData = this.sanitizeTagText(textData);
                                        tags.album = textData;
                                        logger.debug(`Successfully decoded album with ${encoding}: "${textData}"`);
                                        break;
                                    }
                                } catch (e) {
                                    logger.warn(`Failed with ${encoding}:`, e);
                                }
                            }
                            
                            // If still no valid text, try a last resort approach
                            if (!tags.album || tags.album.includes('�')) {
                                // Extract ASCII characters only as a last resort
                                logger.trace("Using last resort: ASCII extraction");
                                let asciiText = '';
                                for (let i = offset + 1; i < offset + frameSize; i++) {
                                    const byte = bytes[i];
                                    // Only include printable ASCII
                                    if (byte >= 32 && byte <= 126) {
                                        asciiText += String.fromCharCode(byte);
                                    }
                                }
                                if (asciiText.length > 0) {
                                    tags.album = this.sanitizeTagText(asciiText);
                                    logger.debug(`ASCII extraction result: "${tags.album}"`);
                                }
                            }
                        }
                    } else if (frameId === 'TIT2' || frameId === 'TT2') { // Song title
                        // Get encoding byte
                        const encodingByte = bytes[offset];
                        let textData;
                        
                        try {
                            logger.trace(`Decoding title tag with encoding byte: ${encodingByte}`);
                            // FIX: Use the full frame size instead of frameSize - 1
                            if (encodingByte === 0) {
                                textData = new TextDecoder('iso-8859-1').decode(bytes.slice(offset + 1, offset + frameSize));
                            } else if (encodingByte === 1 || encodingByte === 2) {
                                textData = new TextDecoder('utf-16').decode(bytes.slice(offset + 1, offset + frameSize));
                            } else if (encodingByte === 3) {
                                textData = new TextDecoder('utf-8').decode(bytes.slice(offset + 1, offset + frameSize));
                            } else {
                                textData = new TextDecoder('utf-8').decode(bytes.slice(offset + 1, offset + frameSize));
                            }
                            
                            // Log raw text
                            logger.trace(`Raw title text (encoding ${encodingByte}):`, textData);
                            
                            // Clean and sanitize
                            textData = this.sanitizeTagText(textData);
                            tags.title = textData;
                            logger.debug(`Final title tag: "${textData}"`);
                        } catch (decodeError) {
                            logger.warn(`Error decoding title tag: ${decodeError}`);
                            const encodings = [
                                'utf-8', 
                                'iso-8859-1', 
                                'windows-1252',
                                'utf-16le',
                                'utf-16be'
                            ];
                            
                            for (const encoding of encodings) {
                                try {
                                    logger.trace(`Trying alternative encoding: ${encoding}`);
                                    textData = new TextDecoder(encoding).decode(bytes.slice(offset + 1, offset + frameSize));
                                    logger.trace(`Result with ${encoding}:`, textData);
                                    
                                    if (textData && !textData.includes('�')) {
                                        textData = this.sanitizeTagText(textData);
                                        tags.title = textData;
                                        logger.debug(`Successfully decoded title with ${encoding}: "${textData}"`);
                                        break;
                                    }
                                } catch (e) {
                                    logger.warn(`Failed with ${encoding}:`, e);
                                }
                            }
                            
                            // If still no valid text, try a last resort approach
                            if (!tags.title || tags.title.includes('�')) {
                                // Extract ASCII characters only as a last resort
                                logger.trace("Using last resort: ASCII extraction");
                                let asciiText = '';
                                for (let i = offset + 1; i < offset + frameSize; i++) {
                                    const byte = bytes[i];
                                    // Only include printable ASCII
                                    if (byte >= 32 && byte <= 126) {
                                        asciiText += String.fromCharCode(byte);
                                    }
                                }
                                if (asciiText.length > 0) {
                                    tags.title = this.sanitizeTagText(asciiText);
                                    logger.debug(`ASCII extraction result: "${tags.title}"`);
                                }
                            }
                        }
                    } else if (frameId === 'TPE1' || frameId === 'TP1') { // Artist
                        // Get encoding byte
                        const encodingByte = bytes[offset];
                        let textData;
                        
                        try {
                            logger.trace(`Decoding artist tag with encoding byte: ${encodingByte}`);
                            // FIX: Use the full frame size instead of frameSize - 1
                            if (encodingByte === 0) {
                                textData = new TextDecoder('iso-8859-1').decode(bytes.slice(offset + 1, offset + frameSize));
                            } else if (encodingByte === 1 || encodingByte === 2) {
                                textData = new TextDecoder('utf-16').decode(bytes.slice(offset + 1, offset + frameSize));
                            } else if (encodingByte === 3) {
                                textData = new TextDecoder('utf-8').decode(bytes.slice(offset + 1, offset + frameSize));
                            } else {
                                textData = new TextDecoder('utf-8').decode(bytes.slice(offset + 1, offset + frameSize));
                            }
                            
                            // Log raw text
                            logger.trace(`Raw artist text (encoding ${encodingByte}):`, textData);
                            
                            // Clean and sanitize
                            textData = this.sanitizeTagText(textData);
                            tags.artist = textData;
                            logger.debug(`Final artist tag: "${textData}"`);
                        } catch (decodeError) {
                            logger.warn(`Error decoding artist tag: ${decodeError}`);
                            const encodings = [
                                'utf-8', 
                                'iso-8859-1', 
                                'windows-1252',
                                'utf-16le',
                                'utf-16be'
                            ];
                            
                            for (const encoding of encodings) {
                                try {
                                    logger.trace(`Trying alternative encoding: ${encoding}`);
                                    textData = new TextDecoder(encoding).decode(bytes.slice(offset + 1, offset + frameSize));
                                    logger.trace(`Result with ${encoding}:`, textData);
                                    
                                    if (textData && !textData.includes('�')) {
                                        textData = this.sanitizeTagText(textData);
                                        tags.artist = textData;
                                        logger.debug(`Successfully decoded artist with ${encoding}: "${textData}"`);
                                        break;
                                    }
                                } catch (e) {
                                    logger.warn(`Failed with ${encoding}:`, e);
                                }
                            }
                            
                            // If still no valid text, try a last resort approach
                            if (!tags.artist || tags.artist.includes('�')) {
                                // Extract ASCII characters only as a last resort
                                logger.trace("Using last resort: ASCII extraction");
                                let asciiText = '';
                                for (let i = offset + 1; i < offset + frameSize; i++) {
                                    const byte = bytes[i];
                                    // Only include printable ASCII
                                    if (byte >= 32 && byte <= 126) {
                                        asciiText += String.fromCharCode(byte);
                                    }
                                }
                                if (asciiText.length > 0) {
                                    tags.artist = this.sanitizeTagText(asciiText);
                                    logger.debug(`ASCII extraction result: "${tags.artist}"`);
                                }
                            }
                        }
                    }
                    
                    // Move to next frame
                    offset += frameSize;
                    
                    // Safety check: ensure we don't get stuck in an infinite loop
                    if (frameSize === 0) {
                        logger.warn("Zero-size frame detected, breaking out of tag parsing");
                        break;
                    }
                }
                
                return tags;
            } else {
                logger.debug("No ID3v2 tag found, checking for ID3v1");
            }
            
            // If no ID3v2 tag, check for ID3v1 at the end of the file
            if (bytes.length > 128) {
                const offset = bytes.length - 128;
                if (bytes[offset] === 84 && bytes[offset+1] === 65 && bytes[offset+2] === 71) { // "TAG"
                    logger.debug("ID3v1 tag found");
                    const tags = {};
                    
                    try {
                        // ID3v1 uses ISO-8859-1 encoding
                        // Title (30 bytes)
                        let title = new TextDecoder('iso-8859-1').decode(bytes.slice(offset + 3, offset + 33));
                        title = this.sanitizeTagText(title);
                        tags.title = title;
                        logger.debug(`ID3v1 title: "${title}"`);
                        
                        // Artist (30 bytes)
                        let artist = new TextDecoder('iso-8859-1').decode(bytes.slice(offset + 33, offset + 63));
                        artist = this.sanitizeTagText(artist);
                        tags.artist = artist;
                        logger.debug(`ID3v1 artist: "${artist}"`);
                        
                        // Album (30 bytes)
                        let album = new TextDecoder('iso-8859-1').decode(bytes.slice(offset + 63, offset + 93));
                        album = this.sanitizeTagText(album);
                        tags.album = album;
                        logger.debug(`ID3v1 album: "${album}"`);
                    } catch (decodeError) {
                        logger.warn('Error decoding ID3v1 tags:', decodeError);
                        // Try with windows-1252 as a fallback
                        try {
                            logger.trace("Trying windows-1252 for ID3v1");
                            // Similar fallback code as before
                            let title = new TextDecoder('windows-1252').decode(bytes.slice(offset + 3, offset + 33));
                            title = this.sanitizeTagText(title);
                            tags.title = title;
                            logger.debug(`ID3v1 title (windows-1252): "${title}"`);
                            
                            let artist = new TextDecoder('windows-1252').decode(bytes.slice(offset + 33, offset + 63));
                            artist = this.sanitizeTagText(artist);
                            tags.artist = artist;
                            logger.debug(`ID3v1 artist (windows-1252): "${artist}"`);
                            
                            let album = new TextDecoder('windows-1252').decode(bytes.slice(offset + 63, offset + 93));
                            album = this.sanitizeTagText(album);
                            tags.album = album;
                            logger.debug(`ID3v1 album (windows-1252): "${album}"`);
                        } catch (fallbackError) {
                            logger.error('Fallback encoding failed for ID3v1 tags:', fallbackError);
                        }
                    }
                    
                    return tags;
                } else {
                    logger.debug("No ID3v1 tag found");
                }
            }
            
            logger.debug("No ID3 tags found in file");
            return null;
        } catch (error) {
            logger.error('Error reading ID3 tags:', error);
            return null;
        }
    }
}

// Create a singleton instance
const fileHandler = new FileHandler();