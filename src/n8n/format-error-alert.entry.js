// Node "Format error alert" (spec 9.5). Field names checked against a real Error Trigger run in Phase 6.
const data = $input.first().json;
const execution = data.execution || {};
const workflow = data.workflow || {};
const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const baseUrl = %%N8N_BASE_URL_JSON%%;
const url = execution.url || (execution.id ? `${baseUrl}/workflow/${workflow.id}/executions/${execution.id}` : `${baseUrl}/home/executions`);
const error = execution.error || data.trigger?.error || {};
const lines = [
  '*Lead Responder failed*',
  `Step: ${escape(execution.lastNodeExecuted || error.node?.name || 'unknown')}`,
  `Error: ${escape(error.message || 'no error message')}`,
  `Open the run: ${url}`,
  'The lead may be missing from the sheet. The run above has the full submission.',
];
return [{ json: { slack_text: lines.join('\n') } }];
