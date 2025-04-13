// Spotify API Handler
class SpotifyAPI {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.cache = {
            searches: {},
            tracks: {}
        };
        this.loadCacheFromStorage();
    }

    // Load cache from localStorage if available
    loadCacheFromStorage() {
        try {
            const cachedSearches = localStorage.getItem('spotifySearchCache');
            const cachedTracks = localStorage.getItem('spotifyTrackCache');
            
            if (cachedSearches) {
                this.cache.searches = JSON.parse(cachedSearches);
            }
            
            if (cachedTracks) {
                this.cache.tracks = JSON.parse(cachedTracks);
            }
            
            logger.info(`Cache loaded: ${Object.keys(this.cache.searches).length} searches, ${Object.keys(this.cache.tracks).length} tracks`);
        } catch (error) {
            logger.error('Error loading cache:', error);
            // Reset cache if there was an error
            this.cache = { searches: {}, tracks: {} };
        }
    }

    // Save cache to localStorage
    saveCacheToStorage() {
        try {
            localStorage.setItem('spotifySearchCache', JSON.stringify(this.cache.searches));
            localStorage.setItem('spotifyTrackCache', JSON.stringify(this.cache.tracks));
        } catch (error) {
            console.error('Error saving cache:', error);
            // If localStorage is full, clear it and try again
            if (error.name === 'QuotaExceededError') {
                this.clearCache();
                try {
                    localStorage.setItem('spotifySearchCache', JSON.stringify(this.cache.searches));
                    localStorage.setItem('spotifyTrackCache', JSON.stringify(this.cache.tracks));
                } catch (e) {
                    console.error('Still cannot save cache after clearing:', e);
                }
            }
        }
    }

    // Clear the cache
    clearCache() {
        this.cache = { searches: {}, tracks: {} };
        localStorage.removeItem('spotifySearchCache');
        localStorage.removeItem('spotifyTrackCache');
        console.log('Cache cleared');
    }

    // Generate a cache key for searches
    generateSearchKey(track, artist = '', album = '') {
        return `${track.toLowerCase()}|${artist.toLowerCase()}|${album.toLowerCase()}`;
    }

    // Check if cache entry is still valid (based on config settings)
    isCacheValid(timestamp) {
        return timestamp && config.cache.enabled && 
               (Date.now() - timestamp) < config.cache.maxAge;
    }

    // Authenticate with Spotify API using client credentials flow
    async authenticate(clientId, clientSecret) {
        try {
            const authString = btoa(`${clientId}:${clientSecret}`);
            const response = await fetch(config.authEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${authString}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });

            if (!response.ok) {
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            this.accessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);
            return true;
        } catch (error) {
            console.error('Authentication error:', error);
            return false;
        }
    }

    // Check if the current token is valid
    isAuthenticated() {
        return this.accessToken !== null && this.tokenExpiry > Date.now();
    }
    
    // Check if we have cached data available
    hasCachedData() {
        try {
            const cachedSearches = localStorage.getItem('spotifySearchCache');
            const cachedTracks = localStorage.getItem('spotifyTrackCache');
            
            const searchCache = cachedSearches ? JSON.parse(cachedSearches) : {};
            const trackCache = cachedTracks ? JSON.parse(cachedTracks) : {};
            
            return Object.keys(searchCache).length > 0 || Object.keys(trackCache).length > 0;
        } catch (error) {
            console.error('Error checking cached data:', error);
            return false;
        }
    }

    // Search for tracks on Spotify with extended options
    async searchTrack(track, artist = '', album = '', useCacheOnly = false) {
        // Normalize input strings to handle Unicode characters properly
        const normalizedTrack = track ? track.normalize('NFC') : '';
        const normalizedArtist = artist ? artist.normalize('NFC') : '';
        const normalizedAlbum = album ? album.normalize('NFC') : '';
        
        // Generate cache key
        const cacheKey = this.generateSearchKey(normalizedTrack, normalizedArtist, normalizedAlbum);
        
        // Check cache first
        const cachedResult = this.cache.searches[cacheKey];
        if (cachedResult && this.isCacheValid(cachedResult.timestamp)) {
            logger.info(`Using cached search result for: ${normalizedTrack} - ${normalizedArtist} ${normalizedAlbum ? `(${normalizedAlbum})` : ''}`);
            return cachedResult.data;
        }
        
        // If using cache only and no valid cache, return empty array
        if (useCacheOnly) {
            logger.info(`No cached data for: ${normalizedTrack} - ${normalizedArtist} ${normalizedAlbum ? `(${normalizedAlbum})` : ''} (cache-only mode)`);
            return [];
        }

        // If not authenticated, can't proceed with API request
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated. Please authenticate first.');
        }

        try {
            // Detect CJK characters in any of the inputs
            const hasCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(
                normalizedTrack + normalizedArtist + normalizedAlbum
            );
            
            // Debug CJK content
            if (hasCJK) {
                logger.debug(`Input contains CJK characters:`, {
                    track: normalizedTrack,
                    artist: normalizedArtist,
                    album: normalizedAlbum
                });
            }
            
            // Verify album isn't corrupted (check for replacement character �)
            const hasInvalidChars = normalizedAlbum.includes('�') || 
                                    normalizedTrack.includes('�') || 
                                    normalizedArtist.includes('�');
            
            if (hasInvalidChars) {
                logger.warn(`Query contains replacement characters, which indicates encoding issues.`, 
                    { track: normalizedTrack, artist: normalizedArtist, album: normalizedAlbum });
            }
            
            // Start with basic search query
            let queryParts = [];
            
            // Add each part to the query with proper handling for CJK characters
            if (normalizedTrack) {
                queryParts.push(`track:${normalizedTrack}`);
            }
            
            if (normalizedArtist) {
                queryParts.push(`artist:${normalizedArtist}`);
            }
            
            // For albums, specially handle CJK content:
            // - For very short album names (1-2 characters), add as album qualifier
            // - For longer CJK albums, add as general search term
            if (normalizedAlbum && !normalizedAlbum.includes('�')) {
                const cleanedAlbum = normalizedAlbum.replace(/[.,;:!]+$/, '').trim();
                
                if (hasCJK && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\uff66-\uff9f]/.test(cleanedAlbum)) {
                    // For Chinese (and other CJK) albums, try using album qualifier
                    queryParts.push(`album:${cleanedAlbum}`);
                    logger.debug(`Album contains CJK characters, using album qualifier: album:${cleanedAlbum}`);
                } else {
                    // For non-CJK albums, use the standard album: prefix
                    queryParts.push(`album:${cleanedAlbum}`);
                }
            } else if (normalizedAlbum && normalizedAlbum.includes('�')) {
                logger.warn(`Skipping album in query due to encoding issues: ${normalizedAlbum}`);
            }
            
            // Join all parts with spaces
            const query = queryParts.join(' ');
            
            logger.info(`Searching Spotify with query: ${query}`);
            
            // First, try the specific query with all available information
            let response = await fetch(
                `${config.apiBaseUrl}/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status} ${response.statusText}`);
            }

            let data = await response.json();
            let tracks = data.tracks.items;
            
            // If no results or very few results with CJK characters, try a simplified query
            if (hasCJK && tracks.length < 2) {
                logger.debug(`Limited results with CJK characters. Trying simplified search.`);
                
                // For CJK content, simplify the query to just track and artist without special prefixes
                const simplifiedQuery = [normalizedTrack, normalizedArtist, normalizedAlbum]
                    .filter(part => part)
                    .join(' ');
                
                logger.debug(`Simplified CJK search query: ${simplifiedQuery}`);
                
                response = await fetch(
                    `${config.apiBaseUrl}/search?q=${encodeURIComponent(simplifiedQuery)}&type=track&limit=10`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`
                        }
                    }
                );
                
                if (response.ok) {
                    const simplifiedData = await response.json();
                    // Combine results, avoiding duplicates
                    const existingIds = new Set(tracks.map(t => t.id));
                    const newTracks = simplifiedData.tracks.items.filter(t => !existingIds.has(t.id));
                    
                    logger.debug(`Simplified search found ${newTracks.length} additional tracks`);
                    tracks = [...tracks, ...newTracks];
                }
            }
            
            // If no results and we have a track name with numbers, try without numbers
            if (tracks.length === 0 && /\d/.test(normalizedTrack)) {
                const strippedTrack = normalizedTrack.replace(/\s+\d+\s*$/, '').trim();
                
                if (strippedTrack !== normalizedTrack) {
                    logger.debug(`No results found. Trying search without trailing numbers: ${strippedTrack}`);
                    
                    // Rebuild query with stripped track name
                    const strippedQueryParts = [];
                    strippedQueryParts.push(`track:${strippedTrack}`);
                    
                    if (normalizedArtist) {
                        strippedQueryParts.push(`artist:${normalizedArtist}`);
                    }
                    
                    if (normalizedAlbum) {
                        if (hasCJK && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\uff66-\uff9f]/.test(normalizedAlbum)) {
                            strippedQueryParts.push(normalizedAlbum);
                        } else {
                            strippedQueryParts.push(`album:${normalizedAlbum}`);
                        }
                    }
                    
                    const strippedQuery = strippedQueryParts.join(' ');
                    
                    response = await fetch(
                        `${config.apiBaseUrl}/search?q=${encodeURIComponent(strippedQuery)}&type=track&limit=5`,
                        {
                            headers: {
                                'Authorization': `Bearer ${this.accessToken}`
                            }
                        }
                    );
                    
                    if (response.ok) {
                        data = await response.json();
                        tracks = [...tracks, ...data.tracks.items];
                    }
                }
            }
            
            // If still no results, try a more relaxed search (title only)
            if (tracks.length === 0 && normalizedTrack) {
                logger.debug(`No results found. Trying broader search with just track name: ${normalizedTrack}`);
                const relaxedQuery = `track:${normalizedTrack}`;
                
                response = await fetch(
                    `${config.apiBaseUrl}/search?q=${encodeURIComponent(relaxedQuery)}&type=track&limit=10`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`
                        }
                    }
                );
                
                if (response.ok) {
                    data = await response.json();
                    tracks = [...tracks, ...data.tracks.items];
                }
            }
            
            // Save to cache
            this.cache.searches[cacheKey] = {
                data: tracks,
                timestamp: Date.now()
            };
            this.saveCacheToStorage();
            
            return tracks;
        } catch (error) {
            logger.error('Search error:', error);
            return [];
        }
    }

    // Get track details by Spotify ID
    async getTrack(trackId) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated. Please authenticate first.');
        }

        // Check cache first
        const cachedTrack = this.cache.tracks[trackId];
        if (cachedTrack && this.isCacheValid(cachedTrack.timestamp)) {
            console.log(`Using cached track data for ID: ${trackId}`);
            return cachedTrack.data;
        }

        try {
            const response = await fetch(
                `${config.apiBaseUrl}/tracks/${trackId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Get track failed: ${response.status} ${response.statusText}`);
            }

            const trackData = await response.json();
            
            // Save to cache
            this.cache.tracks[trackId] = {
                data: trackData,
                timestamp: Date.now()
            };
            this.saveCacheToStorage();
            
            return trackData;
        } catch (error) {
            console.error('Get track error:', error);
            return null;
        }
    }

    // Extract track ID from Spotify URL
    extractTrackIdFromUrl(url) {
        try {
            // Handle URLs like: https://open.spotify.com/track/7cjUFCh2aWX9E9bXig3nV7?si=39440e6bd7944b80
            const trackIdMatch = url.match(/\/track\/([a-zA-Z0-9]+)/);
            return trackIdMatch ? trackIdMatch[1] : null;
        } catch (error) {
            console.error('Error extracting track ID from URL:', error);
            return null;
        }
    }

    // Get track details by Spotify URL
    async getTrackFromUrl(url, useCacheOnly = false) {
        const trackId = this.extractTrackIdFromUrl(url);
        
        if (!trackId) {
            throw new Error('Invalid Spotify track URL. Expected format: https://open.spotify.com/track/TRACKID');
        }
        
        // Check cache first
        const cachedTrack = this.cache.tracks[trackId];
        if (cachedTrack && this.isCacheValid(cachedTrack.timestamp)) {
            console.log(`Using cached track data for ID: ${trackId} (from URL)`);
            return cachedTrack.data;
        }
        
        // If using cache only and no valid cache, return null
        if (useCacheOnly) {
            console.log(`No cached data for track ID: ${trackId} (cache-only mode)`);
            return null;
        }
        
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated. Please authenticate first.');
        }
        
        try {
            const response = await fetch(
                `${config.apiBaseUrl}/tracks/${trackId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Track with ID ${trackId} not found on Spotify.`);
                }
                throw new Error(`Get track failed: ${response.status} ${response.statusText}`);
            }
            
            const trackData = await response.json();
            
            // Save to cache
            this.cache.tracks[trackId] = {
                data: trackData,
                timestamp: Date.now()
            };
            this.saveCacheToStorage();
            
            return trackData;
        } catch (error) {
            console.error('Get track from URL error:', error);
            throw error;
        }
    }

    // Find the best matching track from search results
    findBestMatch(searchResults, trackName, artistName = '', albumName = '') {
        // Add epsilon for floating point comparisons
        const EPSILON = 0.000001;
        
        if (!searchResults || searchResults.length === 0) {
            return null;
        }

        // Normalize string by removing common suffixes/prefixes and lowercasing
        const normalizeString = (str) => {
            // Handle possible undefined or null values
            if (!str) return '';
            
            // Normalize unicode characters to ensure proper comparison of non-Latin scripts
            const normalized = str.normalize('NFC').toLowerCase()
                .replace(/\(.*?\)/g, '') // Remove content in parentheses
                .replace(/\[.*?\]/g, '') // Remove content in brackets
                .replace(/feat\.?.*$/i, '') // Remove "feat." and anything after
                .replace(/\s+\d+\\s*$/, '') // Remove trailing numbers (like "Song 2")
                .trim();
                
            return normalized;
        };

        // Normalize for featured artist comparison
        const normalizeFeaturing = (str) => {
            if (!str) return { mainTitle: '', featArtist: '', hasFeat: false };
            
            // This preserves the featuring artist info in a standard format
            // Note: modified to handle unicode characters better
            const featMatch = str.normalize('NFC').toLowerCase().match(/(.*?)(?:\s*[\(\[]feat\.?\s*|\s+feat\.?\s+)(.*?)(?:[\)\]]|\s*$)/i);
            if (featMatch) {
                return {
                    mainTitle: featMatch[1].trim(),
                    featArtist: featMatch[2].trim(),
                    hasFeat: true
                };
            }
            return {
                mainTitle: str.normalize('NFC').toLowerCase().trim(),
                featArtist: '',
                hasFeat: false
            };
        };

        // Advanced string similarity function with improved CJK character handling
        const similarity = (a, b) => {
            // Handle empty strings
            if (!a || !b) return 0;
            
            // Normalize both strings for proper unicode comparison
            const strA = normalizeString(a);
            const strB = normalizeString(b);
            
            // Exact match after normalization
            if (strA === strB) return 1.0;
            
            // One string contains the other completely
            if (strA.includes(strB) || strB.includes(strA)) {
                // If they're very different in length, reduce score slightly
                const lenRatio = Math.min(strA.length, strB.length) / Math.max(strA.length, strB.length);
                return 0.9 * lenRatio;
            }
            
            // Special handling for CJK characters - character-by-character comparison
            // for languages like Chinese where spaces may not be used between words
            const hasCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\uff66-\uff9f]/.test(strA) ||
                           /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\uff66-\uff9f]/.test(strB);
                
            if (hasCJK) {
                // Count matching characters (order doesn't matter as much for CJK)
                const charsA = [...strA];
                const charsB = [...strB];
                let matchCount = 0;
                
                // Use a copy of charsB to mark characters as used
                const unusedCharsB = [...charsB];
                
                for (const char of charsA) {
                    const index = unusedCharsB.indexOf(char);
                    if (index !== -1) {
                        matchCount++;
                        // Remove the matched character to avoid double counting
                        unusedCharsB.splice(index, 1);
                    }
                }
                
                // Calculate character match ratio
                const maxPossibleMatches = Math.max(charsA.length, charsB.length);
                return matchCount / maxPossibleMatches;
            }
            
            // For non-CJK languages, proceed with word-based comparison
            // Compare individual words for partial matches
            const wordsA = strA.split(/\s+/);
            const wordsB = strB.split(/\s+/);
            
            let wordMatches = 0;
            for (const wordA of wordsA) {
                if (wordA.length < 2) continue; // Skip very short words
                for (const wordB of wordsB) {
                    if (wordB.length < 2) continue;
                    if (wordA.includes(wordB) || wordB.includes(wordA)) {
                        wordMatches++;
                        break;
                    }
                }
            }
            
            const wordSimilarity = wordMatches / Math.max(wordsA.length, wordsB.length);
            
            // Count matching characters for edit distance
            let matches = 0;
            for (let i = 0; i < Math.min(strA.length, strB.length); i++) {
                if (strA[i] === strB[i]) matches++;
            }
            const charSimilarity = matches / Math.max(strA.length, strB.length);
            
            // Combine word and character similarity
            return (wordSimilarity * 0.7) + (charSimilarity * 0.3);
        };

        // Compare titles with featured artists specifically
        const compareWithFeaturing = (localTitle, spotifyTitle) => {
            const localFeat = normalizeFeaturing(localTitle);
            const spotifyFeat = normalizeFeaturing(spotifyTitle);
            
            // If both have featuring information
            if (localFeat.hasFeat && spotifyFeat.hasFeat) {
                // Compare main titles and featured artists separately
                const titleSim = similarity(localFeat.mainTitle, spotifyFeat.mainTitle);
                const featSim = similarity(localFeat.featArtist, spotifyFeat.featArtist);
                // Weighted combination (main title is more important)
                return (titleSim * 0.8) + (featSim * 0.2);
            }
            
            // For exact matches of titles with featuring info
            if (localTitle.toLowerCase() === spotifyTitle.toLowerCase()) {
                return 1.0;
            }
            
            // Default to regular similarity
            return similarity(localTitle, spotifyTitle);
        };

        let bestMatch = null;
        let highestScore = -1; // Start with -1 instead of threshold to always get the best match

        // Original search name and normalized version
        const normalizedTrackName = normalizeString(trackName);
        // Normalize the album name if provided
        const normalizedAlbumName = albumName ? normalizeString(albumName) : '';

        // Check for numeric suffix in track name (e.g., "On & On 2")
        const hasNumericSuffix = /\s+\d+\s*$/.test(trackName);
        const trackNameWithoutNumber = hasNumericSuffix ? 
            trackName.replace(/\s+\d+\s*$/, '').trim() : trackName;

        // Prepare to track scores for debugging
        const trackScores = [];

        // Check if input contains CJK characters
        const hasCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\uff66-\uff9f]/.test(
            trackName + artistName + albumName
        );

        logger.debug(`Comparing ${searchResults.length} tracks with query: ${trackName} - ${artistName} (${albumName || 'No album'}), CJK: ${hasCJK}`);

        for (const track of searchResults) {
            // Try different name variations
            const nameVariations = [
                { name: track.name, weight: 1.0 },
                { name: normalizeString(track.name), weight: 0.9 }
            ];
            
            // Track name variations to try
            const trackNameVariations = [
                { name: trackName, weight: 1.0 },
                { name: normalizedTrackName, weight: 0.9 }
            ];
            
            // Add version without numeric suffix if present
            if (hasNumericSuffix) {
                trackNameVariations.push({ 
                    name: trackNameWithoutNumber, 
                    weight: 0.85 
                });
            }
            
            // Calculate best name similarity across all variations
            let bestNameScore = 0;
            
            // Special handling for featured artists in titles
            if (trackName.toLowerCase().includes("feat.") || track.name.toLowerCase().includes("feat.") ||
                trackName.toLowerCase().includes("ft.") || track.name.toLowerCase().includes("ft.") ||
                trackName.match(/\(.*?feat.*?\)/) || track.name.match(/\(.*?feat.*?\)/)) {
                
                const featScore = compareWithFeaturing(trackName, track.name);
                bestNameScore = Math.max(bestNameScore, featScore);
            } else {
                // Standard title comparison for tracks without featuring
                for (const trackVar of trackNameVariations) {
                    for (const spotifyVar of nameVariations) {
                        const rawScore = similarity(spotifyVar.name, trackVar.name);
                        const weightedScore = rawScore * trackVar.weight * spotifyVar.weight;
                        bestNameScore = Math.max(bestNameScore, weightedScore);
                    }
                }
            }
            
            // Calculate artist similarity if artist is provided
            let artistScore = 1.0;
            if (artistName) {
                const trackArtists = track.artists.map(a => a.name).join(' ');
                
                // Check if artist appears exactly in the list of artists
                let exactArtistMatch = false;
                for (const artist of track.artists) {
                    if (artist.name.toLowerCase() === artistName.toLowerCase()) {
                        exactArtistMatch = true;
                        break;
                    }
                }
                
                // If exactly the same, boost the score
                if (exactArtistMatch) {
                    artistScore = 1.0;
                } else {
                    artistScore = similarity(trackArtists, artistName);
                }
                
                // If track features an artist, check if this matches our expected artist
                const localFeatInfo = normalizeFeaturing(trackName);
                if (localFeatInfo.hasFeat && localFeatInfo.featArtist) {
                    for (const artist of track.artists) {
                        if (artist.name.toLowerCase().includes(localFeatInfo.featArtist.toLowerCase())) {
                            // Boost score if the featuring artist matches
                            artistScore = Math.max(artistScore, 0.9);
                            break;
                        }
                    }
                }
            }
            
            // Consider album name as a bonus factor with improved CJK handling
            let albumBonus = 0;
            if (track.album && track.album.name && normalizedAlbumName) {
                const normalizedSpotifyAlbum = normalizeString(track.album.name);
                
                // Log album comparison details for debugging
                logger.trace(`Album comparison: "${normalizedAlbumName}" vs "${normalizedSpotifyAlbum}"`);
                
                // For CJK albums, use specialized comparison
                if (hasCJK && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\uff66-\uff9f]/.test(normalizedAlbumName)) {
                    // For very short album names (common in CJK), do direct comparison
                    if (normalizedAlbumName.length <= 2) {
                        // Try exact matching first (highest score)
                        if (normalizedSpotifyAlbum === normalizedAlbumName) {
                            albumBonus = 1.0; // Perfect match gives full album score
                            logger.debug(`Exact CJK album match: "${normalizedAlbumName}" = "${normalizedSpotifyAlbum}" +1.0 (full match)`);
                        }
                        // Then try contains matching (good score)
                        else if (normalizedSpotifyAlbum.includes(normalizedAlbumName)) {
                            albumBonus = 0.7; // Good match gets higher score
                            logger.debug(`Short CJK album name "${normalizedAlbumName}" found in "${normalizedSpotifyAlbum}" +0.7`);
                        }
                        // For single character albums, try additional encodings and variations
                        else if (normalizedAlbumName.length === 1) {
                            // Compare raw album in different encodings (without normalization)
                            const rawAlbumName = albumName.trim();
                            const rawSpotifyAlbum = track.album.name.trim();
                            
                            logger.trace(`Trying raw album comparison for single character: "${rawAlbumName}" vs "${rawSpotifyAlbum}"`);
                            
                            // Try direct comparison of raw values
                            if (rawSpotifyAlbum === rawAlbumName) {
                                albumBonus = 1.0; // Perfect raw match gets full score
                                logger.debug(`Raw exact CJK album match: "${rawAlbumName}" = "${rawSpotifyAlbum}" +1.0`);
                            }
                            // ...rest of the existing code for character comparison...
                            else {
                                const albumCharCode = rawAlbumName.charCodeAt(0);
                                const spotifyChars = [...rawSpotifyAlbum];
                                
                                for (const char of spotifyChars) {
                                    const charCode = char.charCodeAt(0);
                                    // Small differences in code points might still be the same character in different encodings
                                    const codeDiff = Math.abs(charCode - albumCharCode);
                                    
                                    if (codeDiff === 0) {
                                        albumBonus = 0.25;
                                        logger.debug(`Character code exact match: ${albumCharCode} = ${charCode} +0.25`);
                                        break;
                                    } else if (codeDiff < 100) { // Allow some tolerance in code point differences
                                        const similarityScore = 1 - (codeDiff / 100);
                                        albumBonus = 0.15 * similarityScore;
                                        logger.debug(`Similar character codes: ${albumCharCode} vs ${charCode}, diff: ${codeDiff}, bonus: +${albumBonus.toFixed(2)}`);
                                        break;
                                    }
                                }
                                
                                // If no direct match, try visual similarity for CJK
                                if (albumBonus === 0) {
                                    // Check character by character
                                    const chars = [...normalizedAlbumName];
                                    let matchCount = 0;
                                    for (const char of chars) {
                                        if (normalizedSpotifyAlbum.includes(char)) {
                                            matchCount++;
                                        }
                                    }
                                    
                                    if (matchCount > 0) {
                                        const matchRatio = matchCount / chars.length;
                                        albumBonus = 0.15 * matchRatio;
                                        logger.debug(`Partial CJK album match: ${matchCount}/${chars.length} chars, bonus: +${albumBonus.toFixed(2)}`);
                                    }
                                }
                            }
                        } else {
                            // For non-single character albums, try character by character matching
                            // Check character by character for partial matches
                            const chars = [...normalizedAlbumName];
                            let matchCount = 0;
                            for (const char of chars) {
                                if (normalizedSpotifyAlbum.includes(char)) {
                                    matchCount++;
                                }
                            }
                            
                            if (matchCount > 0) {
                                const matchRatio = matchCount / chars.length;
                                albumBonus = 0.15 * matchRatio;
                                logger.debug(`Partial CJK album match: ${matchCount}/${chars.length} chars, bonus: +${albumBonus.toFixed(2)}`);
                            }
                        }
                    } else {
                        // For longer CJK album names, use similarity function
                        const albumSimilarity = similarity(normalizedSpotifyAlbum, normalizedAlbumName);
                        if (albumSimilarity > 0.5) {
                            albumBonus = 0.1 * albumSimilarity;
                            logger.debug(`Album similarity for CJK: ${albumSimilarity.toFixed(2)}, bonus: +${albumBonus.toFixed(2)}`);
                        }
                    }
                } else {
                    // Standard album bonus for non-CJK
                    if (normalizedSpotifyAlbum === normalizedAlbumName) {
                        albumBonus = 1.0; // Perfect match for non-CJK gets full score too
                        logger.debug(`Exact album match: "${normalizedAlbumName}" = "${normalizedSpotifyAlbum}" +1.0 (full match)`);
                    } else if (normalizedSpotifyAlbum.includes(normalizedAlbumName) || 
                            normalizedAlbumName.includes(normalizedSpotifyAlbum)) {
                        albumBonus = 0.5; // Partial match gets half score
                        logger.debug(`Partial album match: "${normalizedAlbumName}" in "${normalizedSpotifyAlbum}" +0.5`);
                    }
                }
            }
            
            // Adjust how album weight factors into final score
            // Album is important for exact identification, so give it proper weight
            const score = (bestNameScore * 0.55) + (artistScore * 0.25) + (albumBonus * 0.2);
            
            // Store score for debugging
            trackScores.push({
                name: track.name,
                artists: track.artists.map(a => a.name).join(', '),
                album: track.album?.name || 'Unknown',
                score: score,
                nameScore: bestNameScore,
                artistScore: artistScore,
                albumBonus: albumBonus
            });
            
            // Log the score for debugging
            logger.trace(`Match score for "${track.name}" by ${track.artists.map(a => a.name).join(', ')} [${track.album?.name || 'Unknown'}]: ${score.toFixed(2)}`);
            
            if (score > highestScore) {
                highestScore = score;
                bestMatch = track;
            }
        }

        // Print more detailed debug information
        if (trackScores.length > 0 && logger.currentLevel >= logger.levels.DEBUG) {
            logger.debug(`--- Detailed matching results for "${trackName}" ---`);
            // Sort by score (highest first)
            trackScores.sort((a, b) => b.score - a.score);
            
            // Log only top 3 matches to reduce verbosity
            trackScores.slice(0, 3).forEach((item, index) => {
                logger.debug(`${index + 1}. "${item.name}" by ${item.artists} [${item.album}]: ${item.score.toFixed(2)}`);
                logger.debug(`   Name: ${item.nameScore.toFixed(2)}, Artist: ${item.artistScore.toFixed(2)}, Album: ${item.albumBonus.toFixed(2)}`);
            });
        }

        // Only return a match if it meets our minimum threshold
        if (highestScore + EPSILON < config.songMatchThreshold) {
            logger.info(`Best match for "${trackName}" has score ${highestScore.toFixed(2)}, but below threshold ${config.songMatchThreshold}`);
            // Return null if no match meets the threshold
            return null;
        }

        logger.info(`Best match for "${trackName}" is "${bestMatch?.name}" by ${bestMatch?.artists.map(a => a.name).join(', ')} with score: ${highestScore.toFixed(2)}`);

        // Save the best match to track cache if found
        if (bestMatch && config.cache.enabled) {
            this.cache.tracks[bestMatch.id] = {
                data: bestMatch,
                timestamp: Date.now()
            };
            this.saveCacheToStorage();
        }

        return bestMatch;
    }
}

// Create a singleton instance
const spotifyApi = new SpotifyAPI()