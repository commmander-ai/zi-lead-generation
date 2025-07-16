const fs = require('fs').promises;
const path = require('path');

class StateManager {
  constructor(logger) {
    this.logger = logger;
    this.stateFile = path.join(__dirname, '../data/vm-state.json');
    this.state = {
      currentStateIndex: 0,
      currentNaicsIndex: 0,
      currentJobTitleIndex: 0,
      currentPage: 1,
      processedCompanies: 0,
      processedContacts: 0,
      startTime: null,
      lastSaveTime: null,
      completed: false
    };
    
    // Auto-save every 30 seconds
    this.autoSaveInterval = setInterval(() => {
      this.saveState();
    }, 30000);
  }

  async loadState() {
    try {
      const stateData = await fs.readFile(this.stateFile, 'utf8');
      this.state = { ...this.state, ...JSON.parse(stateData) };
      this.logger.info('State loaded successfully', {
        currentStateIndex: this.state.currentStateIndex,
        currentNaicsIndex: this.state.currentNaicsIndex,
        processedCompanies: this.state.processedCompanies,
        processedContacts: this.state.processedContacts
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.info('No previous state found, starting fresh');
        this.state.startTime = new Date().toISOString();
      } else {
        this.logger.error('Error loading state:', error);
        throw error;
      }
    }
  }

  async saveState() {
    try {
      this.state.lastSaveTime = new Date().toISOString();
      const stateDir = path.dirname(this.stateFile);
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
      this.logger.debug('State saved successfully');
    } catch (error) {
      this.logger.error('Error saving state:', error);
    }
  }

  updateProgress(updates) {
    Object.assign(this.state, updates);
  }

  getCurrentState() {
    return { ...this.state };
  }

  markCompleted() {
    this.state.completed = true;
    this.state.completedTime = new Date().toISOString();
    this.saveState();
  }

  async cleanup() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    await this.saveState();
  }

  // Progress tracking methods
  getProgressPercentage(totalStates, totalNaics, totalJobTitles) {
    const totalCombinations = totalStates * totalNaics * totalJobTitles;
    const currentCombination = (this.state.currentStateIndex * totalNaics * totalJobTitles) +
                              (this.state.currentNaicsIndex * totalJobTitles) +
                              this.state.currentJobTitleIndex;
    return (currentCombination / totalCombinations) * 100;
  }

  getEstimatedTimeRemaining(totalStates, totalNaics, totalJobTitles) {
    if (!this.state.startTime) return null;
    
    const elapsed = Date.now() - new Date(this.state.startTime).getTime();
    const progress = this.getProgressPercentage(totalStates, totalNaics, totalJobTitles);
    
    if (progress === 0) return null;
    
    const totalEstimated = elapsed / (progress / 100);
    const remaining = totalEstimated - elapsed;
    
    return Math.max(0, remaining);
  }
}

module.exports = StateManager;