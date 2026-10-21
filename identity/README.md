# identity/: what stays (nexus on nexus)

nexus runs the [identity layer](../customization/identity-layer.md)
on itself, as it runs pending files, settle and claims. The
rules for every file are the template's:
[`templates/identity/README.md`](../templates/identity/README.md).

| File | Holds |
|---|---|
| [footguns.md](footguns.md) | Traps hit while building the kit; settle runs the ladder (a trap seen twice becomes automation). |
| [decisions/](decisions/README.md) | Decisions settle numbers from pending files (`D?<slug>`), one file per year. |

The kit's standing decisions predate this layer and stay in
[`plan/bearings.md`](../plan/bearings.md); its promises are
[`agents.md`](../agents.md)'s standing rules. New ones arrive
here through pending files.
