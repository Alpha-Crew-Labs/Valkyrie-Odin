# Security & Data Handling

VALKYRIE is currently maintained in a **public GitHub repository**.

This means every committed file should be treated as publicly accessible, searchable, cloneable and forkable.

## Never commit

- confidential Hanwha Asset Management data
- unpublished internal research or investment opinions intended only for internal distribution
- customer or employee personal information
- API keys, tokens, passwords, cookies or credentials
- internal-only URLs, hostnames, VPN details or infrastructure information
- licensed datasets that prohibit redistribution
- raw exports from internal systems unless explicitly approved for public release

## Safe repository data

Prefer:

- public market/economic data
- synthetic/demo datasets
- anonymized examples
- sample snapshots that cannot identify confidential positions or clients
- manually constructed mock outputs for deterministic demo fallback

## Secrets

Use environment variables for local/runtime secrets.

Examples:

```text
.env
.env.local
.streamlit/secrets.toml
```

These paths are ignored by `.gitignore`, but contributors remain responsible for verifying staged files before commit.

Recommended check:

```bash
git status
git diff --cached
```

## Internal-data architecture

If approved internal data is required in a future deployment, keep it behind a provider/adapter boundary:

```text
Internal Source
      ↓
approved internal adapter/service
      ↓
normalized VALKYRIE object
      ↓
UI
```

Do not make public frontend source code depend on embedded confidential payloads.

## Accidental disclosure

If a secret or confidential file is committed:

1. stop using/exposing the credential immediately
2. rotate/revoke the credential if applicable
3. notify the team
4. remove the data from the repository and history as appropriate
5. assess whether additional internal reporting is required

Deleting the latest file alone may not remove it from Git history.

## Reporting

For hackathon development, security/data concerns should be raised with the RAVENS team lead before merging questionable data into `main`.

When uncertain, **do not commit the data**.