// Spotify API Handler
class SpotifyAPI {
    // Cache storage limits (in bytes)
    static MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5MB max total cache size
    static CACHE_CLEANUP_THRESHOLD = 4.5 * 1024 * 1024; // Clean up at 4.5MB
    static MIN_REMAINING_SPACE = 500 * 1024; // Ensure at least 500KB free

    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.cache = {
            searches: {},
            tracks: {}
        };
        this.loadCacheFromStorage();
        
        // Add debugging properties
        this._lastAuthAttempt = null;
        this._authErrors = [];
        
        // Simple debounce support for cache saving
        this._saveTimeout = null;
        this._saveDelay = 500; // ms to wait before saving cache
        
        // Global string normalization cache to reduce redundant operations
        this._normalizedStringCache = new Map();

        // Check cache size on initialization
        this._enforceStorageQuota();
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

    // Save cache to localStorage with debouncing and quota management
    saveCacheToStorage() {
        if (this._saveTimeout) {
            clearTimeout(this._saveTimeout);
        }
        
        this._saveTimeout = setTimeout(async () => {
            try {
                // Check current size before saving
                this._enforceStorageQuota();
                
                localStorage.setItem('spotifySearchCache', JSON.stringify(this.cache.searches));
                localStorage.setItem('spotifyTrackCache', JSON.stringify(this.cache.tracks));
                
                // Verify size after saving
                const finalSize = this._calculateCacheSize();
                logger.info(`Cache saved successfully. Total size: ${(finalSize / 1024).toFixed(2)}KB`);
                
            } catch (error) {
                logger.error('Error saving cache:', error);
                
                // Handle QuotaExceededError with exponential reduction
                if (error.name === 'QuotaExceededError') {
                    logger.warn('Storage quota exceeded, attempting progressive cleanup...');
                    
                    // Try increasingly aggressive pruning
                    const pruneRatios = [0.3, 0.5, 0.7, 0.9];
                    
                    for (const ratio of pruneRatios) {
                        this._pruneCache(ratio);
                        try {
                            localStorage.setItem('spotifySearchCache', JSON.stringify(this.cache.searches));
                            localStorage.setItem('spotifyTrackCache', JSON.stringify(this.cache.tracks));
                            logger.info(`Cache saved after ${(ratio * 100).toFixed(0)}% reduction`);
                            return;
                        } catch (e) {
                            logger.warn(`Still cannot save after ${(ratio * 100).toFixed(0)}% reduction, trying more aggressive cleanup...`);
                            continue;
                        }
                    }
                    
                    // If all ratios failed, clear the cache as last resort
                    logger.error('Could not save cache even after aggressive pruning, clearing cache');
                    this.clearCache();
                }
            }
        }, this._saveDelay);
    }
    
    // Prune old cache entries to free up space
    _pruneCache(ratio = 0.3) {
        logger.info(`Pruning cache to free up space (ratio: ${(ratio * 100).toFixed(0)}%)`);
        
        // Get entries as arrays for faster sorting
        const searchEntries = Object.entries(this.cache.searches);
        const trackEntries = Object.entries(this.cache.tracks);
        
        // Sort by timestamp (oldest first)
        searchEntries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        trackEntries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // Calculate entries to remove based on ratio
        const searchesToRemove = Math.floor(searchEntries.length * ratio);
        const tracksToRemove = Math.floor(trackEntries.length * ratio);
        
        logger.info(`Pruning ${searchesToRemove} searches and ${tracksToRemove} tracks`);
        
        // Create new objects with remaining items
        this.cache.searches = Object.fromEntries(searchEntries.slice(searchesToRemove));
        this.cache.tracks = Object.fromEntries(trackEntries.slice(tracksToRemove));
        
        // Log cache size after pruning
        const sizeAfterPrune = this._calculateCacheSize();
        logger.info(`Cache size after pruning: ${(sizeAfterPrune / 1024).toFixed(2)}KB`);
    }

