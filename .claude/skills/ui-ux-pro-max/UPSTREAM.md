# Upstream

Vendored from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
(`.claude/skills/ui-ux-pro-max/`, v2.13.0, commit 09170eec67eefd46a7ae85de61b40c194020f997), MIT license (see LICENSE).

Local changes:
- SKILL.md: script paths point at `.claude/skills/ui-ux-pro-max/scripts/search.py` (run from the repo root) instead of `${CLAUDE_PLUGIN_ROOT}`, and prefer `python3`.
- Removed `scripts/tests/` (upstream dev-only tests).

To update, re-copy that folder from upstream and re-apply the changes above.
