'use strict';
const { parseArgs } = require('node:util');
const { readFileSync, writeFileSync, unlinkSync, mkdirSync, renameSync } = require('node:fs');
const { spawnSync, spawn } = require('node:child_process');
const { hostname, networkInterfaces, release, homedir } = require('node:os');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { get: httpGet } = require('node:http');
const { get: httpsGet } = require('node:https');

// ── executor ─────────────────────────────────────────────────────────────────
const ALLOWED_COMMANDS = ['restic', 'systemctl', 'df', 'hostname', 'uname', 'docker', 'ss', 'netstat', 'mount', 'umount'];

function execAllowed(cmd, args, env, timeoutMs) {
  if (!ALLOWED_COMMANDS.includes(cmd)) {
    return Promise.reject(new Error('Command not in allowlist: ' + cmd));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (code) => { if (!done) { done = true; resolve({ exitCode: code != null ? code : 1, stdout, stderr }); } };
    const timer = timeoutMs ? setTimeout(() => { try { child.kill(); } catch (_) {} finish(1); }, timeoutMs) : null;
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); finish(code); });
    child.on('error', (e) => { if (timer) clearTimeout(timer); done ? undefined : reject(e); });
  });
}

// ── metrics ───────────────────────────────────────────────────────────────────
function readCpuTimes() {
  const stat = readFileSync('/proc/stat', 'utf-8');
  const line = (stat.split('\n')[0] || '').replace(/^cpu\s+/, '');
  const nums = line.split(' ').map(Number);
  const idle = (nums[3] || 0) + (nums[4] || 0);
  const total = nums.reduce((a, b) => a + b, 0);
  return [idle, total];
}

async function getCpuPercent() {
  const [idle1, total1] = readCpuTimes();
  await new Promise(r => setTimeout(r, 200));
  const [idle2, total2] = readCpuTimes();
  const totalDiff = total2 - total1;
  if (totalDiff === 0) return 0;
  return Math.round((1 - (idle2 - idle1) / totalDiff) * 100);
}

function getMemInfo() {
  const mem = readFileSync('/proc/meminfo', 'utf-8');
  const parse = (key) => {
    const m = mem.match(new RegExp(key + ':\\s+(\\d+)'));
    return m ? parseInt(m[1] || '0', 10) * 1024 : 0;
  };
  const total = parse('MemTotal');
  const free = parse('MemFree');
  const buffers = parse('Buffers');
  const cached = parse('Cached');
  return { totalBytes: total, usedBytes: total - free - buffers - cached };
}

function getDiskInfo() {
  const usedBytes = {};
  const totalBytes = {};
  try {
    const result = spawnSync('df', ['-B1', '--output=target,size,used'], { encoding: 'utf-8' });
    const out = result.stdout || '';
    for (const line of out.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const mount = parts[0];
      const size  = parts[1];
      const used  = parts[2];
      if (!mount || !size || !used || !mount.startsWith('/')) continue;
      totalBytes[mount] = parseInt(size, 10);
      usedBytes[mount]  = parseInt(used, 10);
    }
  } catch (_) { /* ignore on non-Linux */ }
  return { usedBytes, totalBytes };
}

function getUptimeSeconds() {
  try {
    return parseFloat((readFileSync('/proc/uptime', 'utf-8').split(' ')[0]) || '0');
  } catch (_) {
    return 0;
  }
}

async function collectMetrics() {
  const [cpuPercent, mem, disk] = await Promise.all([
    getCpuPercent(),
    Promise.resolve(getMemInfo()),
    Promise.resolve(getDiskInfo()),
  ]);
  return {
    cpuPercent,
    memUsedBytes:   mem.usedBytes,
    memTotalBytes:  mem.totalBytes,
    diskUsedBytes:  disk.usedBytes,
    diskTotalBytes: disk.totalBytes,
    uptimeSeconds:  getUptimeSeconds(),
  };
}

// ── config ────────────────────────────────────────────────────────────────────
const CONFIG_DIR  = join(homedir(), '.config', 'backupos-agent');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (_) {
    throw new Error('No config found. Run: node agent.js enroll --url URL --token TOKEN');
  }
}

function writeConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ── self-update ───────────────────────────────────────────────────────────────
function selfHash() {
  try {
    return createHash('sha256').update(readFileSync(__filename)).digest('hex');
  } catch (_) { return ''; }
}

function selfUpdate(serverUrl) {
  return new Promise((resolve, reject) => {
    const base = serverUrl.replace(/\/$/, '');
    const url  = base + '/agent/bundle.js';
    const get  = url.startsWith('https') ? httpsGet : httpGet;
    const tmp  = __filename + '.tmp';
    get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          writeFileSync(tmp, Buffer.concat(chunks));
          renameSync(tmp, __filename);
          console.log('[agent] Bundle updated. Restarting...');
          resolve();
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ── agent (ws) ────────────────────────────────────────────────────────────────
const METRICS_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS   = 2_000;
const RECONNECT_MAX_MS    = 60_000;
const AGENT_VERSION       = '0.1.0';

function startAgent(config) {
  let reconnectDelay = RECONNECT_BASE_MS;
  let metricsTimer   = null;
  let pingTimer      = null;

  function connect() {
    const base  = config.serverUrl.replace(/\/$/, '');
    const wsUrl = base.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/ws/agent';
    const ws    = new WebSocket(wsUrl);

    function send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }

    ws.onopen = () => {
      reconnectDelay = RECONNECT_BASE_MS;
      const nets = networkInterfaces();
      let ip = '0.0.0.0';
      for (const ifaces of Object.values(nets)) {
        const found = (ifaces || []).find(i => !i.internal && i.family === 'IPv4');
        if (found) { ip = found.address; break; }
      }
      send({
        type: 'hello', token: config.token,
        hostname: hostname(), ip,
        osInfo: { os: 'linux', arch: process.arch, kernel: release() },
        agentVersion: AGENT_VERSION, platform: 'linux',
      });
      pingTimer = setInterval(() => send({ type: 'ping' }), 30_000);
    };

    ws.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }

      if (msg.type === 'welcome') {
        console.log('[agent] Connected as ' + msg.agentId);
        const myHash = selfHash();
        console.log('[agent] bundleHash server=' + (msg.bundleHash || 'none') + ' self=' + myHash);
        if (msg.bundleHash && msg.bundleHash !== myHash) {
          console.log('[agent] New bundle available — updating...');
          try {
            await selfUpdate(config.serverUrl);
            process.exit(0); // systemd will restart with the new bundle
          } catch (e) {
            console.error('[agent] Self-update failed:', e.message);
          }
        }
        if (metricsTimer) clearInterval(metricsTimer);
        const sendMetrics = async () => { send({ type: 'metrics', metrics: await collectMetrics() }); };
        await sendMetrics();
        metricsTimer = setInterval(() => { sendMetrics().catch(console.error); }, METRICS_INTERVAL_MS);
        mountAllOnStartup().catch(e => console.warn('[agent] startup mount error:', e.message));
        startCleanupTimer();
      } else if (msg.type === 'run_backup') {
        await handleBackup(msg.jobId, msg.config, send);
      } else if (msg.type === 'list_resources') {
        console.log('[agent] list_resources received requestId=' + msg.requestId);
        try {
          const resources = await detectResources();
          console.log('[agent] detectResources done:', JSON.stringify(resources));
          send({ type: 'resources_result', requestId: msg.requestId, resources });
          console.log('[agent] resources_result sent');
        } catch (e) {
          console.error('[agent] detectResources error:', e);
          send({ type: 'resources_result', requestId: msg.requestId, resources: {} });
        }
      } else if (msg.type === 'cancel_backup') {
        console.warn('[agent] cancel_backup not implemented for jobId=' + msg.jobId);
      } else if (msg.type === 'verify_repo') {
        await handleVerify(msg.repoId, msg.repoUrl, msg.repoPassword, msg.readData, msg.envVars);
      } else if (msg.type === 'test_repo') {
        await handleTestRepo(msg.requestId, msg.repoUrl, msg.repoPassword, msg.envVars, send);
      } else if (msg.type === 'test_mount') {
        await handleTestMount(msg.requestId, msg.mountConfig, send);
      } else if (msg.type === 'remove_mount') {
        await removeMount(msg.repoId, msg.mountPoint || `/mnt/backupos/${msg.repoId}`);
      } else if (msg.type === 'run_restore') {
        console.warn('[agent] run_restore not implemented for restoreId=' + msg.restoreId);
        send({ type: 'restore_complete', restoreId: msg.restoreId, success: false });
      }
    };

    ws.onclose = () => {
      if (pingTimer)    { clearInterval(pingTimer);    pingTimer    = null; }
      if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; }
      console.log('[agent] Disconnected. Reconnecting in ' + (reconnectDelay / 1000) + 's...');
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    };

    ws.onerror = (err) => { console.error('[agent] WebSocket error:', err); };
  }

  connect();
}

