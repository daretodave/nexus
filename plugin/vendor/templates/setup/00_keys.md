# `<PROJECT>` — key custody index

> One per-credential table answers "which file holds this
> token, where is it mirrored, when does it expire" so an
> unattended window never dies on a question the kit already
> had the answer to, just not written down in one place.

---

Keyed by `nexus.secrets.json`'s manifest names (see
[`nexus/customization/secrets.md`](../../customization/secrets.md)).
A value never appears in this file — only names, dates and
file paths, the manifest's own "names, never values" rule.

## Index

| Key | Holder file | Minted by | Scopes | Mirrored to | Expires | Rotate via |
|---|---|---|---|---|---|---|
| <NAME> | <file that holds the value> | <who/where it's minted> | <scopes granted> | <where it's pushed> | <ISO> | <rotate command or link> |

> One row per `nexus.secrets.json` entry with a lifetime
> worth tracking. Drop the example row once real ones
> replace it.
