// Checks build/*.json against the node definitions shipped inside the running n8n container, so
// node types, typeVersions, parameter names, option values and wiring match the pinned version
// (rule 0.7; stands in for n8n-mcp, which is not registered). Run after npm run build.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NODES_JSON = '/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/dist/types/nodes.json';
const FILES = ['build/lead-responder.json', 'build/error-alerts.json'];
const ROOT = fileURLToPath(new URL('../', import.meta.url));

function loadDefinitions() {
  try {
    const text = execFileSync('docker', ['compose', 'exec', '-T', 'n8n', 'cat', NODES_JSON], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(text.toString('utf8'));
  } catch {
    throw new Error('Could not read node definitions from the n8n container. Is Docker running (npm run n8n:up)?');
  }
}

function versionMatches(conditions, version) {
  return conditions.some((c) => (c && typeof c === 'object' && c._cnd)
    ? Object.entries(c._cnd).every(([op, v]) => ({ gte: version >= v, lte: version <= v, gt: version > v, lt: version < v, eq: version === v })[op] ?? true)
    : c === version);
}

// Is this property shown for the node's other parameter values and version?
function isVisible(prop, definition, params, version) {
  const actual = (key) => {
    const name = key.replace(/^\//, '');
    if (params[name] !== undefined) return params[name];
    return definition.properties.find((p) => p.name === name && p.default !== undefined)?.default;
  };
  const show = prop.displayOptions?.show ?? {};
  const hide = prop.displayOptions?.hide ?? {};
  for (const [key, allowed] of Object.entries(show)) {
    if (key === '@version' ? !versionMatches(allowed, version) : !allowed.includes(actual(key))) return false;
  }
  for (const [key, blocked] of Object.entries(hide)) {
    if (key === '@version' ? versionMatches(blocked, version) : blocked.includes(actual(key))) return false;
  }
  return true;
}

export function validateWorkflows(definitions = loadDefinitions()) {
  const problems = [];
  for (const file of FILES) {
    const workflow = JSON.parse(readFileSync(`${ROOT}${file}`, 'utf8'));
    const names = new Set(workflow.nodes.map((n) => n.name));
    const outputs = {};
    for (const node of workflow.nodes) {
      const where = `${file}: "${node.name}"`;
      const short = node.type.replace(/^n8n-nodes-base\./, '');
      const definition = definitions.find((d) => d.name === short && [].concat(d.version).includes(node.typeVersion));
      if (!definition) { problems.push(`${where}: ${node.type} v${node.typeVersion} does not exist in this n8n`); continue; }
      for (const [key, value] of Object.entries(node.parameters ?? {})) {
        const candidates = definition.properties.filter((p) => p.name === key);
        if (!candidates.length) { problems.push(`${where}: unknown parameter "${key}"`); continue; }
        const prop = candidates.find((p) => isVisible(p, definition, node.parameters, node.typeVersion));
        if (!prop) { problems.push(`${where}: parameter "${key}" does not apply with these settings`); continue; }
        if (prop.type === 'options' && !String(value).startsWith('=') && !(prop.options ?? []).some((o) => o.value === value)) {
          problems.push(`${where}: "${key}" = ${JSON.stringify(value)} is not one of ${(prop.options ?? []).map((o) => o.value).join('|')}`);
        }
        if (prop.type === 'collection' && value && typeof value === 'object') {
          for (const sub of Object.keys(value)) if (!(prop.options ?? []).some((o) => o.name === sub)) problems.push(`${where}: option ${key}.${sub} is unknown`);
        }
      }
      // HTTP Request takes any credential type in "generic" auth mode.
      for (const cred of Object.keys(node.credentials ?? {})) {
        const generic = short === 'httpRequest' && node.parameters.authentication === 'genericCredentialType' && node.parameters.genericAuthType === cred;
        if (!generic && !(definition.credentials ?? []).some((c) => c.name === cred)) problems.push(`${where}: credential type ${cred} is not accepted`);
      }
      let count = { if: 2, stickyNote: 0, switch: node.parameters.rules?.values?.length ?? 1 }[short] ?? 1;
      if (node.onError === 'continueErrorOutput') count += 1;
      outputs[node.name] = count;
    }
    const targeted = new Set();
    for (const [from, connection] of Object.entries(workflow.connections)) {
      if (!names.has(from)) problems.push(`${file}: connection from unknown node "${from}"`);
      if (connection.main.length > outputs[from]) problems.push(`${file}: "${from}" has ${connection.main.length} outputs wired but only ${outputs[from]} exist`);
      for (const target of connection.main.flat()) {
        if (!names.has(target.node)) problems.push(`${file}: "${from}" connects to unknown node "${target.node}"`);
        targeted.add(target.node);
      }
    }
    for (const node of workflow.nodes) {
      const starts = /webhook$|errorTrigger$|stickyNote$/.test(node.type);
      if (!starts && !targeted.has(node.name)) problems.push(`${file}: "${node.name}" has no incoming connection`);
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const problems = validateWorkflows();
    if (problems.length) {
      console.error(`Validation found ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
      process.exit(1);
    }
    console.log(`Validation: no problems in ${FILES.join(' and ')}.`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
