// Node "Format error alert" (spec 9.5). Field names checked against a real Error Trigger run in Phase 6.
// Also prepares a plain email for the office in case Slack is down too.
const data = $input.first().json;
const execution = data.execution || {};
const workflow = data.workflow || {};
const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const baseUrl = %%N8N_BASE_URL_JSON%%;
const url = execution.url || (execution.id ? `${baseUrl}/workflow/${workflow.id}/executions/${execution.id}` : `${baseUrl}/home/executions`);
const error = execution.error || data.trigger?.error || {};
const step = execution.lastNodeExecuted || error.node?.name || 'unknown';
const message = error.message || 'no error message';
const lines = [
  '*Lead Responder failed*',
  `Step: ${escape(step)}`,
  `Error: ${escape(message)}`,
  `Open the run: ${url}`,
  'The lead may be missing from the sheet. The run above has the full submission.',
];
const officeText = [
  'Lead Responder failed, and Slack could not be reached either.',
  `Step: ${step}`,
  `Error: ${message}`,
  `Open the run: ${url}`,
  'The lead may be missing from the sheet. Once things work again, resend it with: npm run replay -- ' + (execution.id || '<run id>'),
].join('\n');
return [{ json: { slack_text: lines.join('\n'), office_subject: `Lead Responder failed at "${step}"`, office_text: officeText } }];
