// npm run demo: one command after a restart. Starts whatever is not running (Docker Desktop, n8n,
// the AI bridge, the website), redeploys if the workflow is missing or left in drill mode, then runs
// the doctor. Keep this terminal open; Ctrl+C stops the bridge and the website it started.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { bridgeHealth, dockerBin, dockerDesktopExe, dockerRunning, findLeadWorkflow, isDrillWorkflow, n8nApiReady, printChecks, ROOT, run, runChecks } from './lib/health.mjs';
import { readEnv } from './lib/env.mjs';

const env = readEnv();
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const step = (text) => console.log(`- ${text}`);
const children = [];

async function waitFor(check, seconds, label) {
  for (let waited = 0; waited < seconds; waited += 3) {
    if (await check()) return true;
    if (waited > 0 && waited % 30 === 0) step(`still waiting for ${label} (${waited} s)...`);
    await sleep(3000);
  }
  return check();
}

function startChild(label, bin, args) {
  const child = spawn(bin, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => console.log(`  [${label}] ${line}`));
  child.stdout.on('data', prefix);
  child.stderr.on('data', prefix);
  child.on('exit', (code) => { if (code) console.log(`  [${label}] stopped (exit ${code})`); });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

console.log('Starting the Lead Responder demo...\n');

// 1. Docker
if (await dockerRunning()) {
  step('Docker: already running');
} else {
  const exe = dockerDesktopExe();
  if (!exe) { console.error('Docker Desktop is not installed where expected. Start it from the Start menu, then run this again.'); process.exit(1); }
  step('Docker: starting Docker Desktop (can take a minute)...');
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  if (!(await waitFor(dockerRunning, 240, 'Docker'))) { console.error('Docker did not start in 4 minutes. Open Docker Desktop and check for an error message.'); process.exit(1); }
  step('Docker: running');
}

// 2. n8n
const up = await run(dockerBin(), ['compose', 'up', '-d'], 120000);
if (!up.ok) { console.error('Could not start n8n with docker compose. Run npm run n8n:logs to see why.'); process.exit(1); }
if (!(await waitFor(() => n8nApiReady(env), 180, 'n8n'))) { console.error('n8n did not answer within 3 minutes. Run npm run n8n:logs to see why.'); process.exit(1); }
step('n8n: running');

// 3. Workflow
const workflow = await findLeadWorkflow(env);
if (!workflow || !workflow.active || isDrillWorkflow(workflow)) {
  step(`Workflow: ${!workflow ? 'missing' : isDrillWorkflow(workflow) ? 'left in drill mode' : 'not published'}, deploying...`);
  const deploy = await run(process.execPath, ['scripts/deploy.mjs'], 180000);
  if (!deploy.ok) { console.error(`Deploy failed:\n${deploy.stdout}\nRun npm run deploy to see the full error.`); process.exit(1); }
}
step('Workflow: published');

// 4. Local AI (Ollama), if it is in the provider chain: start it and keep it at low priority so the
//    PC stays responsive while it works (the priority resets whenever Ollama restarts).
const chain = String(env.AI_PROVIDERS || '').split(',').map((s) => s.trim());
if (env.AI_MODE !== 'api' && chain.includes('ollama')) {
  const ollamaUrl = (env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const ollamaUp = () => fetch(`${ollamaUrl}/api/version`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok).catch(() => false);
  if (!(await ollamaUp())) {
    const exe = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama app.exe');
    if (existsSync(exe)) {
      step('Local AI: starting Ollama...');
      spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
      await waitFor(ollamaUp, 60, 'Ollama');
    }
  }
  if (await ollamaUp()) {
    await run('powershell.exe', ['-NoProfile', '-Command', "Get-Process ollama -ErrorAction SilentlyContinue | ForEach-Object { $_.PriorityClass = 'BelowNormal' }"], 15000);
    step('Local AI: Ollama running at low priority');
  } else {
    step('Local AI: Ollama is not running; the next AI in the chain will answer');
  }
}

// 5. AI bridge
if (env.AI_MODE !== 'api') {
  const bridge = await bridgeHealth(env);
  if (bridge?.drill) step(`AI bridge: running in DRILL mode (${bridge.drill}) in another terminal. Stop it there and run npm run ai:bridge.`);
  else if (bridge) step('AI bridge: already running in another terminal');
  else {
    startChild('bridge', process.execPath, ['scripts/ai-bridge.mjs']);
    if (await waitFor(async () => Boolean(await bridgeHealth(env)), 30, 'the AI bridge')) step('AI bridge: started');
    else step('AI bridge: did not start; see the [bridge] lines above');
  }
}

// 6. Website
const siteUp = await fetch(env.SITE_ORIGIN, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
if (siteUp) {
  step(`Website: already serving ${env.SITE_ORIGIN}`);
} else {
  // npx is a .cmd file on Windows; run npm's own npx script with node instead of a shell.
  const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (!existsSync(npxCli)) step('Website: could not find npx; run npm run site in another terminal');
  else {
    startChild('site', process.execPath, [npxCli, '--yes', 'serve@14.2.6', 'site', '-l', '8080', '--no-clipboard', '--no-request-logging']);
    const ok = await waitFor(() => fetch(env.SITE_ORIGIN, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false), 60, 'the website');
    step(ok ? `Website: serving ${env.SITE_ORIGIN}` : 'Website: did not start; see the [site] lines above');
  }
}

console.log('\nChecking everything...\n');
const problems = printChecks(await runChecks({ needSite: true }));
console.log(problems ? '' : `\nReady. Open ${env.SITE_ORIGIN} and send a request.`);
if (children.length) console.log('Keep this terminal open. Press Ctrl+C to stop the AI bridge and the website.');
else process.exit(problems ? 1 : 0);
