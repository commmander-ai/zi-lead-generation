# Claude Code Documentation - ZoomInfo VM Lead Generation

## Project Overview

This repository is a **VM-deployable ZoomInfo lead generation system** designed to run continuously on a virtual machine. It was created as a variation of the existing `~/commander/commander-lead-generation` repository but with significant architectural changes for VM deployment.

### Key Differences from Original System

| Original System | New VM System |
|---|---|
| PostgreSQL database storage | File-based CSV storage |
| Industry code targeting | **NAICS code targeting** |
| Contact-level deduplication | **Company-only deduplication** |
| Interactive task management | Finite loop with resume capability |
| Local file export | Direct bucket upload |

## Core Requirements

The system must:
1. **Check for duplicate companies** using zi-id lists stored in bucket (`existing_ziids.csv`)
2. **Store results in bucket** as CSV files
3. **Use NAICS codes** instead of ZoomInfo industry codes
4. **Process all combinations** of states + NAICS codes + job titles
5. **Resume after interruptions** using file-based state management
6. **Run on VM** without database dependencies

## Architecture

```
services/
├── zoomInfoService.js     # API client with file-based token storage
├── bucketService.js       # GCS operations for exclusions/results  
├── stateManager.js        # File-based state for resume capability
└── leadProcessor.js       # Main orchestration (processes all combinations)

utils/
└── csvWriter.js          # CSV generation for companies/contacts

config/
└── searchParams.js       # Target states, NAICS codes, job titles

data/                     # Local state and temp files
├── vm-state.json        # Resume state
├── zi-token.json        # Cached JWT token
└── csv/                 # Generated CSV files before upload
```

## Key Files to Understand

### Core Services
- **`services/leadProcessor.js:35-65`** - Main combination processing loop
- **`services/bucketService.js:25-45`** - Company zi-id exclusion checking
- **`services/stateManager.js:45-70`** - Resume state management
- **`services/zoomInfoService.js:140-160`** - NAICS to ZoomInfo industry mapping

### Configuration
- **`config/searchParams.js`** - Contains placeholder arrays for:
  - `TARGET_STATES` (US state abbreviations)
  - `TARGET_NAICS_CODES` (NAICS industry codes)
  - `TARGET_JOB_TITLES` (executive/manager titles)

## Bucket Configuration

**Important**: The bucket uses the same location throughout, with the exclusion file at:
- **File**: `existing_ziids.csv` (NOT in a subdirectory)
- **Format**: CSV file with company zi-ids
- **Same bucket**: Used for both exclusions and results storage

## Current Status

### ✅ Production System (Fully Operational)
1. **Authentication System** - Automatic 40-minute JWT token refresh implemented ✅
2. **Contact Search Pipeline** - Fixed authentication issues, now successfully finding contacts ✅  
3. **Pagination Logic** - Fixed 400 "page too high" errors with intelligent termination ✅
4. **Contact Requirements** - Relaxed from restrictive AND logic to permissive OR logic ✅
5. **CSV Structure** - Updated with separate State and Metro Region columns ✅
6. **Error Handling** - Robust handling of 400/500 API errors with graceful continuation ✅
7. **Bucket Operations** - Working exclusion list management and results upload ✅
8. **State Management** - Resume capability for long-running VM deployment ✅
9. **Company Search** - Fully functional with proper deduplication ✅
10. **Contact Enrichment** - Fixed API format and data extraction ✅

### 🚀 **SYSTEM DEPLOYED TO PRODUCTION VM**
**System is live and running** - All issues resolved, authentication stable, contact discovery optimized with 10x expanded job titles.

### 📋 System Configuration

**Search Parameters (from extracted_parameters.json):**
- **26 Parameter Groups**: Grouped combinations instead of all-possible combinations
- **2,585 Total Combinations**: Across all groups with enhanced job titles
- **Various Locations**: Mix of US states and metro regions (e.g., "California" vs "CA - San Francisco")
- **169 NAICS Codes**: Direct integration with ZoomInfo API
- **Enhanced Job Titles**: 10x expansion with specific roles + umbrella terms ("Operations", "Manager", "Director")

