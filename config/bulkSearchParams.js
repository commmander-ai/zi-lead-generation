// Create new bulk search params module
const fs = require('fs');
const path = require('path');

// JSON file containing the expanded parameter object
const PARAMS_FILE = path.join(__dirname, '../data/expanded_parameters.json');

/**
 * Load the expanded parameters JSON.
 * Expected structure:
 * {
 *    "states": [ { "Name": "Alabama", ... } ],
 *    "unique_naics_codes": [ { "naicsCode": "23", "name": "Construction" }, ... ],
 *    "unique_job_titles": [ "Operations Manager", ... ]
 * }
 */
function loadBulkParameters() {
  try {
    const raw = fs.readFileSync(PARAMS_FILE, 'utf8');
    const json = JSON.parse(raw);

    if (!json.states || !json.unique_naics_codes || !json.unique_job_titles) {
      throw new Error('Invalid expanded parameters JSON structure');
    }

    return json;
  } catch (err) {
    console.error('Failed to load bulk search parameters:', err);
    throw err;
  }
}

// Re-use the existing job-title cleaning util from original module if available
function cleanJobTitles(jobTitles) {
  if (!Array.isArray(jobTitles)) return [];
  return jobTitles
    .map(t => (t || '').toString().trim())
    .filter(Boolean)
    .map(t => {
      // Strip any stray braces/quotes leftover from malformed strings
      return t.replace(/^[{"}]+|["}]+$/g, '').trim();
    })
    .flatMap(t => t.split(',').map(s => s.trim()).filter(Boolean));
}

function getSearchCombinations() {
  const { states, unique_naics_codes: naicsCodes, unique_job_titles } = loadBulkParameters();

  const cleanedJobTitles = cleanJobTitles(unique_job_titles);

  const combinations = [];

  // Order: naicsCode (outer), then state, then job title (innermost)
  for (const naics of naicsCodes) {
    for (const state of states) {
      for (const jobTitle of cleanedJobTitles) {
        combinations.push({
          location: state.Name.trim(),
          naicsCode: naics.naicsCode,
          naicsName: naics.name || '',
          jobTitle: jobTitle,
          groupIndex: 0 // single group in bulk mode
        });
      }
    }
  }

  return combinations;
}

function getValidGroupCount() {
  // Only one conceptual group in bulk mode
  return 1;
}

module.exports = {
  getSearchCombinations,
  getValidGroupCount,
  cleanJobTitles
}; 