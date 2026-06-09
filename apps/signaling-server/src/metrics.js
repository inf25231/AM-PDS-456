import os from 'node:os';

export function createServerMetrics() {
  let previousCpuUsage = process.cpuUsage();
  let previousSampleAt = process.hrtime.bigint();
  let latestCpuPercent = 0;

  function sampleCpuPercent() {
    const currentUsage = process.cpuUsage();
    const currentAt = process.hrtime.bigint();

    const elapsedMicros = Number(currentAt - previousSampleAt) / 1000;
    const deltaUser = currentUsage.user - previousCpuUsage.user;
    const deltaSystem = currentUsage.system - previousCpuUsage.system;
    const deltaCpuMicros = deltaUser + deltaSystem;
    const cpuCount = Math.max(1, os.cpus().length);

    if (elapsedMicros > 0) {
      latestCpuPercent = Math.max(
        0,
        Math.min(100, (deltaCpuMicros / (elapsedMicros * cpuCount)) * 100)
      );
    }

    previousCpuUsage = currentUsage;
    previousSampleAt = currentAt;
  }

  sampleCpuPercent();
  const timer = setInterval(sampleCpuPercent, 5000);
  timer.unref?.();

  function getSnapshot() {
    const memory = process.memoryUsage();

    return {
      uptimeSec: Math.round(process.uptime()),
      cpuPercent: Number(latestCpuPercent.toFixed(2)),
      memory: {
        rssMb: Number((memory.rss / 1024 / 1024).toFixed(2)),
        heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotalMb: Number((memory.heapTotal / 1024 / 1024).toFixed(2)),
        externalMb: Number((memory.external / 1024 / 1024).toFixed(2))
      },
      system: {
        cpus: os.cpus().length,
        loadAvg1m: Number(os.loadavg()[0]?.toFixed(3) || 0),
        freeMemMb: Number((os.freemem() / 1024 / 1024).toFixed(2)),
        totalMemMb: Number((os.totalmem() / 1024 / 1024).toFixed(2))
      }
    };
  }

  function stop() {
    clearInterval(timer);
  }

  return {
    getSnapshot,
    stop
  };
}

