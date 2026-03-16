const jobs = new Map();

function createJob(id, data) {
  const job = {
    id,
    status: 'pending',
    progress: 0,
    logs: [],
    result: null,
    startTime: Date.now(),
    ...data
  };
  jobs.set(id, job);
  return job;
}

function updateJob(id, updates) {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, updates);
    if (updates.log) {
      job.logs.push({ timestamp: new Date().toISOString(), message: updates.log });
    }
  }
}

function getJob(id) {
  return jobs.get(id);
}

module.exports = {
  createJob,
  updateJob,
  getJob
};
