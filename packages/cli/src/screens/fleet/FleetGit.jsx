// The git strip as the Fleet board draws it in a tile foot (the shared
// GitStrip, Fleet variant: git and worktree2 icons, 104px branch), with the
// FleetKit's hovered state: the last five commits in a .git-pop, on hover
// or keyboard focus.
import { useState } from 'react';
import { GitStrip } from '../../ui/index.js';
import { prNum } from './util.js';

export default function FleetGit({ git = {}, brMax = 104 }) {
  const [open, setOpen] = useState(false);
  const commits = (git.commits || []).slice(0, 5);
  const can = commits.length > 0;
  const show = (v) => () => { if (can) setOpen(v); };
  return (
    <GitStrip
      variant="fleet" brMax={brMax}
      git={{ ...git, pr: git.pr ? { ...git.pr, num: prNum(git.pr.num) } : null, noPr: git.noPr || 'no PR' }}
      open={open} commits={commits}
      tabIndex={can ? 0 : undefined}
      onMouseEnter={show(true)} onMouseLeave={show(false)} onFocus={show(true)} onBlur={show(false)}
    />
  );
}