**Authentication & API:**
- **Automatic Token Refresh**: Every 40 minutes to prevent authentication failures
- **Contact Search**: Relaxed requirements (email OR phone OR mobile) instead of restrictive AND logic
- **Rate Limiting**: 100ms delay between API calls with intelligent retry logic
- **Error Recovery**: Continues processing after 400/500 errors with proper pagination termination

**CSV Output Structure:**
- **Separate State/Metro Region Columns**: Proper location data segregation
- **Contact Information**: Email, phone, mobile phone with OR logic filtering
- **Company Data**: ZoomInfo ID, name, state, metro region, NAICS, website, phone, contact count
- **Contact Data**: Full contact details with company association and location fields

**Environment Setup:**
- ZoomInfo API credentials configured with working authentication
- Google Cloud Storage service account configured  
- Bucket: `commander-ai-staging-assets`
- Exclusion file: `zi-backups/existing_ziids.csv` (56,724+ companies)
- Results stored in: `zi-backups/results/`

**Currently Deployed:**
```bash
# System is running live on VM
# Successfully finding and saving contacts to bucket
# Contact discovery rate significantly improved with expanded job titles
```

## Parameter Structure

### JSON Configuration Format
The system now uses `data/extracted_parameters.json` with 26 search parameter groups:

```json
{
  "search_parameters": [
    {
      "locations": ["CO - Denver"],
      "job_titles": ["{\"Project managers", "site supervisor", "business owner\"}"],
      "naics_codes": [
        {"naicsCode": "236118", "name": "Residential Remodelers"},
        {"naicsCode": "23622", "name": "Commercial and Institutional Building Construction"}
      ]
    }
  ]
}
```

### Location Types & CSV Structure
- **States**: "California", "Nevada", "Georgia" → Uses `state` API field → Populates `State` CSV column
- **Metro Regions**: "CA - San Francisco", "TX - Dallas" → Uses `metroRegion` API field → Populates `Metro Region` CSV column  
- **Auto-detection**: Based on presence of " - " or ", " in location string
- **CSV Output**: Separate columns for State and Metro Region (one populated, other blank per record)

### Job Title Cleaning
- Removes malformed JSON artifacts: `{"`, `"}`, `{`, `}`
- Splits comma-separated titles within malformed JSON strings
- Results in clean job titles for ZoomInfo API

## Technical Implementation Details

### Authentication System ✅
- **Automatic JWT Token Refresh**: Every 40 minutes to prevent authentication failures
- **Token Caching**: File-based storage with expiration checking
- **Graceful Cleanup**: Proper service shutdown with timer cleanup
- **Error Recovery**: Handles 401 errors with automatic token refresh

### Contact Search Strategy ✅
- **Relaxed Requirements**: Uses OR logic (email OR phone OR mobile) instead of restrictive AND logic
- **No RequiredFields Restriction**: Removed overly restrictive API parameters  
- **Post-Search Filtering**: Filters contacts after enrichment for maximum flexibility
- **Contact Enrichment**: Proper `matchPersonInput` format with comprehensive output fields

### Pagination Logic ✅
- **Intelligent Termination**: Detects "page too high" errors and stops pagination gracefully
- **Consecutive Empty Page Detection**: Stops after 3 consecutive pages with no new companies
- **Error Handling**: Continues processing after 400/500 errors with proper logging

### NAICS Code Integration ✅
- **Direct API Integration**: ZoomInfo API accepts NAICS codes directly via `naicsCodes` parameter
- **No Mapping Required**: NAICS codes passed as strings to ZoomInfo
- **Streamlined Processing**: Removed unnecessary mapping functions

### Deduplication Strategy ✅
- **Company-level Deduplication**: If company is new, process all contacts
- **In-Memory Exclusion Set**: Downloads 56,724+ zi-ids for O(1) lookup performance
- **Dynamic Updates**: Adds newly processed company IDs to exclusion list
- **Bucket Synchronization**: Updates exclusion file in bucket after each batch

### State Management ✅
- **Auto-save**: Every 30 seconds to `data/vm-state.json`
- **Indexed Tracking**: Tracks `currentCombinationIndex` + page number for precise resume
- **Graceful Recovery**: Supports resume from any interruption point
- **Progress Reporting**: Real-time progress calculation and logging