function runCmd(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let done = false;
    let child;
    const finish = (code) => {
      if (done) return;
      done = true;
      resolve({ exitCode: code ?? 1, stdout, stderr });
    };
    try {
      child = spawn(cmd, args, { stdio: 'pipe' });
      const timer = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch (_) {} resolve({ exitCode: 1, stdout, stderr }); } }, timeoutMs || 5000);
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => { clearTimeout(timer); finish(code); });
      child.on('error', () => { clearTimeout(timer); finish(1); });
    } catch (_) { finish(1); }
  });
}

async function detectResources() {
  const resources = {};

  // Docker volumes — query socket directly (avoids PATH/permission issues)
  try {
    const dockerVolumes = await new Promise((resolve, reject) => {
      const req = httpGet({ socketPath: '/var/run/docker.sock', path: '/volumes', headers: { Host: 'localhost' } }, (res) => {
        let data = '';
        res.on('data', d => { data += d; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve((parsed.Volumes || []).map(v => v.Name).filter(Boolean));
          } catch (e) { reject(e); }
        });
      });
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.end();
    });
    resources.dockerVolumes = dockerVolumes;
  } catch (e) { console.log('[agent] docker socket error:', e.message); }

  // Filesystem mount points from /proc/mounts (non-blocking file read)
  try {
    const mounts = readFileSync('/proc/mounts', 'utf-8');
    const interesting = new Set();
    for (const line of mounts.split('\n')) {
      const parts = line.split(' ');
      const device = parts[0];
      const mp = parts[1];
      if (!mp) continue;
      const skip = mp.startsWith('/snap/') || mp.startsWith('/var/lib/docker') ||
        mp.startsWith('/sys') || mp.startsWith('/proc') || mp.startsWith('/dev') ||
        mp.startsWith('/run') || mp.startsWith('/tmp');
      if (!skip && (
        (device && device.startsWith('/dev/')) ||
        mp === '/' ||
        mp.startsWith('/home') ||
        mp.startsWith('/var') ||
        mp.startsWith('/data') ||
        mp.startsWith('/mnt') ||
        mp.startsWith('/media') ||
        mp.startsWith('/srv')
      )) {
        interesting.add(mp);
      }
    }
    resources.mountPoints = [...interesting].sort();
  } catch (_) {}

  // Running databases via ss (with timeout)
  try {
    const r = await runCmd('ss', ['-tlnp'], 3000);
    const DB_PORTS = { 5432: 'postgresql', 3306: 'mysql', 6379: 'redis', 27017: 'mongodb', 1433: 'mssql' };
    const dbs = [];
    if (r.exitCode === 0) {
      for (const line of r.stdout.split('\n')) {
        for (const [port, type] of Object.entries(DB_PORTS)) {
          if (line.includes(':' + port + ' ') || line.includes(':' + port + '\t') || line.endsWith(':' + port)) {
            dbs.push({ type, host: 'localhost', port: Number(port) });
          }
        }
      }
    }
    if (dbs.length) resources.databases = dbs;
  } catch (_) {}

  return resources;
}

// ── persistent mount helpers (fstab-based, PBS-style) ─────────────────────────
const CREDS_DIR = '/etc/backupos/creds';

function readFstab() {
  try { return readFileSync('/etc/fstab', 'utf8'); } catch { return ''; }
}
function writeFstab(content) { writeFileSync('/etc/fstab', content, 'utf8'); }
function fstabTag(repoId) { return `# backupos:${repoId}`; }
function hasFstabEntry(repoId) { return readFstab().includes(fstabTag(repoId)); }

