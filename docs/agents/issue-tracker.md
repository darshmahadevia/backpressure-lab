# Issue tracker: GitHub

Issues and specs for this repository live in GitHub Issues. Use the `gh` CLI for all issue operations.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Labels: `gh issue edit <number> --add-label "..."`
- Resolve: comment with the result, then close with `gh issue close <number> --comment "..."`

Pull requests are not a request surface for this repository. Changes are pushed directly to `main` after local verification.
