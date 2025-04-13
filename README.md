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

## How to Use

### 1. Setup Spotify API Credentials

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Log in with your Spotify account
3. Create a new application
4. Note your Client ID and Client Secret

### 2. Using the App

1. Open `index.html` in a web browser
2. Enter your Spotify API credentials and click "Authenticate"
   - Check "Remember Client Secret" to save it for future sessions
   - If you have used the app before, you can work in offline mode with cached data
3. Select a folder containing audio files using the file browser
4. Click "Compare with Spotify" (or "Compare with Cached Data" in offline mode)
5. Review the results table:
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

- `songMatchThreshold`: How closely the song title needs to match (0.0-1.0)
- `lengthToleranceMs`: Acceptable difference in milliseconds (default: 2000ms)
- `warningToleranceMs`: Threshold for warnings (default: 5000ms)

## Notes

- The application runs entirely in the browser and no data is sent to external servers except for Spotify API calls.
- Your Client ID is always saved in browser local storage for convenience.
- Your Client Secret is only saved if the "Remember Client Secret" option is checked.
- For best results, ensure your audio files are named in a format like "Artist - Title.mp3" or include proper ID3 tags.
- If a track with a numbered title (e.g., "This Alive 2") is not found, the app will automatically try searching without the number ("This Alive").
- If you have previously searched for tracks, you can use the app in "offline mode" with cached data without authentication
- When working with cached data only, you will only get results for tracks that were previously searched

## Troubleshooting

If tracks aren't found on Spotify, the application provides detailed reasons below each affected track:
- Missing artist information in filenames
- Misspelled artist or track names
- Tracks that exist on Spotify but under slightly different names
- Tracks that don't exist on Spotify at all

For numbered tracks (e.g., "Song 2"), the app will automatically try searching without the number.

## Technical Details

This application uses:
- HTML, CSS, and vanilla JavaScript
- Web Audio API to analyze audio files
- Spotify Web API for track information
