// STUB (41.3 foundation). Screen agent: build the repo git panel from
// design/handoff/GitPanel.dc.html (+ Light): .gp-wrap with WtHead and Wt
// rows, .root-card, .pr-row, Commit and the .tidy-pop dry run.
// Data: useGitRepo().
import { Link } from 'react-router-dom';
import { ViewFrame, Icon, Empty, useShell } from '../ui/index.js';
import { PATHS } from '../routes.js';

export default function GitPanel() {
  const { repo } = useShell();
  return (
    <ViewFrame current="git" title="Git" sub={repo} actions={<Link className="btn btn-s" to={PATHS.recover}><Icon name="refresh" size={14} />Recover a run</Link>}>
      <Empty sky="none" title="No worktrees to show yet" body="Every session's worktree, recent main commits and open pull requests arrive with the git panel." />
    </ViewFrame>
  );
}
