const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class ZoomInfoService {
  constructor(logger) {
    this.logger = logger;
    this.baseURL = 'https://api.zoominfo.com/';
    this.username = process.env.ZOOMINFO_USERNAME;
    this.password = process.env.ZOOMINFO_PASSWORD;
    this.tokenFile = path.join(__dirname, '../data/zi-token.json');
    this.rateLimitDelay = parseInt(process.env.RATE_LIMIT_DELAY) || 100;
    this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
    
    // Token refresh configuration
    this.tokenRefreshInterval = 40 * 60 * 1000; // 40 minutes in milliseconds
    this.refreshTimer = null;
    this.currentToken = null;
    this.tokenExpiresAt = null;
    
    // Start automatic token refresh
    this.startTokenRefresh();
  }

  async getJwtToken() {
    try {
      // Check if we have a valid current token
      if (this.currentToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
        return this.currentToken;
      }
      
      // Check if we have a valid token in file
      try {
        const tokenData = await fs.readFile(this.tokenFile, 'utf8');
        const { token, expiresAt } = JSON.parse(tokenData);
        
        if (new Date(expiresAt) > new Date()) {
          this.currentToken = token;
          this.tokenExpiresAt = new Date(expiresAt);
          return token;
        }
      } catch (error) {
        // Token file doesn't exist or is invalid, continue to get new token
      }

      // Get new token from ZoomInfo API
      return await this.refreshToken();
      
    } catch (error) {
      this.logger.error('Failed to get JWT token:', error.message);
      throw error;
    }
  }

  async refreshToken() {
    try {
      this.logger.info('Refreshing ZoomInfo JWT token...');
      
      const response = await axios.post(`${this.baseURL}authenticate`, {
        username: this.username,
        password: this.password
      });

      const token = response.data.jwt;
      
      // Store token in memory and file (expires in 1 hour, but we refresh every 40 mins)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      this.currentToken = token;
      this.tokenExpiresAt = expiresAt;
      
      const tokenData = { token, expiresAt };
      
      const dataDir = path.dirname(this.tokenFile);
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(this.tokenFile, JSON.stringify(tokenData, null, 2));

      this.logger.info('ZoomInfo JWT token refreshed successfully');
      return token;
      
    } catch (error) {
      this.logger.error('Token refresh failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url
      });
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  async searchCompanies(searchParams) {
    return this.makeAPICall('search/company', searchParams, 'Company search');
  }

  async searchContacts(searchParams) {
    return this.makeAPICall('search/contact', searchParams, 'Contact search');
  }

  async enrichContact(contactParams) {
    return this.makeAPICall('enrich/contact', contactParams, 'Contact enrichment');
  }

  async makeAPICall(endpoint, params, operation, retryCount = 0) {
    try {
      await this.handleRateLimit();
      const token = await this.getJwtToken();
      
      const response = await axios.post(`${this.baseURL}${endpoint}`, params, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      this.logRateLimit(endpoint, response.headers);
      return response.data;
      
    } catch (error) {
      if (error.response?.status === 401 && retryCount < this.maxRetries) {
        // Token expired, clear it and retry
        try {
          await fs.unlink(this.tokenFile);
        } catch (unlinkError) {
          // File might not exist, ignore
        }
        this.logger.warn(`${operation} failed with 401, retrying with new token`);
        return this.makeAPICall(endpoint, params, operation, retryCount + 1);
      }
      
      if (error.response?.status === 429) {
        const retryAfter = error.response?.headers['retry-after'] || 60;
        const waitTime = parseInt(retryAfter) * 1000;
        
        this.logger.warn(`Rate limit exceeded for ${endpoint}. Waiting ${waitTime}ms before retry`);
        await this.sleep(waitTime);
        
        if (retryCount < this.maxRetries) {
          return this.makeAPICall(endpoint, params, operation, retryCount + 1);
        }
      }
      
      this.logger.error(`${operation} failed - ${endpoint}: ${error.response?.status || 'unknown'} - ${error.message}`);
      if (error.response?.data) {
        this.logger.error('Response data:', error.response.data);
      }
      
      throw new Error(`${operation} failed: ${error.response?.status || 'unknown'} - ${error.message}`);
    }
  }

  async handleRateLimit() {
    // Simple rate limiting - wait between requests
    await this.sleep(this.rateLimitDelay);
  }

  logRateLimit(endpoint, headers) {
    const remaining = headers['x-ratelimit-remaining-requests'];
    const resetTime = headers['x-ratelimit-reset-requests'];
    
    if (remaining !== undefined) {
      this.logger.debug(`Rate limit status for ${endpoint}:`, {
        remaining: remaining,
        resetTime: resetTime
      });
      
      if (parseInt(remaining) < 10) {
        this.logger.warn(`Low rate limit remaining: ${remaining} requests`);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Token refresh timer management
  startTokenRefresh() {
    // Clear any existing timer
    this.stopTokenRefresh();
    
    // Start the refresh timer
    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshToken();
      } catch (error) {
        this.logger.error('Automatic token refresh failed:', error.message);
        // Continue with the timer - will retry in 40 minutes
      }
    }, this.tokenRefreshInterval);
    
    this.logger.info(`Automatic token refresh started (every ${this.tokenRefreshInterval / 60000} minutes)`);
  }

  stopTokenRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      this.logger.info('Automatic token refresh stopped');
    }
  }

  // Clean up method for graceful shutdown
  async cleanup() {
    this.stopTokenRefresh();
  }

  // NAICS codes are now passed directly to ZoomInfo API via naicsCodes parameter

  // Convert US state names to ZoomInfo format
  mapStateToZoomInfo(stateName) {
    const stateMapping = {
      'Alabama': 'usa.alabama', 'Alaska': 'usa.alaska', 'Arizona': 'usa.arizona', 'Arkansas': 'usa.arkansas',
      'California': 'usa.california', 'Colorado': 'usa.colorado', 'Connecticut': 'usa.connecticut', 'Delaware': 'usa.delaware',
      'Florida': 'usa.florida', 'Georgia': 'usa.georgia', 'Hawaii': 'usa.hawaii', 'Idaho': 'usa.idaho',
      'Illinois': 'usa.illinois', 'Indiana': 'usa.indiana', 'Iowa': 'usa.iowa', 'Kansas': 'usa.kansas',
      'Kentucky': 'usa.kentucky', 'Louisiana': 'usa.louisiana', 'Maine': 'usa.maine', 'Maryland': 'usa.maryland',
      'Massachusetts': 'usa.massachusetts', 'Michigan': 'usa.michigan', 'Minnesota': 'usa.minnesota', 'Mississippi': 'usa.mississippi',
      'Missouri': 'usa.missouri', 'Montana': 'usa.montana', 'Nebraska': 'usa.nebraska', 'Nevada': 'usa.nevada',
      'New Hampshire': 'usa.new_hampshire', 'New Jersey': 'usa.new_jersey', 'New Mexico': 'usa.new_mexico', 'New York': 'usa.new_york',
      'North Carolina': 'usa.north_carolina', 'North Dakota': 'usa.north_dakota', 'Ohio': 'usa.ohio', 'Oklahoma': 'usa.oklahoma',
      'Oregon': 'usa.oregon', 'Pennsylvania': 'usa.pennsylvania', 'Rhode Island': 'usa.rhode_island', 'South Carolina': 'usa.south_carolina',
      'South Dakota': 'usa.south_dakota', 'Tennessee': 'usa.tennessee', 'Texas': 'usa.texas', 'Utah': 'usa.utah',
      'Vermont': 'usa.vermont', 'Virginia': 'usa.virginia', 'Washington': 'usa.washington', 'West Virginia': 'usa.west_virginia',
      'Wisconsin': 'usa.wisconsin', 'Wyoming': 'usa.wyoming'
    };
    
    return stateMapping[stateName] || `usa.${stateName.toLowerCase().replace(' ', '_')}`;
  }
}

module.exports = ZoomInfoService;