### Error Handling Strategy ✅
- **Robust Continuation**: System continues processing after API errors (400/500)
- **Comprehensive Logging**: Detailed error logging without breaking operation
- **VM-Optimized**: Designed for unattended long-running deployment
- **Fail-Safe CSV Operations**: Handles null file uploads gracefully

## Bucket Structure & CSV Format

### Bucket Organization
```
bucket/
└── zi-backups/
    ├── existing_ziids.csv              # Company zi-ids for exclusion (56,724+ entries)
    └── results/
        ├── companies-YYYY-MM-DD-HH-MM.csv # Generated company results
        └── contacts-YYYY-MM-DD-HH-MM.csv  # Generated contact results
```

### CSV Output Format

**Companies CSV:**
```
ZoomInfo ID | Company Name | State | Metro Region | NAICS Code | Website | Phone | Contact Count | Date Found
13762718    | Fabco Auto   | California |              | 488510     |         |       | 0             | 7/15/2025
355211267   | MyExpress    |            | CA - San Francisco | 488510 |         |       | 0             | 7/15/2025
```

**Contacts CSV:**
```
Contact ZoomInfo ID | Company ZoomInfo ID | Company Name | Contact Name | Job Title | Email | Phone | Mobile Phone | State | Metro Region | NAICS Code | Date Found
3809411641         | 132677707           | FIRST ONSITE | Jose Limongi | Project Director | jose.limongi@firstonsite.com | | (682) 261-4211 | | CO - Denver | 236118 | 7/15/2025
```

**Location Logic:**
- **State entries**: State column populated, Metro Region blank
- **Metro Region entries**: Metro Region populated, State column blank
- **Auto-detection**: Based on " - " or ", " patterns in location string

## Dependencies

```json
{
  "@google-cloud/storage": "^7.7.0",
  "axios": "^1.6.2", 
  "csv-writer": "^1.6.0",
  "dotenv": "^16.3.1",
  "winston": "^3.11.0"
}
```

## Original System Reference

The original system is at `~/commander/commander-lead-generation` and can be referenced for:
- ZoomInfo API patterns (`services/zoominfo.js`)
- Industry code examples
- Rate limiting strategies (`utils/rateLimitMonitor.js`)
- Database models for understanding data structure

## User's Original Request Context

User needs this for **VM deployment to run day and night** fetching ZoomInfo contacts/companies with:
- Different input parameters (new industry sectors, locations, job titles)
- De-duplication based on company zi-id lists in `existing_ziids.csv`
- Bucket storage in appropriate format
- Resume capability for long-running processes

The system will process a finite but very large number of combinations (states × NAICS × job titles), likely taking days/weeks to complete, so interruption and resume capability is critical.

## Key Implementation Changes Made

### ✅ Bucket Service Updates
- **Fixed**: Updated `services/bucketService.js` to use `existing_ziids.csv` from bucket root
- **Fixed**: Handles CSV format with header detection and comma removal
- **Fixed**: Proper file paths and bucket operations

### ✅ Search Parameter Integration  
- **Updated**: `config/searchParams.js` to load from `data/extracted_parameters.json`
- **Added**: 26 curated search parameter groups with specific combinations
- **Added**: Location type detection (states vs metro regions)
- **Added**: Job title cleaning to handle malformed JSON strings
- **Added**: Grouped combination processing instead of all-possible-combinations

### ✅ ZoomInfo API Integration
- **Updated**: `services/leadProcessor.js` to use correct API field names
- **Fixed**: Uses `state` field for states, `metroRegion` field for metro areas
- **Updated**: Processes indexed combinations instead of nested loops
- **Updated**: State management tracks `currentCombinationIndex`
- **Confirmed**: Correct API sequence: companies (NAICS+location) → contacts (jobTitle+companyId)

## Quick Start Commands

```bash
# Navigate to project
cd ~/commander/zi-lead-generation

# Install dependencies  
npm install

# Configure environment
cp .env.example .env
# Edit .env with credentials

# Update search parameters
# Edit config/searchParams.js with real data

# Fix bucket service for existing_ziids.csv

# Test configuration
npm start
```

