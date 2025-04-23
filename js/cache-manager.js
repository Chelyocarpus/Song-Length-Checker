// Cache Manager for Song Length Checker
// Handles cache initialization, status updates and management

class CacheManager {
    constructor() {
        // Initialize cache settings
        this.cacheEnabled = config.cache.enabled;
    }
    
    // Initialize cache UI and settings
    initCacheUI(uiManager) {
        // Set toggle based on config setting
        uiManager.cacheEnabledToggle.checked = config.cache.enabled;
        
        // Update cache status display
        this.updateCacheStatus(uiManager);
        
        // Load cache enabled setting from localStorage if available
        const savedCacheEnabled = localStorage.getItem('spotifyCacheEnabled');
        if (savedCacheEnabled !== null) {
            const isEnabled = savedCacheEnabled === 'true';
            config.cache.enabled = isEnabled;
            uiManager.cacheEnabledToggle.checked = isEnabled;
        }
    }
    
    // Update cache status display
    updateCacheStatus(uiManager) {
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
                uiManager.cacheStatus.innerHTML = `
                    <span class="cache-enabled">✅ Cache enabled</span><br>
                    ${searchCount} searches, ${trackCount} tracks cached<br>
                    Approx. size: ${totalSize.toFixed(1)} KB
                `;
            } else {
                uiManager.cacheStatus.innerHTML = `
                    <span class="cache-disabled">❌ Cache disabled</span><br>
                    ${searchCount} searches, ${trackCount} tracks stored<br>
                    Approx. size: ${totalSize.toFixed(1)} KB
                `;
            }
        } catch (error) {
            console.error('Error updating cache status:', error);
            uiManager.cacheStatus.textContent = `Error getting cache status: ${error.message}`;
        }
    }
    
    // Clear the Spotify API cache
    clearCache(uiManager) {
        spotifyApi.clearCache();
        this.updateCacheStatus(uiManager);
        alert('Spotify API cache has been cleared');
    }
    
    // Toggle cache enabled/disabled
    toggleCacheEnabled(event, uiManager) {
        const isEnabled = event.target.checked;
        config.cache.enabled = isEnabled;
        localStorage.setItem('spotifyCacheEnabled', isEnabled.toString());
        this.updateCacheStatus(uiManager);
    }
    
    // Load Spotify credentials from local storage
    loadSavedCredentials(uiManager) {
        if (localStorage.getItem('spotifyClientId')) {
            uiManager.clientIdInput.value = localStorage.getItem('spotifyClientId');
        }
        
        // Check if client secret is saved (and should be loaded)
        if (localStorage.getItem('spotifyRememberSecret') === 'true' && 
            localStorage.getItem('spotifyClientSecret')) {
            try {
                // Decrypt the client secret (simple encoding for demo purposes)
                const encryptedSecret = localStorage.getItem('spotifyClientSecret');
                const secret = atob(encryptedSecret);
                uiManager.clientSecretInput.value = secret;
                uiManager.rememberSecretCheckbox.checked = true;
            } catch (error) {
                console.error('Error loading saved client secret:', error);
            }
        }
    }
}

// Create a singleton instance
const cacheManager = new CacheManager();