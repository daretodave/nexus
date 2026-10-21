# claims

Who is building which chunk of plan/. Written only by `node scripts/claims.mjs`, never by hand. Each entry:
`"<chunk>": "<who>|<ip>|<host>|<ISO time>|s:<session>[|pr:<n>][|held:<login>][|b:<base>]"`. A claim lives 24 h unless
renewed; one with a PR lives until the PR is merged or closed; one `held:` for a person (the owner's `assign`) lives
until they or the owner release it. `b:` names the branch it builds on, when not main. `privileged_agent_session` is
the owner's.
