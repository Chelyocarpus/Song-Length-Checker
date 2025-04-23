![grafik](https://github.com/user-attachments/assets/998bb8c3-90c8-4b1f-bdb5-477731f143e0)


# Song Length Checker

A powerful web application designed to compare the durations of your local audio files with their corresponding tracks on Spotify, helping you identify discrepancies with ease. This tool pairs seamlessly with [Spytify (Spy-Spotify)](https://github.com/jwallet/spy-spotify) by jwallet, making it an excellent companion for verifying the accuracy of your recordings.

## Features

- Upload and process local audio files (MP3, M4A, FLAC, WAV, OGG)
- Extract song titles and artists from filenames
- Authenticate with Spotify API
- Search for matching tracks on Spotify
- Compare track durations and highlight discrepancies
- Detailed results view with color-coded status indicators
- Advanced filtering options for different types of issues
- Save and reuse Spotify API credentials for convenience
- Smart handling of numbered duplicate tracks (e.g., "Song 2" will match "Song" if not found)
- Detailed reasons for why tracks couldn't be found on Spotify
- Offline mode using cached data without authentication
- Modern drag-and-drop interface for easy file selection
- Support for folder uploads to process multiple files at once
- Smart caching system to reduce API calls and speed up repeated searches

## Attribution

This application uses the [Spotify Web API](https://developer.spotify.com/documentation/web-api) for track information and search functionality. Track data is provided by Spotify. The use of Spotify data is subject to the [Spotify Developer Terms of Service](https://developer.spotify.com/terms).

Spotify® is a trademark of Spotify AB which does not sponsor, authorize, or endorse this application.

## How to Use

### 1. Setup Spotify API Credentials

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Log in with your Spotify account
3. Create a new application
4. Note your Client ID and Client Secret

### 2. Using the App

1. Download the source or clone the repository
2. Open `index.html` in a web browser
3. Enter your Spotify API credentials and click "Authenticate"
   - Check "Remember Client Secret" to save it for future sessions
   - If you have used the app before, you can work in offline mode with cached data
4. Select a folder containing audio files using the file browser or drag and drop your files/folders directly onto the interface
5. Click "Compare with Spotify" (or "Compare with Cached Data" in offline mode)
6. Review the results table:
   - Green "OK" = Durations match within tolerance
   - Yellow "WARNING" = Small duration discrepancy
   - Red "ERROR" = Large duration discrepancy
   - "NOT FOUND" = Track couldn't be found on Spotify (with detailed reason shown below the track)
   - Use the filter options to focus on specific types of issues:
     - "All Issues" - Show all problematic tracks
     - "Warnings" - Show tracks with small discrepancies
     - "Errors" - Show tracks with large discrepancies
     - "Not Found" - Show tracks that couldn't be found on Spotify

## Configuration

You can modify the following settings in `config.js`:

- `songMatchThreshold`: How closely the song title needs to match (0.0-1.0, default: 0.7)
- `lengthToleranceMs`: Acceptable difference in milliseconds (default: 1000ms)
- `warningToleranceMs`: Threshold for warnings (default: 5000ms)
- `supportedAudioFormats`: File types supported for analysis
- `cache.enabled`: Enable/disable caching of Spotify API results
- `cache.maxAge`: How long to keep cached results (default: never expires)
- `retry.maxRetries`: Number of retry attempts for API failures (default: 3)
- `retry.initialDelayMs`: Initial delay before retrying failed requests (default: 1000ms)

## File Naming Recommendations

For best results with automatic track matching:

1. **Standard Format**: "Artist - Title.mp3"
2. **Album Format**: "Artist - Album - Track# - Title.mp3"
3. **ID3 Tags**: Ensure your files have proper ID3 tags with accurate artist and title information

## Cache Management

The app includes a sophisticated caching system that:

- Saves Spotify search and track data to reduce API calls
- Provides offline operation with previously fetched data
- Shows cache status and size in the interface
- Includes controls to clear cache or disable caching functionality
- Implements smart API retry logic with exponential backoff

## Troubleshooting

If tracks aren't found on Spotify, the application provides detailed reasons below each affected track:
- Missing artist information in filenames
- Misspelled artist or track names
- Tracks that exist on Spotify but under slightly different names
- Tracks that don't exist on Spotify at all

For numbered tracks (e.g., "Song 2"), the app will automatically try searching without the number.

### Common Issues:

1. **Authentication Errors**: Verify your Spotify API credentials and ensure your app is properly registered
2. **File Format Issues**: Check that your audio files are in supported formats
3. **Parsing Errors**: If files aren't being correctly parsed, try standardizing your filename format
4. **Browser Compatibility**: For best results, use a modern browser like Chrome, Firefox, or Edge

## Browser Compatibility

- Modern Chromium-based browsers (Chrome, Edge, Opera)
- Firefox
- Safari 14+

## Privacy & Security

- The application runs entirely in the browser and no data is sent to external servers except for Spotify API calls.
- Your Client ID is always saved in browser local storage for convenience.
- Your Client Secret is only saved if the "Remember Client Secret" option is checked.
- Authentication tokens are handled securely and never exposed to third parties.

## Technical Details

This application uses:
- HTML, CSS, and vanilla JavaScript
- Web Audio API to analyze audio files
- Spotify Web API for track information
- Modern browser APIs including:
  - File System Access API (where supported)
  - Web Storage API for caching
  - Drag and Drop API

## Rate Limiting

The application implements robust handling of Spotify API rate limits:

### Spotify API Limits
- The Spotify Web API has rate limits that vary by endpoint
- When rate limited, the API returns a 429 status code with a Retry-After header
- The app respects these limits to ensure reliable operation

### Rate Limit Handling
- Smart retry system with exponential backoff
- Honors Spotify's Retry-After header when provided
- Configurable retry parameters in config.js:
  - `retry.maxRetries`: Maximum retry attempts (default: 3)
  - `retry.initialDelayMs`: Initial retry delay (default: 1000ms)
  - `retry.maxDelayMs`: Maximum delay between retries (default: 60000ms)
  - `retry.jitterMs`: Random delay variation (0-500ms) to prevent thundering herd

### Optimization Strategies
1. **Caching System**
   - Reduces API calls by caching search results and track data
   - Configurable cache duration
   - Offline mode support using cached data
   - Cache can be cleared manually if needed

2. **Request Optimization**
   - Uses smart search strategies to minimize API calls
   - Implements request deduplication

3. **Error Recovery**
   - Automatic retry on network failures
   - Progressive backoff with jitter
   - Detailed error logging for troubleshooting

## Self-Hosting Guide

The Song Length Checker is a static web application that can be hosted on any web server. Here's how to set it up:

### GitHub Pages Deployment

You can quickly deploy this application using GitHub Pages:

1. **Fork or Upload to GitHub**
   - Fork this repository or create a new repository and upload the code
   - Ensure your repository is public (or you have GitHub Pro for private repositories)

2. **Configure GitHub Pages**
   - Go to your repository's Settings > Pages
   - Under "Source", select your main branch
   - Choose the root folder (/) as your publishing source
   - Save the settings and wait for deployment

3. **Update Spotify Settings**
   - Add your GitHub Pages URL (https://your-username.github.io/repository-name) to the allowed origins in your Spotify Developer Dashboard
   - Update config.js with any environment-specific settings

4. **Verify Deployment**
   - Access your site at https://your-username.github.io/repository-name
   - Confirm HTTPS is working (required for browser APIs)
   - Test the Spotify authentication flow

### Requirements

- A web server capable of serving static files (Apache, Nginx, etc.)
- HTTPS support (required for some browser APIs)
- Ability to set CORS headers if hosting on a different domain than your users will access it from

### Installation Steps

1. **Download the Application**
   - Clone this repository or download the source code
   - All required files are included; no build process is needed

2. **Configure Your Web Server**
   - Copy all files to your web server's public directory
   - Ensure the directory structure is maintained:
     ```
     your-public-directory/
     ├── index.html
     ├── css/
     │   └── styles.css
     └── js/
         ├── app.js
         ├── cache-manager.js
         ├── config.js
         └── ... (other .js files)
     ```
   - Configure your web server to:
     - Serve index.html for the root path
     - Set appropriate MIME types for .js and .css files
     - Enable HTTPS (required for security and browser API compatibility)

3. **Server Configuration Examples**

   For Apache (.htaccess):
   ```apache
   # Set security headers
   Header set X-Content-Type-Options "nosniff"
   Header set X-Frame-Options "DENY"
   Header set X-XSS-Protection "1; mode=block"
   
   # Set CORS headers if needed
   Header set Access-Control-Allow-Origin "*"
   
   # Proper MIME types
   AddType application/javascript .js
   AddType text/css .css
   ```

   For Nginx (nginx.conf):
   ```nginx
   server {
       listen 443 ssl;
       server_name your-domain.com;
       
       root /path/to/song-length-checker;
       index index.html;
       
       # SSL configuration (required)
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       # Security headers
       add_header X-Content-Type-Options nosniff;
       add_header X-Frame-Options DENY;
       add_header X-XSS-Protection "1; mode=block";
       
       # Handle static files
       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

4. **Spotify API Configuration**
   - Register your hosted instance in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
   - Add your domain to the allowed origins in your Spotify app settings
   - Update config.js if you need to modify any default settings

5. **Testing Your Installation**
   - Access your hosted instance via HTTPS
   - Verify all JavaScript files load correctly (check browser dev tools)
   - Test authentication with Spotify
   - Confirm file upload and analysis functions work
   - Verify caching functionality

### Troubleshooting Server Setup

- If files aren't loading, check file permissions and paths
- For CORS issues, verify your server's CORS headers
- If browser APIs aren't working, confirm you're using HTTPS
- For Spotify API errors, check your domain is properly registered

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests if you have ideas for improvements.

## License

This project is open source and available under the [LICENSE](LICENSE) included with this repository.
