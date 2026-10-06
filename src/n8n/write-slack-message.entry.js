// Node "Write Slack message" (spec 11.5). Status detection per spec 9.4. Also prepares the same alert
// as a plain email for the office, used only if Slack itself fails.
const config = $('Business config').first().json.config;
const result = $('Lead result').first().json;
const ran = (name) => { try { return $(name).isExecuted; } catch (e) { return false; } };
const emailStatus = ran('Email failed') ? 'failed' : (ran('Send reply email') ? 'sent' : 'skipped');
const sentTime = DateTime.now().setZone(config.company.timezone).toFormat('h:mm a');
const slackText = buildSlackText({ result, emailStatus, sentTime, config });
const office = slackToEmail(slackText, config);
return [{ json: { slack_text: slackText, office_subject: office.subject, office_text: office.text } }];