function addFstabEntry(repoId, line) {
  if (hasFstabEntry(repoId)) return;
  const fstab = readFstab();
  writeFstab(fstab + (fstab.endsWith('\n') ? '' : '\n') + fstabTag(repoId) + '\n' + line + '\n');
}

function removeFstabEntry(repoId) {
  const tag = fstabTag(repoId);
  const lines = readFstab().split('\n');
  const out = []; let skip = false;
  for (const l of lines) {
    if (l === tag) { skip = true; continue; }
    if (skip) { skip = false; continue; }
    out.push(l);
  }
  writeFstab(out.join('\n'));
}

function isMounted(mountPoint) {
  try {
    return readFileSync('/proc/mounts', 'utf8').split('\n')
      .some(l => l.split(' ')[1] === mountPoint);
  } catch { return false; }
}

function buildCredsFile(repoId, cfg) {
  mkdirSync(CREDS_DIR, { recursive: true });
  const p = `${CREDS_DIR}/${repoId}`;
  let content = `username=${cfg.username || ''}\npassword=${cfg.password || ''}`;
  if (cfg.domain) content += `\ndomain=${cfg.domain}`;
  writeFileSync(p, content, { mode: 0o600 });
  return p;
}

async function ensureMount(repoId, cfg) {
  mkdirSync(cfg.mountPoint, { recursive: true });
  if (isMounted(cfg.mountPoint)) return;

  if (!hasFstabEntry(repoId)) {
    if (cfg.type === 'nfs') {
      addFstabEntry(repoId,
        `${cfg.host}:${cfg.remotePath}\t${cfg.mountPoint}\tnfs\tsoft,timeo=50,_netdev\t0\t0`);
    } else {
      // SMB: probe versions, write winning version into fstab
      const credsPath = buildCredsFile(repoId, cfg);
      let mounted = false; let lastError = '';
      for (const vers of ['3.0', '2.1', '2.0', '1.0']) {
        const opts = `credentials=${credsPath},vers=${vers},_netdev`;
        const r = await execAllowed('mount', ['-t', 'cifs', `//${cfg.host}/${cfg.remotePath}`, cfg.mountPoint, '-o', opts], {}, 20000);
        if (r.exitCode === 0) {
          addFstabEntry(repoId,
            `//${cfg.host}/${cfg.remotePath}\t${cfg.mountPoint}\tcifs\tcredentials=${credsPath},vers=${vers},_netdev\t0\t0`);
          mounted = true; break;
        }
        lastError = r.stderr.trim() || r.stdout.trim() || `exit ${r.exitCode}`;
        if (!lastError.includes('Operation now in progress') && !lastError.includes('Protocol negotiation') && !lastError.includes('No dialect')) break;
      }
      if (!mounted) throw new Error('SMB mount failed: ' + lastError);
      return;  // already mounted during probe
    }
  }

  const r = await execAllowed('mount', [cfg.mountPoint], {}, 25000);
  if (r.exitCode !== 0) {
    const msg = r.stderr.trim() || r.stdout.trim() || `exit ${r.exitCode}`;
    if (!msg.toLowerCase().includes('already mounted')) throw new Error('Mount failed: ' + msg);
  }
}

async function removeMount(repoId, mountPoint) {
  await execAllowed('umount', ['-l', mountPoint], {}, 10000).catch(() => {});
  removeFstabEntry(repoId);
  try { unlinkSync(`${CREDS_DIR}/${repoId}`); } catch (_) {}
  try { require('node:fs').rmdirSync(mountPoint); } catch (_) {}
}

