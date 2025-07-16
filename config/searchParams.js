// Search parameter configuration for VM deployment
const fs = require('fs');
const path = require('path');

// Load search parameter groups from JSON file
function loadSearchParameterGroups() {
  try {
    const filePath = path.join(__dirname, '../data/extracted_parameters.json');
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!jsonData.search_parameters || !Array.isArray(jsonData.search_parameters)) {
      throw new Error('Invalid JSON structure: missing search_parameters array');
    }
    
    return jsonData.search_parameters;
  } catch (error) {
    console.error('Error loading search parameters:', error);
    throw error;
  }
}

// Clean job titles array (remove malformed JSON strings)
function cleanJobTitles(jobTitles) {
  if (!Array.isArray(jobTitles)) return [];
  
  return jobTitles.flatMap(title => {
    if (!title) return [];
    
    // Remove surrounding braces and quotes
    let cleaned = title.replace(/^[{"}]+|["}]+$/g, '');
    
    // Split on commas and clean each part
    return cleaned.split(',').map(t => t.trim()).filter(t => t.length > 0);
  });
}

// Process each search parameter group into individual combinations
function getSearchCombinations() {
  const searchParameterGroups = loadSearchParameterGroups();
  const combinations = [];
  
  for (let groupIndex = 0; groupIndex < searchParameterGroups.length; groupIndex++) {
    const group = searchParameterGroups[groupIndex];
    const { locations, job_titles, naics_codes } = group;
    
    // Skip groups with missing data or empty NAICS codes
    if (!locations?.length || !job_titles?.length || !naics_codes?.length) {
      continue;
    }
    
    const cleanedJobTitles = cleanJobTitles(job_titles);
    
    // Generate combinations within this specific group
    for (const location of locations) {
      for (const naicsCode of naics_codes) {
        for (const jobTitle of cleanedJobTitles) {
          combinations.push({
            groupIndex: groupIndex,
            location: location.trim(),
            naicsCode: naicsCode.naicsCode,
            naicsName: naicsCode.name,
            jobTitle: jobTitle.trim()
          });
        }
      }
    }
  }
  
  return combinations;
}

// Get count of valid search parameter groups
function getValidGroupCount() {
  const groups = loadSearchParameterGroups();
  return groups.filter(group => 
    group.locations?.length && 
    group.job_titles?.length && 
    group.naics_codes?.length
  ).length;
}

module.exports = {
  loadSearchParameterGroups,
  getSearchCombinations,
  getValidGroupCount,
  cleanJobTitles
};