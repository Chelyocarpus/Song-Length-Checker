/**
 * Simple logging utility with configurable log levels
 */
class Logger {
    constructor() {
        this.levels = {
            ERROR: 0,   // Critical errors that prevent functionality
            WARN: 1,    // Warnings that don't prevent functionality but are concerning
            INFO: 2,    // General informational messages about program flow
            DEBUG: 3,   // Detailed information, typically for debugging
            TRACE: 4    // Very detailed tracing information
        };
        
        // Default to INFO level in normal operation
        this.currentLevel = this.levels.INFO;
        
        // Check if URL has a debug parameter
        if (window.location.search.includes('debug=true')) {
            this.currentLevel = this.levels.DEBUG;
        }
        
        // Check if URL has a trace parameter
        if (window.location.search.includes('trace=true')) {
            this.currentLevel = this.levels.TRACE;
        }
        
        // Enable log colors in console for better readability
        this.colors = {
            ERROR: 'color: #ff5252; font-weight: bold',
            WARN: 'color: #ffa500',
            INFO: 'color: #2196f3',
            DEBUG: 'color: #4caf50',
            TRACE: 'color: #9e9e9e'
        };
    }
    
    // Set the current log level
    setLevel(levelName) {
        if (this.levels.hasOwnProperty(levelName)) {
            this.currentLevel = this.levels[levelName];
            this.info(`Log level set to ${levelName}`);
        }
    }
    
    // Log with timestamp and level
    _log(level, levelName, ...args) {
        if (level <= this.currentLevel) {
            const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
            const prefix = `[${timestamp}] [${levelName}]`;
            
            if (typeof args[0] === 'string') {
                console.log(`%c${prefix} ${args[0]}`, this.colors[levelName], ...args.slice(1));
            } else {
                console.log(`%c${prefix}`, this.colors[levelName], ...args);
            }
        }
    }
    
    // Log methods for each level
    error(...args) {
        this._log(this.levels.ERROR, 'ERROR', ...args);
    }
    
    warn(...args) {
        this._log(this.levels.WARN, 'WARN', ...args);
    }
    
    info(...args) {
        this._log(this.levels.INFO, 'INFO', ...args);
    }
    
    debug(...args) {
        this._log(this.levels.DEBUG, 'DEBUG', ...args);
    }
    
    trace(...args) {
        this._log(this.levels.TRACE, 'TRACE', ...args);
    }
}

// Create a singleton instance
const logger = new Logger();