async function mountAllOnStartup() {
  for (const line of readFstab().split('\n')) {
    const m = line.match(/^# backupos:(.+)$/);
    if (!m) continue;
    const mountPoint = `/mnt/backupos/${m[1]}`;
    if (isMounted(mountPoint)) continue;
    mkdirSync(mountPoint, { recursive: true });
    const r = await execAllowed('mount', [mountPoint], {}, 25000);
    if (r.exitCode !== 0) {
      const msg = r.stderr.trim() || r.stdout.trim();
      if (msg && !msg.toLowerCase().includes('already mounted'))
        console.warn(`[agent] startup mount ${mountPoint} failed: ${msg}`);
    } else {
      console.log(`[agent] mounted ${mountPoint} on startup`);
    }
  }
}

function startCleanupTimer() {
  setInterval(async () => {
    for (const line of readFstab().split('\n')) {
      const m = line.match(/^# backupos:(.+)$/);
      if (!m) continue;
      const mountPoint = `/mnt/backupos/${m[1]}`;
      if (isMounted(mountPoint)) continue;
      console.log(`[agent] cleanup: remounting ${mountPoint}`);
      mkdirSync(mountPoint, { recursive: true });
      const r = await execAllowed('mount', [mountPoint], {}, 25000);
      if (r.exitCode !== 0)
        console.warn(`[agent] cleanup remount ${mountPoint} failed: ${r.stderr.trim() || r.stdout.trim()}`);
    }
  }, 60 * 60 * 1000);
}

async function ensureRepoInit(env) {
  const check = await execAllowed('restic', ['snapshots', '--json'], env, 15000);
  if (check.exitCode !== 0) {
    const init = await execAllowed('restic', ['init'], env, 30000);
    if (init.exitCode !== 0 && !init.stderr.includes('already initialized')) {
      throw new Error('restic init failed: ' + init.stderr.trim());
    }
  }
}

async function handleBackup(jobId, jobConfig, send) {
  const env = {
    RESTIC_REPOSITORY: jobConfig.repoUrl,
    RESTIC_PASSWORD:   jobConfig.repoPassword,
    ...(jobConfig.envVars || {}),
  };

  const mountCfg = jobConfig.mountConfig || null;
  if (mountCfg) {
    const repoId = require('node:path').basename(mountCfg.mountPoint);
    try {
      await ensureMount(repoId, mountCfg);
      await ensureRepoInit(env);
    } catch (err) {
      send({ type: 'backup_failed', jobId, error: String(err), detail: '', log: '' });
      return;
    }
  }

  const args = ['backup', '--json', ...jobConfig.paths];
  if (jobConfig.exclude) { for (const ex of jobConfig.exclude) args.push('--exclude', ex); }
  if (jobConfig.tags)    { for (const tag of jobConfig.tags)   args.push('--tag', tag); }

  send({ type: 'backup_start', jobId, config: jobConfig });
  try {
    const result = await execAllowed('restic', args, env);
    const log = [result.stdout, result.stderr].filter(Boolean).join('\n');
    if (result.exitCode !== 0) {
      send({ type: 'backup_failed', jobId, error: 'restic exited non-zero', detail: result.stderr, log });
      return;
    }
    const summaryLine = result.stdout.trim().split('\n').reverse()
      .find(l => l.includes('"message_type":"summary"'));
    const s = summaryLine ? JSON.parse(summaryLine) : {};
    send({
      type: 'backup_complete', jobId, log,
      snapshotId: s['snapshot_id'] || '',
      stats: {
        filesNew:            s['files_new']             || 0,
        filesChanged:        s['files_changed']         || 0,
        filesUnmodified:     s['files_unmodified']      || 0,
        dataAdded:           s['data_added']            || 0,
        totalFilesProcessed: s['total_files_processed'] || 0,
        totalBytesProcessed: s['total_bytes_processed'] || 0,
        durationSeconds:     s['total_duration']        || 0,
      },
    });
  } catch (err) {
    send({ type: 'backup_failed', jobId, error: String(err), detail: '', log: '' });
  }
}

async function handleVerify(repoId, repoUrl, repoPassword, readData, envVars) {
  const env = { RESTIC_REPOSITORY: repoUrl, RESTIC_PASSWORD: repoPassword, ...(envVars || {}) };
  const result = await execAllowed('restic', ['check', ...(readData ? ['--read-data'] : [])], env);
  console.log('[agent] verify_repo ' + repoId + ': exit=' + result.exitCode);
  if (result.exitCode !== 0) console.error('[agent] verify_repo stderr:', result.stderr);
}

async function handleTestMount(requestId, mountCfg, send) {
  const repoId = require('node:path').basename(mountCfg.mountPoint);
  try {
    await ensureMount(repoId, mountCfg);
    send({ type: 'test_mount_result', requestId, ok: true });
  } catch (err) {
    send({ type: 'test_mount_result', requestId, ok: false, error: String(err) });
  }
}

async function handleTestRepo(requestId, repoUrl, repoPassword, envVars, send) {
  const env = { RESTIC_REPOSITORY: repoUrl, RESTIC_PASSWORD: repoPassword, ...(envVars || {}) };
  let mountCfg = null;
  if (envVars && envVars['mountConfig']) {
    try { mountCfg = JSON.parse(envVars['mountConfig']); } catch (_) {}
  }
  try {
    if (mountCfg) {
      const repoId = require('node:path').basename(mountCfg.mountPoint);
      try {
        await ensureMount(repoId, mountCfg);
      } catch (err) {
        send({ type: 'test_repo_result', requestId, ok: false, error: String(err) });
        return;
      }
      await ensureRepoInit(env);
    }
    const result = await execAllowed('restic', ['snapshots', '--json'], env, 30000);
    if (result.exitCode !== 0) {
      const errMsg = result.stderr.trim() || result.stdout.trim() || 'Connection timed out — check host reachability and credentials';
      send({ type: 'test_repo_result', requestId, ok: false, error: errMsg });
      return;
    }
    let snapshotCount = 0;
    try { snapshotCount = (JSON.parse(result.stdout) || []).length; } catch (_) {}
    send({ type: 'test_repo_result', requestId, ok: true, snapshotCount });
  } catch (e) {
    send({ type: 'test_repo_result', requestId, ok: false, error: String(e) });
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    url:   { type: 'string' },
    token: { type: 'string' },
    help:  { type: 'boolean' },
  },
  allowPositionals: true,
  strict: false,
});

const [command, subcommand] = positionals;

if (values.help || !command) {
  console.log(
    'BackupOS Agent v' + AGENT_VERSION + '\n\n' +
    'Usage:\n' +
    '  node agent.js enroll --url <server-url> --token <token>\n' +
    '  node agent.js run\n' +
    '  node agent.js service install\n' +
    '  node agent.js service uninstall\n' +
    '  node agent.js service start\n' +
    '  node agent.js service stop'
  );
  process.exit(0);
}

function runCmd(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(cmd + ' ' + args.join(' ') + ' failed with status ' + (result.status != null ? result.status : 'unknown'));
  }
}

