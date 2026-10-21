// STUB (41.3 foundation). Screen agent: build the six steps from
// design/handoff/Welcome (+ WelcomeAgent), Detect (+ DetectMissing),
// Shape (+ ShapeContributor), Plot, CloudSetup, Launch (+ Light) with Ob,
// Stepper, OwnerPick, Switch, Panel. Data: usePreflight(), usePrompts(),
// server.setPrefs / setOwner / adopt.
import { useParams } from 'react-router-dom';
import { Ob, Wordmark, Stepper, STEPS, Empty } from '../ui/index.js';
import { PATHS } from '../routes.js';

export default function Onboarding() {
  const { step } = useParams();
  const current = STEPS.some((s) => s.id === step) ? step : 'welcome';
  const at = STEPS.findIndex((s) => s.id === current);
  return (
    <Ob top={<><Wordmark /><Stepper current={current} done={STEPS.slice(0, at).map((s) => s.id)} hrefFor={PATHS.onboarding} /></>}>
      <Empty sky="waiting" title={STEPS[at].label} body="This step arrives with the onboarding screens." />
    </Ob>
  );
}
