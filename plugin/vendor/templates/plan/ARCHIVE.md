# Archive

> Append-only: one line per finished chunk, added in the commit
> that closes it. Never edited or reordered. Mark this file
> `merge=union` in `.gitattributes` so parallel closes never
> conflict.

---

Format: `- <date> · <chunk> · <what now works, ≤ 10 words> ·
<commit or range>`. A finished spec gets one more line,
`- <date> · <NN> · spec complete: <title> · absorbed into
identity · deleted in <sha>`; recover its text with
`git log --diff-filter=D -- plan/<NN>-*.md`. A spec `/expand`
promoted on its own and vetoed in its window leaves as
`- <date> · <NN> · spec vetoed: <title> (#<issue>) · plan
only` (`/march`'s veto sweep writes it).

```
- 2026-01-15 · 01.1 · Project boots; verify gate green on an empty app · a1b2c3d
- 2026-01-16 · 01.2 · Deploy gate reports the live build · d4e5f60..0a1b2c3
- 2026-01-20 · 01 · spec complete: Bootstrap · absorbed into identity · deleted in 4d5e6f7
```

(Replace the example above with real lines as chunks close.)
