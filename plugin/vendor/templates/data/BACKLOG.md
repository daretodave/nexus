# Data backlog

> `/ship-data` reads this file. The next `[ ]` row is the next
> work. If empty, `/ship-data` runs an audit pass to populate.

## Pending

(empty — populated by `/ship-data audit` or `/iterate` when it
finds data gaps)

## Done

(empty — `/ship-data` flips entries here as it ships them, with
commit hash)
