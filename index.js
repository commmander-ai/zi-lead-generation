#!/usr/bin/env node

require('dotenv').config();
const winston = require('winston');
const ZoomInfoService = require('./services/zoomInfoService');
const BucketService = require('./services/bucketService');
const StateManager = require('./services/stateManager');
const LeadProcessor = require('./services/leadProcessor');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Global service references for cleanup
let zoomInfoService = null;
let stateManager = null;

async function main() {
  try {
    logger.info('Starting ZoomInfo VM Lead Generation System');
    
    // Initialize services
    zoomInfoService = new ZoomInfoService(logger);
    const bucketService = new BucketService(logger);
    stateManager = new StateManager(logger);
    const leadProcessor = new LeadProcessor(zoomInfoService, bucketService, stateManager, logger);
    
    // Load or initialize state
    await stateManager.loadState();
    
    // Download company exclusion list from bucket
    await bucketService.downloadCompanyExclusions();
    
    // Start processing
    await leadProcessor.processAllCombinations();
    
    logger.info('All combinations processed successfully');
    
    // Clean shutdown
    await cleanup();
    
  } catch (error) {
    logger.error('Fatal error in main process:', error);
    await cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  logger.info('Cleaning up services...');
  
  try {
    if (zoomInfoService) {
      await zoomInfoService.cleanup();
    }
    if (stateManager) {
      await stateManager.cleanup();
    }
    logger.info('Cleanup completed');
  } catch (error) {
    logger.error('Error during cleanup:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await cleanup();
  process.exit(0);
});

// Start the application
main().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});