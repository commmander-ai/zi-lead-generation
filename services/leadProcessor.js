const CSVWriter = require('../utils/csvWriter');
const { getSearchCombinations, getValidGroupCount } = require('../config/searchParams');
const path = require('path');

class LeadProcessor {
  constructor(zoomInfoService, bucketService, stateManager, logger) {
    this.zoomInfoService = zoomInfoService;
    this.bucketService = bucketService;
    this.stateManager = stateManager;
    this.logger = logger;
    this.csvWriter = new CSVWriter(logger);
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 50;
    
    // Load search combinations from JSON configuration
    this.searchCombinations = getSearchCombinations();
    this.validGroupCount = getValidGroupCount();
    
    this.logger.info('Lead processor initialized', {
      validGroups: this.validGroupCount,
      totalCombinations: this.searchCombinations.length,
      batchSize: this.batchSize
    });
  }

  getTotalCombinations() {
    return this.searchCombinations.length;
  }

  async processAllCombinations() {
    const state = this.stateManager.getCurrentState();
    
    if (state.completed) {
      this.logger.info('All combinations already completed');
      return;
    }

    const startingIndex = state.currentCombinationIndex || 0;
    
    this.logger.info('Starting to process search combinations', {
      startingFromIndex: startingIndex,
      totalCombinations: this.searchCombinations.length,
      progress: `${((startingIndex / this.searchCombinations.length) * 100).toFixed(2)}%`
    });

    // Process combinations starting from saved state
    for (let combinationIndex = startingIndex; combinationIndex < this.searchCombinations.length; combinationIndex++) {
      const combination = this.searchCombinations[combinationIndex];
      const { location, naicsCode, naicsName, jobTitle, groupIndex } = combination;
      
      this.logger.info(`Processing combination ${combinationIndex + 1}/${this.searchCombinations.length}: ${location} + ${naicsCode} + ${jobTitle}`);
      
      // Update state before processing
      this.stateManager.updateProgress({
        currentCombinationIndex: combinationIndex,
        currentPage: 1
      });
      
      await this.processCombination(location, naicsCode, jobTitle);
      
      // Log progress
      const progress = ((combinationIndex + 1) / this.searchCombinations.length) * 100;
      this.logger.info(`Combination completed. Progress: ${progress.toFixed(2)}%`);
    }
    
    this.stateManager.markCompleted();
    this.logger.info('All combinations processed successfully!');
  }

