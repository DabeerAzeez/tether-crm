# TetherCRM

A privacy-preserving personal CRM web app that helps users maintain meaningful relationships with 100–300 contacts. Users sign in with Google, get their contacts pulled in automatically, log interactions manually, sync their Google Calendar to see who they've spent time with, receive proactive nudges to reconnect with close friends, query their network in natural language, and view contacts geographically.

## Nudge days

Each close friend can have a nudge frequency set (e.g. "catch up every 30 days"). **Nudge days** is the number of days remaining until that deadline: `nudgeFrequencyDays − daysSinceLastContact`. A positive number means you're in the green — you still have time before you're due to reach out. A negative number means you've fallen behind and the deadline has passed. The Reconnect tab sorts friends by nudge days ascending (most overdue first) and shows a color bar on each card that fades from red (overdue) through amber (due soon) to green (plenty of time left).
