# Accounts and credentials setup

About 45 minutes. Everything here is free. If any page asks for a card or offers a free trial, close
it; you don't need it.

Use the **sender** Gmail account (step A1) for every sign-up below, so your personal accounts stay out
of the demo. Never paste a password, key or link from this guide into a chat.

Done already: n8n account, n8n API key, Claude login (Phase 1), and the n8n credential for the AI bridge.

---

## A. Two Gmail accounts (10 min)

1. Open https://accounts.google.com/signup in a private browser window and create the **sender**
   account, for example `cedarslate.office.demo@gmail.com`. Replies to leads are sent from it.
2. Sign out. Create the **inbox** account the same way, for example `cedarslate.leads.demo@gmail.com`.
   Test leads use addresses like `cedarslate.leads.demo+maria@gmail.com`, which land in this inbox.
3. Sign in to the **sender** account again. Open https://myaccount.google.com/signinoptions/twosv and
   turn on 2-Step Verification. Google walks you through it with your phone.

You should see: "2-Step Verification is on".

## B. The Google Sheet (3 min)

Signed in as the sender account:

1. Open https://sheets.new. A blank sheet opens.
2. Click "Untitled spreadsheet" at the top left and rename it `Cedar & Slate lead log`.
3. Look at the address bar. Copy the long part between `/d/` and `/edit`. That is the **sheet ID**;
   keep it for step F.

You don't need to type any column headers. The setup command in step G writes them.

## C. A Google robot account for the sheet (10 min)

n8n adds rows to the sheet through a "service account": a robot Google account that can only open
sheets you share with it.

1. Open https://console.cloud.google.com, still as the sender account. Accept the terms if asked.
2. Click the project picker at the top left, then **New project**. Name it `lead-responder-demo` and
   click **Create**. When it finishes, pick the new project in the project picker.
3. Type `Google Sheets API` in the search bar at the top, open it, and click **Enable**.
4. Type `Service accounts` in the search bar, open it, and click **Create service account**.
5. Name it `n8n-sheets-writer`. Click **Create and continue**, then **Continue** (no role needed),
   then **Done**.
6. Click the new account in the list. Open the **Keys** tab, click **Add key**, then
   **Create new key**, choose **JSON**, and click **Create**. A `.json` file downloads.
7. In File Explorer, create the folder `Documents\secrets` and move that file into it. Never put it
   in the project folder or send it to anyone.
8. Copy the robot account's email address (it ends in `.iam.gserviceaccount.com`). Go back to your
   sheet, click **Share**, paste the address, choose **Editor**, untick **Notify people**, and click
   **Share**.

## D. Slack (8 min)

1. Open https://slack.com/get-started#/createnew and create a free workspace with the sender email.
   Name it `Cedar & Slate (demo)`.
2. Create a channel called `new-leads`.
3. Open https://api.slack.com/apps and click **Create New App**. A box called "Create new app"
   opens with four choices.
4. Under **Or start your own way**, click **Blank app**, then click **Continue**. Don't pick
   "AI agent" or "Starter app"; they add features this demo doesn't use.
5. Type the app name `Lead Responder`, pick the `Cedar & Slate (demo)` workspace, and click
   **Create App**. You land on the app's settings page.
6. In the left menu, click **Incoming Webhooks**. Switch **Activate Incoming Webhooks** to **On**.
   More options appear below it.
7. Scroll down and click **Add New Webhook** (it may say **Add New Webhook to Workspace**).
8. Choose `#new-leads` and click **Authorize** (it may say **Allow**). You go back to the settings
   page.
9. Under **Webhook URLs for Your Workspace**, click **Copy** next to the new URL (it starts with
   `https://hooks.slack.com/services/`). Keep it for step F, and don't share it anywhere else:
   anyone who has it can post into your channel.

You should see: one URL listed under "Webhook URLs for Your Workspace", with `#new-leads` next to it.

## E. Booking link (5 min)

1. Sign up at https://cal.com with the sender email (free plan). If it asks to connect a calendar,
   skip it.
2. Create an event type named `Free roof inspection`, 30 minutes long.
3. Copy its public link (it looks like `https://cal.com/your-name/free-roof-inspection`). Keep it for
   step F.

## F. Put five values into .env (3 min)

1. Open the file with this command (or open `D:\p1\.env` in Notepad):
   ```
   notepad D:\p1\.env
   ```
2. Find each line below and paste the value right after the `=`. No spaces, no quotes.

   | Line in .env | What to paste |
   |---|---|
   | `SENDER_EMAIL=` | the sender Gmail address (step A1) |
   | `TEST_INBOX=` | the inbox Gmail address (step A2) |
   | `GOOGLE_SHEET_ID=` | the sheet ID (step B3) |
   | `SLACK_WEBHOOK_URL=` | the webhook URL (step D9) |
   | `BOOKING_URL=` | the booking link (step E3) |

3. Save with Ctrl+S and close Notepad.

## G. Connect Gmail and the sheet to n8n (5 min)

1. Signed in as the sender account, open https://myaccount.google.com/apppasswords. Type the name
   `n8n lead responder` and click **Create**. Google shows a 16-letter password once. Leave that
   window open. (If the page says app passwords aren't available, step A3 isn't finished.)
2. Open a terminal in the project folder: in File Explorer, open `D:\p1`, click the address bar, type
   `powershell`, and press Enter.
3. Run:
   ```
   npm run setup:credentials
   ```
4. When it asks, paste the 16-letter password and press Enter. Nothing shows while you paste; that is
   normal.
5. You should see three lines that end in "created" or "kept it", and a line saying it wrote the 24
   column headers. If a line says FAILED, it names the step above to fix. Fix it and run the same
   command again.
6. Close the app password window.

## H. Final check (1 min)

1. In the same terminal, run:
   ```
   npm run check:env
   ```
2. You should see `All good.` at the end.
3. Tell Claude Code "done". It will ask before posting one test message to Slack.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| `Gmail refused the login` | Make a new app password (G1) and run `npm run setup:credentials` again. |
| `The sheet isn't shared with ...` | Share the sheet with that exact address as Editor (C8), then run the command again. |
| `The Google Sheets API is off` | Do step C3 in the same project as the robot account, then run the command again. |
| `no Google key file found` | Move the downloaded `.json` file into `Documents\secrets` (C7). |
| `n8n is not running` | Run `npm run n8n:up`, wait a minute, then try again. |
| `check:env` says `set, but ...` | Open `.env` and fix that one line as the message says. |
