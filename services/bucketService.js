const { Storage } = require('@google-cloud/storage');
const fs = require('fs').promises;
const path = require('path');

class BucketService {
  constructor(logger) {
    this.logger = logger;
    this.bucketName = process.env.GCS_BUCKET_NAME || 'commander-ai-staging-assets';
    this.storage = new Storage();
    this.bucket = this.storage.bucket(this.bucketName);
    this.companyExclusions = new Set();
    this.exclusionsFile = path.join(__dirname, '../data/existing_ziids.csv');
  }

  async downloadCompanyExclusions() {
    try {
      this.logger.info('Downloading company exclusion list from bucket');
      
      const file = this.bucket.file('zi-backups/existing_ziids.csv');
      const [exists] = await file.exists();
      
      if (!exists) {
        this.logger.info('No company exclusion list found in bucket, starting with empty set');
        return;
      }

      // Download to local file
      await file.download({ destination: this.exclusionsFile });
      
      // Load into memory set - handle CSV format
      const content = await fs.readFile(this.exclusionsFile, 'utf8');
      const ziIds = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('zi_id')) // Skip header if present
        .map(line => line.replace(/[",]/g, '')); // Remove CSV formatting
      
      this.companyExclusions = new Set(ziIds);
      this.logger.info(`Loaded ${this.companyExclusions.size} company zi-ids for exclusion`);
      
    } catch (error) {
      this.logger.error('Error downloading company exclusions:', error);
      // Continue with empty set if download fails
      this.companyExclusions = new Set();
    }
  }

  isCompanyExcluded(ziId) {
    return this.companyExclusions.has(ziId.toString());
  }

  async uploadCSVFile(localFilePath, bucketPath) {
    try {
      this.logger.info(`Uploading ${localFilePath} to bucket path: ${bucketPath}`);
      
      const file = this.bucket.file(bucketPath);
      await file.save(await fs.readFile(localFilePath), {
        metadata: {
          contentType: 'text/csv'
        }
      });
      
      this.logger.info(`Successfully uploaded ${bucketPath}`);
      
    } catch (error) {
      this.logger.error(`Error uploading ${bucketPath}:`, error);
      throw error;
    }
  }

  async uploadResults(companiesFile, contactsFile) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    
    const uploads = [];
    let companiesPath = null;
    let contactsPath = null;
    
    if (companiesFile && companiesFile !== null) {
      companiesPath = `zi-backups/results/companies-${timestamp}.csv`;
      this.logger.info(`Uploading companies file: ${companiesFile} -> ${companiesPath}`);
      uploads.push(this.uploadCSVFile(companiesFile, companiesPath));
    } else {
      this.logger.warn('No companies file to upload (null or undefined)');
    }
    
    if (contactsFile && contactsFile !== null) {
      contactsPath = `zi-backups/results/contacts-${timestamp}.csv`;
      this.logger.info(`Uploading contacts file: ${contactsFile} -> ${contactsPath}`);
      uploads.push(this.uploadCSVFile(contactsFile, contactsPath));
    } else {
      this.logger.warn('No contacts file to upload (null or undefined)');
    }
    
    if (uploads.length > 0) {
      await Promise.all(uploads);
    } else {
      this.logger.warn('No files to upload - both companiesFile and contactsFile are null');
    }
    
    return { companiesPath, contactsPath };
  }

  async updateCompanyExclusions(newZiIds) {
    try {
      // Add new zi-ids to local set
      newZiIds.forEach(ziId => this.companyExclusions.add(ziId.toString()));
      
      // Write updated list to local file
      const exclusionList = Array.from(this.companyExclusions).join('\n');
      await fs.writeFile(this.exclusionsFile, exclusionList);
      
      // Upload updated list to bucket  
      await this.uploadCSVFile(this.exclusionsFile, 'existing_ziids.csv');
      
      this.logger.info(`Updated company exclusions list with ${newZiIds.length} new zi-ids`);
      
    } catch (error) {
      this.logger.error('Error updating company exclusions:', error);
      throw error;
    }
  }

  getExclusionCount() {
    return this.companyExclusions.size;
  }
}

module.exports = BucketService;