  async processCombination(location, naicsCode, jobTitle) {
    const state = this.stateManager.getCurrentState();
    let page = state.currentPage || 1;
    let hasMorePages = true;
    let combinationCompanies = [];
    let combinationContacts = [];
    let consecutiveEmptyPages = 0;
    
    this.logger.info(`Starting ${location}+${naicsCode}+${jobTitle} from page ${page}`);
    
    // Search companies for this location + NAICS combination
    while (hasMorePages) {
      try {
        // Determine if location is a state or metro region
        const isMetroRegion = location.includes(' - ') || location.includes(', ');
        const companySearchParams = {
          [isMetroRegion ? 'metroRegion' : 'state']: location,
          naicsCodes: naicsCode,
          rpp: this.batchSize,
          page: page
        };
        
        this.logger.info(`Searching companies: ${location} + ${naicsCode}, page ${page}`);
        const companyResults = await this.zoomInfoService.searchCompanies(companySearchParams);
        
        if (!companyResults.data || companyResults.data.length === 0) {
          this.logger.info(`No more companies found for ${location}+${naicsCode} at page ${page}`);
          hasMorePages = false;
          break;
        }
        
        // Filter out excluded companies
        const newCompanies = companyResults.data.filter(company => 
          !this.bucketService.isCompanyExcluded(company.id)
        );
        
        this.logger.info(`Found ${companyResults.data.length} companies, ${newCompanies.length} are new`);
        
        if (newCompanies.length > 0) {
          // Reset consecutive empty pages counter
          consecutiveEmptyPages = 0;
          
          // Process contacts for new companies
          const { companies, contacts } = await this.processCompaniesContacts(newCompanies, jobTitle, location, naicsCode);
          combinationCompanies.push(...companies);
          combinationContacts.push(...contacts);
          
          // Update exclusion list with new company zi-ids
          const newZiIds = newCompanies.map(company => company.id.toString());
          await this.bucketService.updateCompanyExclusions(newZiIds);
        } else {
          // Track consecutive pages with no new companies
          consecutiveEmptyPages++;
          
          // Stop if we've had too many consecutive empty pages
          if (consecutiveEmptyPages >= 3) {
            this.logger.info(`Stopping pagination after ${consecutiveEmptyPages} consecutive pages with no new companies`);
            hasMorePages = false;
            break;
          }
        }
        
        // Update progress
        this.stateManager.updateProgress({ currentPage: page + 1 });
        
        // Check if there are more pages
        const totalPages = Math.ceil(companyResults.totalCount / this.batchSize);
        if (page >= totalPages) {
          hasMorePages = false;
        } else {
          page++;
        }
        
      } catch (error) {
        this.logger.error(`Error processing page ${page} for ${location}+${naicsCode}:`, error);
        
        // Check if it's a "page number too high" error
        if (error.message.includes('400') && (error.message.includes('page number') || error.message.includes('greater than'))) {
          this.logger.info(`Reached end of available pages for ${location}+${naicsCode} at page ${page}`);
          hasMorePages = false;
          break;
        }
        
        // For other errors, skip this page and continue
        page++;
        if (page > 50) { // Safety limit
          this.logger.error(`Too many pages for ${location}+${naicsCode}, stopping`);
          hasMorePages = false;
        }
      }
    }
    
    // Save results for this combination if we have any
    this.logger.info(`Before saveResults: ${combinationCompanies.length} companies, ${combinationContacts.length} contacts for ${location}+${naicsCode}+${jobTitle}`);
    if (combinationCompanies.length > 0 || combinationContacts.length > 0) {
      await this.saveResults(combinationCompanies, combinationContacts, location, naicsCode, jobTitle);
    } else {
      this.logger.warn(`No data to save for ${location}+${naicsCode}+${jobTitle} - companies: ${combinationCompanies.length}, contacts: ${combinationContacts.length}`);
    }
    
    // Reset page for next combination
    this.stateManager.updateProgress({ currentPage: 1 });
    
    this.logger.info(`Completed ${location}+${naicsCode}+${jobTitle}: ${combinationCompanies.length} companies, ${combinationContacts.length} contacts`);
  }

