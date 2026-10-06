// Node "Build sheet row" (spec 11.7). Status detection per spec 9.4, plus the office email that
// replaces a failed Slack alert.
const result = $('Lead result').first().json;
const ran = (name) => { try { return $(name).isExecuted; } catch (e) { return false; } };
let slackStatus = ran('Slack failed') ? 'failed' : (ran('Post to Slack') ? 'sent' : 'skipped');
if (slackStatus === 'failed' && ran('Email the office instead')) {
  const office = $('Email the office instead').first().json;
  slackStatus = office && !office.error ? 'failed, office emailed' : 'failed, office email failed too';
}
const statuses = {
  email_status: ran('Email failed') ? 'failed' : (ran('Send reply email') ? 'sent' : 'skipped'),
  slack_status: slackStatus,
};
return [{ json: buildSheetRow(result, statuses) }];
