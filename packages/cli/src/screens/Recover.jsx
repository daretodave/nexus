// STUB (41.3 foundation). Screen agent: build recover from
// design/handoff/Recover.dc.html (+ Light): .rec-wrap with Dropzone,
// recent runs, .run-card and Runline. Data: useRecover(dir).
import { Link } from 'react-router-dom';
import { ViewFrame, Icon, Empty, useShell } from '../ui/index.js';
import { PATHS } from '../routes.js';

export default function Recover() {
  const { repo } = useShell();
  return (
    <ViewFrame current="fleet" title="Recover" sub={repo} actions={<Link className="btn btn-s" to={PATHS.fleet}><Icon name="fleet" size={14} />Fleet</Link>}>
      <Empty sky="waiting" title="No run loaded" body="Pick a folder on the left, or one of the recent runs. Nothing runs until you choose a step to resume from." />
    </ViewFrame>
  );
}