  async processCompaniesContacts(companies, jobTitle, location, naicsCode) {
    const processedCompanies = [];
    const processedContacts = [];
    
    this.logger.info(`Processing ${companies.length} companies for job title: "${jobTitle}"`);
    
    for (const company of companies) {
      try {
        // Add company data with separate state and metro region fields
        const isMetroRegion = location.includes(' - ') || location.includes(', ');
        const companyData = {
          ziId: company.id.toString(),
          name: company.name,
          state: isMetroRegion ? '' : location,
          metroRegion: isMetroRegion ? location : '',
          naicsCode: naicsCode,
          website: company.website || '',
          phone: company.phone || ''
        };
        processedCompanies.push(companyData);
        
        // Search contacts for this company and job title
        // Removed requiredFields to be more permissive - we'll filter after getting results
        const contactSearchParams = {
          companyId: company.id.toString(),
          jobTitle: jobTitle,
          contactAccuracyScoreMin: '75', // Minimum accuracy score for quality
          excludePartialProfiles: true, // Exclude incomplete profiles
          rpp: this.batchSize
        };
        
        this.logger.info(`CONTACT SEARCH: Company "${company.name}" (ID: ${company.id}), Job Title: "${jobTitle}"`);
        this.logger.debug('Contact search params:', contactSearchParams);
        
        const contactResults = await this.zoomInfoService.searchContacts(contactSearchParams);
        
        this.logger.info(`CONTACT SEARCH RESULT: Found ${contactResults.data?.length || 0} contacts for "${company.name}"`);
        this.logger.debug('Full contact search response:', JSON.stringify(contactResults, null, 2));
        
        if (contactResults.data && contactResults.data.length > 0) {
          this.logger.info(`Found ${contactResults.data.length} contacts with required contact information`);
          
          // Log sample contact to understand structure
          if (contactResults.data.length > 0) {
            this.logger.debug('Sample contact structure:', JSON.stringify(contactResults.data[0], null, 2));
          }
          
          // Process all contacts (we'll filter for contact info using OR logic)
          for (const contact of contactResults.data) {
            try {
              this.logger.debug(`ENRICHING CONTACT: ${contact.id} - ${contact.firstName} ${contact.lastName}`);
              
              const enrichedContact = await this.zoomInfoService.enrichContact({
                matchPersonInput: [{ personId: contact.id.toString() }],
                outputFields: [
                  'id',
                  'firstName',
                  'lastName',
                  'email',
                  'phone',
                  'mobilePhone',
                  'jobTitle',
                  'companyId',
                  'companyName',
                  'contactAccuracyScore',
                  'managementLevel'
                ]
              });
              
              this.logger.debug('Enrichment response:', JSON.stringify(enrichedContact, null, 2));
              
              // Extract contact data from ZoomInfo enrichment response structure
              const enrichedData = enrichedContact.data?.result?.[0]?.data?.[0];
              
              if (enrichedData && (enrichedData.email || enrichedData.phone || enrichedData.mobilePhone)) {
                const isMetroRegion = location.includes(' - ') || location.includes(', ');
                const contactData = {
                  ziId: contact.id.toString(),
                  companyZiId: company.id.toString(),
                  companyName: company.name,
                  name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
                  jobTitle: contact.jobTitle || jobTitle,
                  email: enrichedData.email || '',
                  phone: enrichedData.phone || '',
                  mobilePhone: enrichedData.mobilePhone || '',
                  state: isMetroRegion ? '' : location,
                  metroRegion: isMetroRegion ? location : '',
                  naicsCode: naicsCode
                };
                processedContacts.push(contactData);
                this.logger.info(`✓ Successfully processed contact: ${contactData.name} (${contactData.email || contactData.mobilePhone})`);
              } else {
                this.logger.warn(`✗ Contact ${contact.id} enrichment failed - no contact info returned`);
                this.logger.debug('Enrichment structure:', JSON.stringify(enrichedContact.data, null, 2));
              }
            } catch (enrichError) {
              this.logger.error(`Failed to enrich contact ${contact.id}:`, enrichError.message);
            }
          }
        } else {
          this.logger.info(`No contacts found for "${jobTitle}" at "${company.name}"`);
        }
        
        // Update processed counts
        const currentState = this.stateManager.getCurrentState();
        this.stateManager.updateProgress({
          processedCompanies: currentState.processedCompanies + 1,
          processedContacts: currentState.processedContacts + processedContacts.length
        });
        
      } catch (error) {
        this.logger.error(`Error processing company ${company.id}:`, error);
      }
    }
    
    this.logger.info(`FINAL RESULTS: ${processedCompanies.length} companies, ${processedContacts.length} contacts`);
    return { companies: processedCompanies, contacts: processedContacts };
  }

  async saveResults(companies, contacts, location, naicsCode, jobTitle) {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      // Clean location name for filename
      const cleanLocation = location.replace(/[^a-zA-Z0-9]/g, '-');
      const identifier = `${cleanLocation}-${naicsCode}-${jobTitle.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}`;
      
      this.logger.info(`saveResults called with ${companies.length} companies, ${contacts.length} contacts`);
      
      // Generate CSV files - always try to generate companies file
      const companiesFile = companies.length > 0 ? await this.csvWriter.writeCompanies(companies, identifier) : null;
      const contactsFile = contacts.length > 0 ? await this.csvWriter.writeContacts(contacts, identifier) : null;
      
      this.logger.info(`CSV files created: companiesFile=${!!companiesFile}, contactsFile=${!!contactsFile}`);
      
      // Only upload files that were successfully created
      if (companiesFile || contactsFile) {
        await this.bucketService.uploadResults(companiesFile, contactsFile);
      }
      
      this.logger.info(`Results saved for ${location}+${naicsCode}+${jobTitle}:`, {
        companies: companies.length,
        contacts: contacts.length,
        files: { companiesFile, contactsFile }
      });
      
    } catch (error) {
      this.logger.error('Error saving results:', error);
      throw error;
    }
  }
}

module.exports = LeadProcessor;