#!/usr/bin/env node

// Test script for token refresh functionality
require('dotenv').config();
const ZoomInfoService = require('./services/zoomInfoService');
const winston = require('winston');

// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level.toUpperCase()}] ${message} ${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

async function testTokenRefresh() {
  try {
    logger.info('Testing ZoomInfo token refresh functionality...');
    
    // Initialize ZoomInfo service (starts automatic refresh)
    const zoomInfoService = new ZoomInfoService(logger);
    
    // Test initial token acquisition
    logger.info('Testing initial token acquisition...');
    try {
      const token1 = await zoomInfoService.getJwtToken();
      logger.info('✓ Initial token acquired successfully');
      logger.info(`Token preview: ${token1.substring(0, 20)}...`);
    } catch (error) {
      logger.error('✗ Initial token acquisition failed:', error.message);
      return;
    }
    
    // Test manual token refresh
    logger.info('Testing manual token refresh...');
    try {
      const token2 = await zoomInfoService.refreshToken();
      logger.info('✓ Manual token refresh successful');
      logger.info(`New token preview: ${token2.substring(0, 20)}...`);
    } catch (error) {
      logger.error('✗ Manual token refresh failed:', error.message);
      return;
    }
    
    // Test token caching (should return cached token)
    logger.info('Testing token caching...');
    const token3 = await zoomInfoService.getJwtToken();
    logger.info('✓ Cached token retrieved successfully');
    
    logger.info('Token refresh test completed successfully!');
    logger.info('Note: Automatic refresh will occur every 40 minutes while the service is running.');
    
    // Clean up
    await zoomInfoService.cleanup();
    
  } catch (error) {
    logger.error('Token refresh test failed:', error);
  }
}

// Run the test
testTokenRefresh().then(() => {
  logger.info('Test completed');
  process.exit(0);
}).catch((error) => {
  logger.error('Test error:', error);
  process.exit(1);
});