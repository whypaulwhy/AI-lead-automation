// npm run doctor: checks every part a lead depends on and says how to fix what's broken.
// Changes nothing and posts nothing.
import { printChecks, runChecks } from './lib/health.mjs';

console.log('Checking the Lead Responder setup...\n');
const problems = printChecks(await runChecks({ needSite: true }));
process.exitCode = problems ? 1 : 0;
