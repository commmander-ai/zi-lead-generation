const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const fs = require('fs').promises;

class CSVWriter {
  constructor(logger) {
    this.logger = logger;
    this.outputDir = path.join(__dirname, '../data/csv');
  }

  async ensureOutputDir() {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  async writeCompanies(companies, identifier) {
    if (!companies || companies.length === 0) {
      this.logger.warn('No companies to write');
      return null;
    }

    await this.ensureOutputDir();
    
    const fileName = `companies-${identifier}.csv`;
    const filePath = path.join(this.outputDir, fileName);
    
    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: 'ziId', title: 'ZoomInfo ID' },
        { id: 'name', title: 'Company Name' },
        { id: 'state', title: 'State' },
        { id: 'metroRegion', title: 'Metro Region' },
        { id: 'naicsCode', title: 'NAICS Code' },
        { id: 'website', title: 'Website' },
        { id: 'phone', title: 'Phone' },
        { id: 'contactCount', title: 'Contact Count' },
        { id: 'createdAt', title: 'Date Found' }
      ]
    });

    // Add metadata to companies
    const companiesWithMeta = companies.map(company => ({
      ...company,
      contactCount: 0, // Will be updated if we track this
      createdAt: new Date().toISOString().split('T')[0]
    }));

    await csvWriter.writeRecords(companiesWithMeta);
    
    this.logger.info(`Companies CSV written: ${filePath} (${companies.length} records)`);
    return filePath;
  }

  async writeContacts(contacts, identifier) {
    if (!contacts || contacts.length === 0) {
      this.logger.warn('No contacts to write');
      return null;
    }

    await this.ensureOutputDir();
    
    const fileName = `contacts-${identifier}.csv`;
    const filePath = path.join(this.outputDir, fileName);
    
    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: 'ziId', title: 'Contact ZoomInfo ID' },
        { id: 'companyZiId', title: 'Company ZoomInfo ID' },
        { id: 'companyName', title: 'Company Name' },
        { id: 'name', title: 'Contact Name' },
        { id: 'jobTitle', title: 'Job Title' },
        { id: 'email', title: 'Email' },
        { id: 'phone', title: 'Phone' },
        { id: 'mobilePhone', title: 'Mobile Phone' },
        { id: 'state', title: 'State' },
        { id: 'metroRegion', title: 'Metro Region' },
        { id: 'naicsCode', title: 'NAICS Code' },
        { id: 'createdAt', title: 'Date Found' }
      ]
    });

    // Add metadata to contacts
    const contactsWithMeta = contacts.map(contact => ({
      ...contact,
      createdAt: new Date().toISOString().split('T')[0]
    }));

    await csvWriter.writeRecords(contactsWithMeta);
    
    this.logger.info(`Contacts CSV written: ${filePath} (${contacts.length} records)`);
    return filePath;
  }

  async writeCombined(companies, contacts, identifier) {
    const results = [];
    
    // Create combined records
    for (const company of companies || []) {
      const companyContacts = contacts?.filter(contact => 
        contact.companyZiId === company.ziId
      ) || [];
      
      if (companyContacts.length === 0) {
        // Company with no contacts
        results.push({
          companyZiId: company.ziId,
          companyName: company.name,
          state: company.state,
          metroRegion: company.metroRegion,
          naicsCode: company.naicsCode,
          website: company.website,
          companyPhone: company.phone,
          contactZiId: '',
          contactName: '',
          jobTitle: '',
          email: '',
          phone: '',
          mobilePhone: '',
          createdAt: new Date().toISOString().split('T')[0]
        });
      } else {
        // Company with contacts
        for (const contact of companyContacts) {
          results.push({
            companyZiId: company.ziId,
            companyName: company.name,
            state: company.state,
            metroRegion: company.metroRegion,
            naicsCode: company.naicsCode,
            website: company.website,
            companyPhone: company.phone,
            contactZiId: contact.ziId,
            contactName: contact.name,
            jobTitle: contact.jobTitle,
            email: contact.email,
            phone: contact.phone,
            mobilePhone: contact.mobilePhone,
            createdAt: new Date().toISOString().split('T')[0]
          });
        }
      }
    }

    if (results.length === 0) {
      this.logger.warn('No combined data to write');
      return null;
    }

    await this.ensureOutputDir();
    
    const fileName = `combined-${identifier}.csv`;
    const filePath = path.join(this.outputDir, fileName);
    
    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: 'companyZiId', title: 'Company ZoomInfo ID' },
        { id: 'companyName', title: 'Company Name' },
        { id: 'state', title: 'State' },
        { id: 'metroRegion', title: 'Metro Region' },
        { id: 'naicsCode', title: 'NAICS Code' },
        { id: 'website', title: 'Website' },
        { id: 'companyPhone', title: 'Company Phone' },
        { id: 'contactZiId', title: 'Contact ZoomInfo ID' },
        { id: 'contactName', title: 'Contact Name' },
        { id: 'jobTitle', title: 'Job Title' },
        { id: 'email', title: 'Email' },
        { id: 'phone', title: 'Phone' },
        { id: 'mobilePhone', title: 'Mobile Phone' },
        { id: 'createdAt', title: 'Date Found' }
      ]
    });

    await csvWriter.writeRecords(results);
    
    this.logger.info(`Combined CSV written: ${filePath} (${results.length} records)`);
    return filePath;
  }
}

module.exports = CSVWriter;