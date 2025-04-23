// Spotify API Configuration
const config = {
    // Spotify API endpoints
    authEndpoint: 'https://accounts.spotify.com/api/token',
    apiBaseUrl: 'https://api.spotify.com/v1',
    
    // Song matching settings
    songMatchThreshold: 0.7, // Lower threshold to better handle international songs (was 0.8)
    lengthToleranceMs: 1000, // Acceptable difference in milliseconds
    warningToleranceMs: 5000, // Threshold for warning in milliseconds
    
    // File types to analyze
    supportedAudioFormats: ['.mp3', '.m4a', '.flac', '.wav', '.ogg'],
    
    // Status messages
    statusMessages: {
        ok: "OK",
        warning: "WARNING",
        error: "ERROR",
        notFound: "NOT FOUND"
    },
    
    // Cache settings
    cache: {
        enabled: true,
        maxAge: Number.MAX_SAFE_INTEGER, // Set to unlimited (effectively never expires)
        // maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
        storageKeys: {
            searches: 'spotifySearchCache',
            tracks: 'spotifyTrackCache'
        }
    },
    
    // API retry settings
    retry: {
        maxRetries: 3, // Maximum number of retry attempts
        initialDelayMs: 1000, // Initial delay before retrying (1 second)
        maxDelayMs: 60000, // Maximum delay between retries (1 minute)
        jitterMs: 500 // Random jitter to add to delay (0-500ms)
    }
};