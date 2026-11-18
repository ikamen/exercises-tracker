# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [README.md](README.md) for the stack, commands, project structure, architecture and the files that must change together.

## Deployment

The site deploys automatically to Cloudflare, which is linked to this GitHub repository: every push to `main` goes live. There is no manual deploy step, so merging to `main` is the same as making a change live.

Live site: https://exercises-tracker.kpmv.co.uk/

## Workflow

For every piece of development work:

1. Start a new branch from an up-to-date `main` (`git pull`, then `git switch -c <short-descriptive-name>`) and do the work there.
2. When it's done and checked, commit it on the branch, then merge it into `main` and push `main`. Don't ask first; this is the default. If `main` has moved on in the meantime, rebase or merge onto it, re-check, and settle the version (see below) before pushing.
3. Delete the branch once it's merged.

The one exception: if the user asks not to push to `main` (for example, to verify the change first), commit on the branch, leave `main` alone, and wait for their go-ahead.

## Versioning

Every change that ships bumps the app's version, which is `CACHE_VERSION` in `sw.js`. Its current value of `2` counts as `2.0.0`. Write it as a string from the next bump onwards, e.g. `var CACHE_VERSION = '2.1.0';`. Bump it in the same commit as the change, and end the commit message with the new version, e.g. `Tracker: keep the scroll position after saving; v2.1.0`.

- Major (`2.0.0` → `3.0.0`): a new tab or a big new feature.
- Minor (`2.0.0` → `2.1.0`): tweaks and fixes to existing screens.

Docs-only changes (README, CLAUDE.md) don't need a bump.

Whenever a change bumps the version, end the reply to the user with the new version number as its very last line (e.g. `Version: 2.1.0`), so they don't have to scroll up to find it.
