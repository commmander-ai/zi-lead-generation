#!/usr/bin/env node

// Debug script to test contact search functionality
const ZoomInfoService = require('./services/zoomInfoService');
const BucketService = require('./services/bucketService');
const winston = require('winston');
const { getSearchCombinations } = require('./config/searchParams');

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

async function debugContactSearch() {
  try {
    logger.info('Starting contact search debug...');
    
    // Initialize services
    const zoomInfoService = new ZoomInfoService(logger);
    const bucketService = new BucketService(logger);
    
    // Test authentication first
    logger.info('Testing ZoomInfo authentication...');
    try {
      const token = await zoomInfoService.getJwtToken();
      logger.info('Authentication successful, token obtained');
    } catch (authError) {
      logger.error('Authentication failed:', authError.message);
      return;
    }
    
    // Load exclusions
    await bucketService.downloadCompanyExclusions();
    
    // Get first combination
    const combinations = getSearchCombinations();
    const firstCombination = combinations[0];
    
    logger.info('Testing first combination:', firstCombination);
    
    // Search for companies
    const isMetroRegion = firstCombination.location.includes(' - ') || firstCombination.location.includes(', ');
    const companySearchParams = {
      [isMetroRegion ? 'metroRegion' : 'state']: firstCombination.location,
      naicsCodes: firstCombination.naicsCode,
      rpp: 5, // Only get 5 companies for testing
      page: 1
    };
    
    logger.info('Company search params:', companySearchParams);
    const companyResults = await zoomInfoService.searchCompanies(companySearchParams);
    
    logger.info(`Found ${companyResults.data?.length || 0} companies`);
    
    if (companyResults.data && companyResults.data.length > 0) {
      // Test contact search on first company
      const testCompany = companyResults.data[0];
      logger.info(`Testing contact search for company: ${testCompany.name} (ID: ${testCompany.id})`);
      
      // Try different job title variations
      const jobTitleVariations = [
        firstCombination.jobTitle, // "Project managers"
        "Project Manager", // Singular
        "Project Management", // Alternative
        "Manager", // Broader term
        "" // Empty job title
      ];
      
      for (const jobTitle of jobTitleVariations) {
        logger.info(`\n=== Testing job title: "${jobTitle}" ===`);
        
        const contactSearchParams = {
          companyId: testCompany.id.toString(),
          jobTitle: jobTitle,
          rpp: 10
        };
        
        logger.info('Contact search params:', contactSearchParams);
        
        try {
          const contactResults = await zoomInfoService.searchContacts(contactSearchParams);
          logger.info(`Found ${contactResults.data?.length || 0} contacts`);
          
          if (contactResults.data && contactResults.data.length > 0) {
            logger.info('Sample contact structure:');
            console.log(JSON.stringify(contactResults.data[0], null, 2));
            
            // Test contact enrichment on first contact
            const testContact = contactResults.data[0];
            logger.info(`Testing contact enrichment for: ${testContact.firstName} ${testContact.lastName} (ID: ${testContact.id})`);
            
            const enrichmentParams = {
              matchPersonInput: [{ personId: testContact.id.toString() }],
              outputFields: [
                'id', 'firstName', 'lastName', 'email', 'phone', 'mobilePhone',
                'jobTitle', 'companyId', 'companyName', 'contactAccuracyScore'
              ]
            };
            
            try {
              const enrichedContact = await zoomInfoService.enrichContact(enrichmentParams);
              logger.info('✓ Contact enrichment successful!');
              console.log('Enrichment result:');
              console.log(JSON.stringify(enrichedContact, null, 2));
              
              if (enrichedContact.data && (enrichedContact.data.email || enrichedContact.data.phone || enrichedContact.data.mobilePhone)) {
                logger.info('✓ Contact has usable contact information!');
              } else {
                logger.warn('⚠ Contact enrichment returned no usable contact info');
              }
            } catch (enrichError) {
              logger.error('✗ Contact enrichment failed:', enrichError.message);
            }
            
            break; // Exit after first successful contact search
          }
        } catch (error) {
          logger.error(`Contact search failed for "${jobTitle}":`, error.message);
        }
      }
    }
    
  } catch (error) {
    logger.error('Debug script failed:', error);
  }
}

// Run the debug script
debugContactSearch().then(() => {
  logger.info('Debug script completed');
  process.exit(0);
}).catch((error) => {
  logger.error('Debug script error:', error);
  process.exit(1);
});