# openbot-probe: reading what a running program looks like (B1)

A small tool for the team's own analysis of a program the owner has installed. It connects to a **copy** of that program through its
debug port, walks the screens a person without an account can reach, and writes what each one looks like: the accessibility tree,
every visible line of text, the design as groups of look (colours, fonts, spacing, sizes), the custom properties, the boxes of the
regions, what can be clicked, and a picture. It reads; it clicks only what `policy.ts` allows; it types only the made-up values of the
stand-in account service below.

**Nothing in this folder contains text, graphics or code of the program it looks at, and its results must never be committed.** The
program's package carries a non-commercial licence and the repository is public. The tool refuses an `--out` folder inside the repo.
Results go to a folder outside it (the team keeps them in `Shared\cosgral-docs\openbot-0.71-ui\`).

## Rules it keeps

1. **A copy, never the person's own program.** Copy the program folder next to the sandbox, start the copy with its own
   `--user-data-dir`, its own `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` and `TEMP`, and `--remote-debugging-port=<free port>`.
   Do not stop, restart or attach to the program that is in use, and do not read its data.
2. **No real account.** The sign-in is the stand-in (`stub-account-service.ts`): loopback only, a made-up person, any code works,
   nothing leaves the computer. Never type anything real.
3. **Never clicked:** sign-in, payment, send, share, install, update, download, delete, clear, reset, copy, import, export, quit,
   anything that opens a page outside the program (terms, privacy, help, links), anything that is a switch or a checkbox (a setting,
   not a screen), disabled things. Words are in `policy.ts` (English and Polish) and are tested.
4. **Budgets:** `--max-screens`, `--max-clicks`, `--max-minutes`.

## Use

```text
# 1. the stand-in account service (leave it running)
node scripts/openbot-probe/stub-account-service.ts --port 3199 --log <file outside the repo>

# 2. the copy (PowerShell; quote the paths that have spaces INSIDE the argument)
$env:USERPROFILE = "<sandbox>\home"; $env:APPDATA = "<sandbox>\home\AppData\Roaming"; $env:LOCALAPPDATA = "<sandbox>\home\AppData\Local"
$env:OPENBOT_AUTH_API_URL = "http://127.0.0.1:3199"
Start-Process "<sandbox>\copy\OpenBot.exe" -ArgumentList '"--user-data-dir=<sandbox>\data-1"', '--remote-debugging-port=9339'

# 3. the probe (Node, not Bun: Playwright's connection over the debug port does not answer under Bun)
node scripts/openbot-probe/probe.ts --cdp http://127.0.0.1:9339 --out <folder outside the repo> --stub-login --prefer-language English
```

Use a new data folder for every start of the copy: reusing one right after the copy was killed gave "disk I/O error" at start. A debug
port that was just used may still be taken: use the next one.

## What it writes

One folder per screen (`01-heading/`): `screenshot.png`, `aria.yml`, `texts.json`, `styles.json` (groups of look with counts),
`tokens.json` (custom properties and their values), `layout.json` (boxes of the regions, fonts, viewport), `controls.json` (what could
be clicked, with the probe's verdict), `screen.json`. At the top: `index.json` and `index.md` (the screens, how each was reached,
what was never clicked and why, why the run stopped).

## Not done

It does not type into forms (so screens that exist only after creating something are not reached), does not switch themes or languages
(other than `--prefer-language` on a language picker), does not scroll long pages, and does not drive windows other than the main
one. A screen is "new" when its accessibility tree differs after ignoring numbers and the state of a choice, so two screens that
differ only in colours or data are one.
