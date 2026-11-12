# Peer bug reports — findings and resolutions

Fourteen bug reports came from peer testing of the live site. Each one was checked against `main` and a local build whose asset hashes match production. The fixes are the "Peer bug fixes" batch: WI-40–46 in `TECH_SPEC.md` §14, with the session log in `PROGRESS.md`. Each accepted finding got a failing test before its fix.

**Verdicts.** *Fixed*: the behaviour changed and a test now proves it. *Clarified*: the app was already correct, so only its explanation was improved. *By design*: the app works as specified, and the spec section is cited. *Invalid*: the reported behaviour does not occur. *Accepted, fix pending*: verified, and its work item is not merged yet.

| # | Finding | Verdict | Evidence or reason | WI | Commit |
|---|---|---|---|---|---|
| 1 | A fixed event can be dragged without being asked | Fixed | Verified: a fixed event moved on drag with no confirmation. Now a drag or resize asks "<title> is fixed. Move it anyway?" (Move / Keep it), and the Fixed tag explains why (T43, unit and browser). | WI-42 | 37b69da |
| 2 | Deleting an event cannot be undone | Invalid | The delete confirmation reads "You can undo this.", and Undo (Ctrl+Z or the toolbar) restores the event (T24). | — | — |
| 3 | Alternatives and flexible windows ignore events outside working hours | Fixed | Verified: `suggestAlternatives` always searched working hours only. Now the picker offers *Working hours only / Any time*, defaulting to *Any time* outside working hours, and an empty search names its cause (T42). | WI-41 | 24b720a (merge 93efc20) |
| 4 | Alternatives and flexible windows ignore events outside working hours | Fixed | The same causes as #3: a new flexible event at night got its day's working hours as its window, so "no available time". Its default window is now the whole local day (T42). | WI-41 | 24b720a (merge 93efc20) |
| 5 | The alternatives "Move" choices swap places when one is selected | Accepted, fix pending | Verified: the radios render the selected event first. | WI-45 | — |
| 6 | Two identical barred slots can be saved | Accepted, fix pending | Verified: two identical Lunch slots save. | WI-43 | — |
| 7 | Lunch splits a task window into short pieces | Accepted, explanation pending (behaviour correct) | A 12:30–14:30 window with Lunch 13:00–14:00 really leaves two 30-minute stretches (BR-5); the ER2/ER3 text will list them and say what splits them. | WI-45 | — |
| 8 | Unscheduled tasks do not appear in List view | By design | Unscheduled tasks have no time and live in the Tasks panel (PROJECT_SCHEMA §3.1); List shows timed events only. | — | — |
| 9 | Alternatives and flexible windows ignore events outside working hours | Fixed | The same causes as #3, for an event on a non-working day: the picker now defaults to *Any time* and the flex window to the whole day (T42). | WI-41 | 24b720a (merge 93efc20) |
| 10 | The event count disagrees with the priority filter | Accepted, fix pending | Verified: with High, Medium and Low hidden, the status line says "8 events" while List says "No events to display". | WI-44 | — |
| 11 | Dialogs have no visible close button | Accepted, fix pending | Verified: dialogs close only with Cancel or Esc. | WI-45 | — |
| 12 | List view: conflict outlines paint over the sticky day header | Accepted, fix pending | Verified: `.fc-list-day th` has `z-index: auto`, so a conflict row's outline paints over it when scrolled. | WI-44 | — |
| 13 | List view is clipped on a narrow screen | Accepted, fix pending | Verified at 420 px: the list table is 464 px wide inside a 370 px container with hidden overflow. | WI-44 | — |
| 14 | A change in one tab is undone by another tab | Fixed | Verified: delete Seminar in tab 1, edit it in tab 2, reload, and it was back. Now every write checks a stored revision (ER8), and the other tabs reload after each change (T41, including a two-page browser test). | WI-40 | a894bc3, 530fc03 (merge 1f20973) |
