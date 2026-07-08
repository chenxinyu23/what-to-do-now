class TaskAnalysisProvider {
  async analyze() {
    throw new Error("TaskAnalysisProvider.analyze must be implemented");
  }
}

module.exports = { TaskAnalysisProvider };
