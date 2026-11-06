# ADR 0001: Flatten public git history

**Status:** PROPOSED
**Date:** 2026-11-06
**Deciders:** Mark Alexiuk

## Context

Economic and mining data from before the public flip is still in git history (`TODO.md:12-17`). The parked action squashes history to one root commit and force-pushes `main`. That rewrites published history and cannot be undone. The trigger is the public restructuring being committed and published.

## Options

1. Squash history to a single root commit and force-push `main` after the restructuring is published.
2. Keep history as it is, and rely on the restructuring to remove the data from the current tree.

## Owner question

Do you approve flattening the public history and force-pushing `main` once the restructuring is published?

## Consequences

- Option 1: history is clean, but every clone and fork must re-clone. Other branches and tags must be checked first.
- Option 2: the old data stays in public history.
- Either option needs explicit owner approval (ESC-1).
