// Node "Build sheet row" (spec 11.7). Status detection per spec 9.4.
const result = $('Lead result').first().json;
const ran = (name) => { try { return $(name).isExecuted; } catch (e) { return false; } };
const statuses = {
  email_status: ran('Email failed') ? 'failed' : (ran('Send reply email') ? 'sent' : 'skipped'),
  slack_status: ran('Slack failed') ? 'failed' : (ran('Post to Slack') ? 'sent' : 'skipped'),
};
return [{ json: buildSheetRow(result, statuses) }];