    // Clear the cache
    clearCache() {
        this.cache = { searches: {}, tracks: {} };
        localStorage.removeItem('spotifySearchCache');
        localStorage.removeItem('spotifyTrackCache');
        logger.info('Cache cleared');
    }

    // Clean old cache entries to prevent storage bloat
    cleanupCache() {
        if (!config.cache.enabled) return;
        
        const now = Date.now();
        let searchesRemoved = 0;
        let tracksRemoved = 0;
        
        // Clean up search cache
        Object.keys(this.cache.searches).forEach(key => {
            if (now - this.cache.searches[key].timestamp > config.cache.maxAge) {
                delete this.cache.searches[key];
                searchesRemoved++;
            }
        });
        
        // Clean up track cache
        Object.keys(this.cache.tracks).forEach(key => {
            if (now - this.cache.tracks[key].timestamp > config.cache.maxAge) {
                delete this.cache.tracks[key];
                tracksRemoved++;
            }
        });
        
        if (searchesRemoved > 0 || tracksRemoved > 0) {
            logger.info(`Cache cleanup: removed ${searchesRemoved} searches and ${tracksRemoved} tracks`);
            this.saveCacheToStorage();
        }
        
        return { searchesRemoved, tracksRemoved };
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

    // Utility method to fetch with retry for rate limiting
    async fetchWithRetry(url, options, retryCount = 0) {
        try {
            const response = await fetch(url, options);
            
            // If we get a rate limit response (429)
            if (response.status === 429) {
                // Check for Retry-After header (in seconds)
                const retryAfter = response.headers.get('Retry-After');
                let delayMs = config.retry.initialDelayMs;
                
                if (retryAfter) {
                    // Use the Retry-After value from Spotify
                    delayMs = parseInt(retryAfter) * 1000;
                    logger.info(`Rate limited by Spotify. Retry-After: ${retryAfter} seconds`);
                } else {
                    // Use exponential backoff if no Retry-After header
                    delayMs = Math.min(
                        config.retry.initialDelayMs * Math.pow(2, retryCount),
                        config.retry.maxDelayMs
                    );
                    logger.info(`Rate limited by Spotify. Using exponential backoff: ${delayMs}ms`);
                }
                
                // Add jitter to prevent synchronized retries
                const jitter = Math.floor(Math.random() * config.retry.jitterMs);
                delayMs += jitter;
                
                // Only retry if we haven't exceeded max retries
                if (retryCount < config.retry.maxRetries) {
                    logger.info(`Retrying after ${delayMs}ms (attempt ${retryCount + 1}/${config.retry.maxRetries})`);
                    
                    // Wait for the specified delay
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    
                    // Retry the request with incremented retry count
                    return this.fetchWithRetry(url, options, retryCount + 1);
                } else {
                    logger.error(`Maximum retry attempts (${config.retry.maxRetries}) exceeded.`);
                    return response; // Return the rate limited response after max retries
                }
            }
            
            return response;
        } catch (error) {
            // For network errors, also implement retry logic
            if (error.name === 'TypeError' && retryCount < config.retry.maxRetries) {
                const delayMs = Math.min(
                    config.retry.initialDelayMs * Math.pow(2, retryCount),
                    config.retry.maxDelayMs
                ) + Math.floor(Math.random() * config.retry.jitterMs);
                
                logger.warn(`Network error: ${error.message}. Retrying after ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                return this.fetchWithRetry(url, options, retryCount + 1);
            }
            
            throw error; // Re-throw other errors or if max retries exceeded
        }
    }

    // Authenticate with Spotify API using client credentials flow
    async authenticate(clientId, clientSecret) {
        try {
            const authString = btoa(`${clientId}:${clientSecret}`);
            const response = await this.fetchWithRetry(config.authEndpoint, {
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
            logger.error('Authentication error:', error);
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
            logger.error('Error checking cached data:', error);
            return false;
        }
    }

    // Search for tracks on Spotify with extended options (simplified version)
    async searchTrack(track, artist = '', album = '', useCacheOnly = false) {
        // Normalize input strings - filter out invalid characters
        const getNormalizedString = (str) => {
            if (!str) return '';
            const cacheKey = `norm:${str}`;
            if (this._normalizedStringCache.has(cacheKey)) {
                return this._normalizedStringCache.get(cacheKey);
            }
            // Remove replacement characters and normalize
            const normalized = str.normalize('NFC').replace(/�/g, '');
            this._normalizedStringCache.set(cacheKey, normalized);
            return normalized;
        };
        
        let normalizedTrack = getNormalizedString(track);
        let normalizedArtist = getNormalizedString(artist);
        let normalizedAlbum = getNormalizedString(album);
        
        const cacheKey = this.generateSearchKey(normalizedTrack, normalizedArtist, normalizedAlbum);
        
        // Check cache first
        const cachedResult = this.cache.searches[cacheKey];
        if (cachedResult && this.isCacheValid(cachedResult.timestamp)) {
            logger.info(`Using cached search result for: ${normalizedTrack} - ${normalizedArtist} ${normalizedAlbum ? `(${normalizedAlbum})` : ''}`);
            return cachedResult.data;
        }
        
        if (useCacheOnly) {
            logger.info(`No cached data for: ${normalizedTrack} - ${normalizedArtist} ${normalizedAlbum ? `(${normalizedAlbum})` : ''} (cache-only mode)`);
            return [];
        }

        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated. Please authenticate first.');
        }

        try {
            let allTracks = [];
            let response;
            let data;

            // --- Strategy 1: Primary Search (Most Specific) ---
            let queryParts = [];
            if (normalizedTrack) queryParts.push(`track:${normalizedTrack}`);
            if (normalizedArtist) queryParts.push(`artist:${normalizedArtist}`);
            // Clean album name before adding to query
            if (normalizedAlbum) {
                 const cleanedAlbum = normalizedAlbum.replace(/[.,;:!]+$/, '').trim();
                 // Only add album if it's not empty after cleaning
                 if (cleanedAlbum) {
                    queryParts.push(`album:${cleanedAlbum}`);
                 }
            }
            
            const primaryQuery = queryParts.join(' ');
            logger.info(`Searching Spotify with primary query: ${primaryQuery}`);
            
            response = await this.fetchWithRetry(
                `${config.apiBaseUrl}/search?q=${encodeURIComponent(primaryQuery)}&type=track&limit=5`,
                { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
            );

            if (response.ok) {
                data = await response.json();
                allTracks = data.tracks.items || [];
                logger.debug(`Primary search returned ${allTracks.length} tracks.`);
            } else {
                 logger.warn(`Primary search failed: ${response.status} ${response.statusText}`);
                 // Continue to next strategy even if the request failed, but log it
            }

            // --- Return early if primary search successful ---
            if (allTracks.length > 0) {
                logger.info(`Found ${allTracks.length} tracks with primary query. Returning early.`);
                this.cache.searches[cacheKey] = { data: allTracks, timestamp: Date.now() };
                this.saveCacheToStorage();
                return allTracks;
            }

            // --- Strategy 2: Simplified Search for CJK ---
            const hasCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\uff66-\uff9f]/.test(
                normalizedTrack + normalizedArtist + normalizedAlbum
            );
            
            if (hasCJK) {
                const simplifiedQuery = [normalizedTrack, normalizedArtist, normalizedAlbum]
                    .filter(part => part) // Filter out empty parts
                    .join(' ');
                
                logger.debug(`Primary search failed or yielded no results. Trying simplified CJK search: ${simplifiedQuery}`);
                
                response = await this.fetchWithRetry(
                    `${config.apiBaseUrl}/search?q=${encodeURIComponent(simplifiedQuery)}&type=track&limit=10`,
                    { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
                );
                
                if (response.ok) {
                    data = await response.json();
                    allTracks = data.tracks.items || [];
                    logger.debug(`Simplified CJK search returned ${allTracks.length} tracks.`);
                } else {
                     logger.warn(`Simplified CJK search failed: ${response.status} ${response.statusText}`);
                }

                // Return early if simplified CJK search successful
                if (allTracks.length > 0) {
                    logger.info(`Found ${allTracks.length} tracks with simplified CJK query. Returning early.`);
                    this.cache.searches[cacheKey] = { data: allTracks, timestamp: Date.now() };
                    this.saveCacheToStorage();
                    return allTracks;
                }
            }

            // --- Strategy 5: Simple Artist + Track Name Search ---
            // Only run if all previous strategies yielded no results and we have both artist and track
            if (allTracks.length === 0 && normalizedArtist && normalizedTrack) {
                const simpleQuery = `${normalizedArtist} ${normalizedTrack}`;
                logger.debug(`All previous searches failed. Trying simple combined search: ${simpleQuery}`);

                response = await this.fetchWithRetry(
                    `${config.apiBaseUrl}/search?q=${encodeURIComponent(simpleQuery)}&type=track&limit=2`,
                    { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
                );

                if (response.ok) {
                    data = await response.json();
                    allTracks = data.tracks.items || [];
                    logger.debug(`Simple combined search returned ${allTracks.length} tracks.`);
                } else {
                     logger.warn(`Simple combined search failed: ${response.status} ${response.statusText}`);
                }
            }
            
            // --- Final Caching and Return ---
            logger.info(`Search process completed. Final track count: ${allTracks.length}`);
            this.cache.searches[cacheKey] = {
                data: allTracks, // Cache the final result, even if empty
                timestamp: Date.now()
            };
            this.saveCacheToStorage();
            
            return allTracks;
        } catch (error) {
            // Log the error and return empty array to prevent breaking the flow
            logger.error('Unexpected error during searchTrack:', error);
            // Cache the error state? Maybe not, allow retry later.
            return []; 
        }
    }

    // Private helper method to fetch track by ID (simplified, no batching)
    async _fetchTrackById(trackId, useCacheOnly = false) {
        // Check cache first
        const cachedTrack = this.cache.tracks[trackId];
        if (cachedTrack && this.isCacheValid(cachedTrack.timestamp)) {
            logger.info(`Using cached track data for ID: ${trackId}`);
            return cachedTrack.data;
        }
        
        // If using cache only and no valid cache, return null
        if (useCacheOnly) {
            logger.info(`No cached data for track ID: ${trackId} (cache-only mode)`);
            return null;
        }
        
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated. Please authenticate first.');
        }
        
        try {
            const response = await this.fetchWithRetry(
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
            logger.error('Get track error:', error);
            throw error;
        }
    }

    // Get track details by Spotify ID
    async getTrack(trackId) {
        try {
            return await this._fetchTrackById(trackId);
        } catch (error) {
            logger.error('Get track error:', error);
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
            logger.error('Error extracting track ID from URL:', error);
            return null;
        }
    }

    // Get track details by Spotify URL
    async getTrackFromUrl(url, useCacheOnly = false) {
        const trackId = this.extractTrackIdFromUrl(url);
        
        if (!trackId) {
            throw new Error('Invalid Spotify track URL. Expected format: https://open.spotify.com/track/TRACKID');
        }
        
        try {
            return await this._fetchTrackById(trackId, useCacheOnly);
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

        // Create memoized version of normalizeString to avoid redundant calculations
        const normalizeStringMemo = (() => {
            const cache = new Map();
            return (str) => {
                if (!str) return '';
                if (cache.has(str)) return cache.get(str);
                
                // Normalize unicode characters to ensure proper comparison of non-Latin scripts
                const normalized = str.normalize('NFC').toLowerCase()
                    .replace(/\(.*?\)/g, '') // Remove content in parentheses
                    .replace(/\[.*?\]/g, '') // Remove content in brackets
                    .replace(/feat\.?.*$/i, '') // Remove "feat." and anything after
                    .replace(/\s+\d+\\s*$/, '') // Remove trailing numbers (like "Song 2")
                    .trim();
                    
                cache.set(str, normalized);
                return normalized;
            };
        })();

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

        // Create memoized version of similarity function
        const similarityMemo = (() => {
            const cache = new Map();
            
            return (a, b) => {
                if (!a || !b) return 0;
                
                // Create cache key (ensure order doesn't matter)
                const cacheKey = a < b ? `${a}:${b}` : `${b}:${a}`;
                
                if (cache.has(cacheKey)) {
                    return cache.get(cacheKey);
                }
                
                // Advanced string similarity function with improved CJK character handling
                const similarity = (a, b) => {
                    // Handle empty strings
                    if (!a || !b) return 0;
                    
                    // Normalize both strings for proper unicode comparison
                    const strA = normalizeStringMemo(a);
                    const strB = normalizeStringMemo(b);
                    
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

                // Cache the result before returning
                const result = similarity(a, b);
                cache.set(cacheKey, result);
                return result;
            };
        })();

        // Compare titles with featured artists specifically
        const compareWithFeaturing = (localTitle, spotifyTitle) => {
            const localFeat = normalizeFeaturing(localTitle);
            const spotifyFeat = normalizeFeaturing(spotifyTitle);
            
            // If both have featuring information
            if (localFeat.hasFeat && spotifyFeat.hasFeat) {
                // Compare main titles and featured artists separately
                const titleSim = similarityMemo(localFeat.mainTitle, spotifyFeat.mainTitle);
                const featSim = similarityMemo(localFeat.featArtist, spotifyFeat.featArtist);
                // Weighted combination (main title is more important)
                return (titleSim * 0.8) + (featSim * 0.2);
            }
            
            // For exact matches of titles with featuring info
            if (localTitle.toLowerCase() === spotifyTitle.toLowerCase()) {
                return 1.0;
            }
            
            // Default to regular similarity
            return similarityMemo(localTitle, spotifyTitle);
        };

        let bestMatch = null;
        let highestScore = -1; // Start with -1 instead of threshold to always get the best match

        // Original search name and normalized version
        const normalizedTrackName = normalizeStringMemo(trackName);
        // Normalize the album name if provided
        const normalizedAlbumName = albumName ? normalizeStringMemo(albumName) : '';

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
                { name: normalizeStringMemo(track.name), weight: 0.9 }
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
                        const rawScore = similarityMemo(spotifyVar.name, trackVar.name);
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
                    artistScore = similarityMemo(trackArtists, artistName);
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
                const normalizedSpotifyAlbum = normalizeStringMemo(track.album.name);
                
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
                            } else {
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
                        const albumSimilarity = similarityMemo(normalizedSpotifyAlbum, normalizedAlbumName);
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

    // Calculate the current size of cache data in localStorage
    _calculateCacheSize() {
        try {
            // Get the size of both caches
            const searchCacheSize = new Blob([localStorage.getItem('spotifySearchCache') || '']).size;
            const trackCacheSize = new Blob([localStorage.getItem('spotifyTrackCache') || '']).size;
            return searchCacheSize + trackCacheSize;
        } catch (error) {
            logger.error('Error calculating cache size:', error);
            return 0;
        }
    }

    // Check and enforce storage quota limits
    _enforceStorageQuota() {
        const currentSize = this._calculateCacheSize();

        // Log current cache size for monitoring
        logger.info(`Current cache size: ${(currentSize / 1024).toFixed(2)}KB`);

        // If we're approaching the limit, trigger cleanup
        if (currentSize >= SpotifyAPI.CACHE_CLEANUP_THRESHOLD) {
            logger.info('Cache size exceeds cleanup threshold, initiating cleanup...');
            this._pruneCache();
            
            // After pruning, check if we need more aggressive cleanup
            const sizeAfterPrune = this._calculateCacheSize();
            if (sizeAfterPrune > SpotifyAPI.MAX_CACHE_SIZE - SpotifyAPI.MIN_REMAINING_SPACE) {
                logger.warn('Cache still too large after pruning, performing emergency cleanup...');
                // Remove more aggressively - 50% of entries
                this._pruneCache(0.5);
            }
        }
    }
}

// Create a singleton instance
const spotifyApi = new SpotifyAPI();