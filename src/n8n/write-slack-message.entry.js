// Node "Write Slack message" (spec 11.5). Status detection per spec 9.4.
const config = $('Business config').first().json.config;
const result = $('Lead result').first().json;
const ran = (name) => { try { return $(name).isExecuted; } catch (e) { return false; } };
const emailStatus = ran('Email failed') ? 'failed' : (ran('Send reply email') ? 'sent' : 'skipped');
const sentTime = DateTime.now().setZone(config.company.timezone).toFormat('h:mm a');
return [{ json: { slack_text: buildSlackText({ result, emailSent: emailStatus === 'sent', sentTime, config }) } }];
