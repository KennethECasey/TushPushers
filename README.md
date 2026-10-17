# Tush Pushers league site

A free league history and stats site that runs itself. Every page loads live from Sleeper's public API when someone opens it. There's no server, no scheduled job, no API key, and nothing to update. When Sleeper rolls the league into a new season, the site finds the new season on its own.

## What's on it

- **Home**: defending-champion spotlight, this week's live scores, written game recaps and awards, league pulse, hall of champions, and the ring board.
- **Standings**: this season (all-play, vs-median, luck, lineup efficiency, streaks, FAAB left, playoff line) plus all-time standings, with former managers listed separately.
- **Power**: power rankings on a football field, plus a week-by-week snapshot table.
- **Seasons**: for any season: final standings with grades, the playoff bracket, highlights, every week's scores, and the draft recap.
- **Records**: team, game, and player records across all seasons.
- **Head-to-head**: any two managers compared side by side, a full matchup matrix (regular season, title playoffs, or all games), and rivalry rankings.
- **Fun stats**: blowouts, closest games, hard-luck losses, lucky wins, consistency vs. volatility, clutch index, luck rating, benching analysis, and streaks.
- **Trades**: Grand Larceny leaderboards (while rostered and season total) and every move, filterable by type, season, and manager.
- **Managers**: profiles with career stats, titles and rings, nemesis, favorite victim, and arch-rival, a trading style, draft capital efficiency, season grades, and past team names. Also lists former managers and founding members.
- **Drafts**: every draft board, plus a search across all drafts.
- **League**: rules at a glance.
- **Bylaws**: the full league bylaws, with a clickable section list.

## One-time setup (about 10 minutes)

1. **Make a free account** at github.com.
2. **Create a repository.** Click **New**, name it `tush-pushers`, choose **Public**, and click **Create repository**.
3. **Upload the files.** Click **uploading an existing file**, drag in everything from this folder, and click **Commit changes**. The files are `index.html`, `app.js`, `data.js`, `config.js`, `bylaws.md`, `README.md`, and `.nojekyll`.
   - `.nojekyll` is a hidden file. On a Mac, press `Cmd + Shift + .` in Finder to see it. The site works without it, so don't worry if it's missing.
4. **Turn on the site.** Go to **Settings > Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **main** and **/(root)**, then click **Save**.
5. **Open it** after a minute or two at `https://YOUR-USERNAME.github.io/tush-pushers/`. The link also appears on the same Pages screen.

That's it. There's no step 6.

## Why it never needs upkeep

- **Live data:** Scores, trades, and standings come straight from Sleeper every time someone loads a page, so they can't go stale.
- **New seasons:** When Sleeper creates next year's league, the site follows the link from the old season to the new one by itself.
- **Speed:** Finished seasons are saved in each visitor's browser. Player names refresh every few days.
- **Nothing to break:** There are no packages to update and no scheduled jobs that can expire. Hosting on GitHub Pages is free for public repos.

The only things it depends on are GitHub Pages and Sleeper's public API. If Sleeper ever changed how its API works, the code would need a fix.

## Updating the bylaws

The Bylaws page shows the file `bylaws.md`. When the rules change, open `bylaws.md` on GitHub, click the pencil icon, edit, and click **Commit changes**. The site updates within a minute or two.

## Draft picks in trade grades

A traded pick counts as the player it became once the draft happens. Until then, it carries a preset value by round. The presets come from `pickValues` in `config.js` until the league has enough past rookie drafts, and after that from this league's own rookie averages.

## Optional settings

Both live in `config.js`. To edit, click the file on GitHub, then the pencil icon.

- `bylawsUrl`: paste a link to the bylaws, and it appears on the League page.
- `pickValues`: preset points for unused draft picks by round.
- `leagueId`: any season's league ID works. Leave it alone.