## Production Readiness Checklist

### ✅ **Core System Components**
- [x] **ZoomInfo Authentication** - JWT token refresh every 40 minutes
- [x] **Google Cloud Storage** - Bucket access and file operations working
- [x] **Company Search** - Location detection, NAICS integration, pagination
- [x] **Contact Search** - Relaxed requirements, proper API format
- [x] **Contact Enrichment** - Fixed API calls and data extraction
- [x] **CSV Generation** - Separate State/Metro Region columns
- [x] **State Management** - Resume capability and progress tracking
- [x] **Error Handling** - Graceful continuation after API errors
- [x] **Bucket Operations** - Exclusion list management and results upload

### ✅ **Data Processing Pipeline**
- [x] **Search Parameters** - 2,585 combinations loaded from JSON
- [x] **Company Deduplication** - 56,724+ existing companies excluded
- [x] **Location Handling** - Auto-detection of states vs metro regions  
- [x] **Job Title Cleaning** - Malformed JSON strings processed
- [x] **NAICS Integration** - Direct API parameter usage
- [x] **Pagination Logic** - Intelligent termination on errors
- [x] **Contact Filtering** - OR logic for email/phone/mobile

### ✅ **Testing & Validation**
- [x] **End-to-End Testing** - Complete pipeline tested successfully
- [x] **Authentication Testing** - Token refresh and API access verified
- [x] **Contact Discovery** - System now finding contacts successfully
- [x] **Error Recovery** - Handles 400/500 errors gracefully  
- [x] **CSV Output** - Proper format with location segregation
- [x] **Resume Functionality** - Interruption and restart capability verified

### 🚀 **Production Deployment Status**
**System is fully operational and ready for production VM deployment**

## Scale Estimates & Performance

**Total Combinations**: **2,585 curated combinations** from 26 parameter groups

**Expected Processing Time**: 
- At 100ms rate limit delay + API time: ~4-7 hours continuous operation  
- Significantly reduced from original 592K combinations
- Resume capability available for reliability
- **✅ System fully operational and processing contacts**

**Performance Characteristics:**
- **Company Processing**: ~50 companies per page, intelligent pagination termination
- **Contact Discovery**: Now finding contacts with relaxed requirements
- **Deduplication**: O(1) lookup against 56,724+ existing companies
- **Error Recovery**: Graceful handling of API rate limits and server errors
- **Memory Usage**: Efficient state management and CSV streaming

## Recent System Improvements

### ✅ **Authentication Fixes**
- **JWT Token Management**: Automatic 40-minute refresh prevents authentication failures
- **Error Recovery**: Handles 401 errors with automatic token renewal
- **Token Caching**: File-based storage with proper expiration handling

### ✅ **Contact Pipeline Fixes**
- **Relaxed Requirements**: Changed from AND logic (email+phone+mobile) to OR logic
- **API Format**: Fixed contact enrichment with proper `matchPersonInput` structure
- **Data Extraction**: Corrected response parsing for enriched contact data
- **Error Handling**: Graceful handling of contact search failures

### ✅ **CSV Structure Enhancement**
- **Location Segregation**: Separate State and Metro Region columns
- **Auto-Detection**: Smart location type detection based on format patterns
- **Complete Data**: All contact fields properly mapped and exported
- **Null Handling**: Safe handling of empty contact files

### ✅ **System Reliability**
- **Pagination Logic**: Fixed 400 "page too high" errors with intelligent termination
- **Error Continuation**: System continues after API errors instead of crashing
- **State Persistence**: Robust resume capability for long-running processes
- **Logging**: Comprehensive debug information for troubleshooting

### ✅ **Job Title Optimization (2025-07-16)**
- **Massive Expansion**: Increased job titles from ~8 to ~70 per combination (10x growth)
- **Specific Variations**: Added role variations (e.g., "Senior Project Manager", "Construction Project Manager")
- **Umbrella Terms**: Added broad terms like "Operations", "Manager", "Director", "Project" for wider coverage
- **Strategic Balance**: Maintained industry relevance while maximizing contact discovery potential
- **Production Impact**: Significantly improved contact hit rates in live deployment