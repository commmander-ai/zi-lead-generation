# ZoomInfo VM Lead Generation

A VM-deployable ZoomInfo lead generation system with NAICS code targeting, bucket-based storage, and company-level deduplication.

## Features

- **NAICS Code Targeting**: Uses NAICS codes instead of industry categories for precise targeting
- **Company-Level Deduplication**: Checks against bucket-stored company zi-ids to avoid duplicates
- **Bucket Storage**: Direct CSV export to Google Cloud Storage buckets
- **Resume Capability**: File-based state management for handling interruptions
- **VM Optimized**: No database dependencies, simplified error handling
- **Comprehensive Coverage**: Processes all state + NAICS + job title combinations

## Architecture

```
├── config/           # Search parameters configuration
├── services/         # Core business logic
│   ├── zoomInfoService.js    # ZoomInfo API client
│   ├── bucketService.js      # Google Cloud Storage operations
│   ├── stateManager.js       # File-based state management
│   └── leadProcessor.js      # Main processing orchestrator
├── utils/           # Utilities
│   └── csvWriter.js         # CSV file generation
├── data/            # Local state and temporary files
│   ├── vm-state.json       # Resume state
│   ├── zi-token.json       # Cached JWT token
│   └── csv/               # Generated CSV files
└── logs/            # Application logs
```

## Bucket Structure

```
bucket/
├── exclusions/
│   └── company-zi-ids.txt        # One zi-id per line for deduplication
├── results/
│   ├── companies-YYYY-MM-DD-HH-MM.csv
│   └── contacts-YYYY-MM-DD-HH-MM.csv
└── state/                        # Optional: remote state backup
```

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Required Environment Variables**
   ```bash
   # ZoomInfo API
   ZOOMINFO_USERNAME=your_username
   ZOOMINFO_PASSWORD=your_password
   
   # Google Cloud Storage
   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
   GCS_BUCKET_NAME=your-bucket-name
   
   # Search Configuration
   TARGET_STATES=CA,TX,NY,FL,IL
   TARGET_NAICS_CODES=541511,541512,541513
   TARGET_JOB_TITLES=ceo,president,vice president
   ```

4. **Update Search Parameters**
   - Edit `config/searchParams.js` with your target:
     - US states
     - NAICS codes
     - Job titles

## Usage

### Start Processing
```bash
npm start
```

### Monitor Progress
The system logs progress including:
- Current combination being processed
- Completion percentage
- Companies/contacts found
- Time estimates

### Resume After Interruption
The system automatically resumes from where it left off using `data/vm-state.json`.

## Deduplication Strategy

### Company-Level Only
- Downloads `exclusions/company-zi-ids.txt` from bucket at startup
- Filters out companies already in exclusion list
- Assumes all contacts from new companies are new (no contact-level checking)
- Updates exclusion list with newly processed company zi-ids

### Benefits
- **Performance**: Eliminates expensive contact-level duplicate checking
- **Simplicity**: Single exclusion list to manage
- **Scalability**: Memory-efficient Set-based lookups

## File Outputs

### Companies CSV
- ZoomInfo ID, Company Name, State, NAICS Code
- Website, Phone, Contact Count, Date Found

### Contacts CSV  
- Contact ZoomInfo ID, Company ZoomInfo ID, Company Name
- Contact Name, Job Title, Email, Phone, Mobile Phone
- State, NAICS Code, Date Found

## Error Handling

- **API Failures**: Automatic retry with exponential backoff
- **Rate Limits**: Intelligent delay and retry-after header handling
- **Token Expiry**: Automatic JWT refresh and caching
- **Processing Errors**: Skip failed items and continue (logged for review)

## VM Deployment Considerations

1. **Memory**: System loads company exclusion list into memory
2. **Storage**: Generates local CSV files before upload (ensure disk space)
3. **Network**: Requires stable internet for API calls and bucket operations
4. **Monitoring**: Check logs for progress and error status
5. **Interruption**: Safe to stop/start - will resume automatically

## Performance

- **Rate Limiting**: Respects ZoomInfo API limits (25 req/sec)
- **Batch Processing**: Configurable batch sizes for optimal throughput
- **Parallel Operations**: Concurrent bucket uploads when possible
- **Memory Efficient**: Streams large datasets rather than loading entirely

## Monitoring

### Key Metrics
- Progress percentage and ETA
- Companies/contacts processed counts
- API rate limit status
- Error rates and types

### Log Files
- `logs/combined.log`: All activity
- `logs/error.log`: Errors only
- Console: Real-time progress updates

## Maintenance

### Updating Search Parameters
1. Edit `config/searchParams.js`
2. Update environment variables
3. Restart the process (will resume from current state)

### Managing Exclusions
- Company exclusion list automatically updated during processing
- Manual additions: append zi-ids to `exclusions/company-zi-ids.txt` in bucket

### State Management
- State file: `data/vm-state.json`
- Reset progress: Delete state file to start fresh
- Backup state: Copy state file before major changes