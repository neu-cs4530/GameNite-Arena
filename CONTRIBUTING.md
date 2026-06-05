# Contributing to GameNite Arena

## Branches

Branch off `main` and name your branch `<your-name>-<short-description>`

## Running locally

```bash
npm install       # install all dependencies from the root
npm run dev       # starts both client and server in watch mode
```

The client runs at `http://localhost:4530/`. Default test accounts:
`user0/pwd0000`, `user1/pwd1111`, `user2/pwd2222`, `user3/pwd3333`.

## Before opening a PR

Run all checks from the repo root and make sure everything passes:

```bash
npm run check     # TypeScript
npm run lint      # ESLint
npm run prettier  # formatting
npm run test      # Vitest + Playwright
```

## Pull requests

- Open PRs against `main`
- At least one approval required before merging (not from the PR author)
- CI must be green
- Try to keep PRs focused on one thing, it makes reviewing a lot easier
- Zach gets auto-requested on database migration changes and Richard on AI
  service changes via CODEOWNERS

## Commit messages

Keep them short and descriptive. Lead with a verb like `add`, `fix`, `update`,
or `remove`. Link the relevant issue in the PR description.

## Questions

Post in the group chat(s) or bring it up at one of the Zoom sessions.