if (command === 'enroll') {
  const url   = values['url'];
  const token = values['token'];
  if (typeof url !== 'string' || typeof token !== 'string') {
    console.error('--url and --token are required');
    process.exit(1);
  }
  writeConfig({ serverUrl: url, token });
  console.log('Enrolled. Config written.');

} else if (command === 'run') {
  const config = readConfig();
  console.log('[agent] Connecting to ' + config.serverUrl + '...');
  startAgent(config);

} else if (command === 'service') {
  const nodeBin   = process.execPath;
  const scriptPath = __filename;

  if (subcommand === 'install') {
    const unit = [
      '[Unit]',
      'Description=BackupOS Agent',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'ExecStart=' + nodeBin + ' ' + scriptPath + ' run',
      'Restart=always',
      'RestartSec=5',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      '',
    ].join('\n');
    writeFileSync('/etc/systemd/system/backupos-agent.service', unit);
    runCmd('systemctl', ['daemon-reload']);
    runCmd('systemctl', ['enable', 'backupos-agent']);
    console.log('Service installed.');

  } else if (subcommand === 'uninstall') {
    spawnSync('systemctl', ['disable', 'backupos-agent'], { stdio: 'inherit' });
    spawnSync('rm', ['-f', '/etc/systemd/system/backupos-agent.service'], { stdio: 'inherit' });
    runCmd('systemctl', ['daemon-reload']);
    console.log('Service removed.');

  } else if (subcommand === 'start') {
    runCmd('systemctl', ['start', 'backupos-agent']);
    console.log('Service started.');

  } else if (subcommand === 'stop') {
    runCmd('systemctl', ['stop', 'backupos-agent']);
    console.log('Service stopped.');

  } else {
    console.error('Unknown service subcommand: ' + (subcommand || '(none)'));
    process.exit(1);
  }

} else {
  console.error('Unknown command: ' + command);
  process.exit(1);
}
