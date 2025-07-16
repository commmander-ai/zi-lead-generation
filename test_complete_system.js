#!/usr/bin/env node

// Test script for complete system functionality
require('dotenv').config();
const ZoomInfoService = require('./services/zoomInfoService');
const BucketService = require('./services/bucketService');
const StateManager = require('./services/stateManager');
const LeadProcessor = require('./services/leadProcessor');
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

async function testCompleteSystem() {
  let zoomInfoService = null;
  let stateManager = null;
  
  try {
    logger.info('🚀 Testing complete ZoomInfo lead generation system...');
    
    // Initialize services
    zoomInfoService = new ZoomInfoService(logger);
    const bucketService = new BucketService(logger);
    stateManager = new StateManager(logger);
    const leadProcessor = new LeadProcessor(zoomInfoService, bucketService, stateManager, logger);
    
    // Load state and exclusions
    await stateManager.loadState();
    await bucketService.downloadCompanyExclusions();
    
    logger.info('✅ Services initialized successfully');
    
    // Test processing one combination (override state to limit scope)
    const originalCombinations = leadProcessor.searchCombinations;
    leadProcessor.searchCombinations = originalCombinations.slice(0, 1); // Only first combination
    
    logger.info('🔍 Testing first combination only...');
    
    // Process the first combination
    await leadProcessor.processAllCombinations();
    
    logger.info('✅ Complete system test successful!');
    
  } catch (error) {
    logger.error('❌ Complete system test failed:', error);
  } finally {
    // Cleanup
    if (zoomInfoService) {
      await zoomInfoService.cleanup();
    }
    if (stateManager) {
      await stateManager.cleanup();
    }
  }
}

// Run the test
testCompleteSystem().then(() => {
  logger.info('🎉 Test completed');
  process.exit(0);
}).catch((error) => {
  logger.error('💥 Test error:', error);
  process.exit(1);
});