// Onboarding: the steps (ui/steps.js STEPS) of design/handoff Welcome (+ WelcomeAgent),
// Detect (+ DetectMissing), Shape (+ ShapeContributor), Secrets (+ SecretsContributor), Plot, CloudSetup
// and Launch, each with its Light board through the tokens alone. One
// draft of the answers is shared across the steps (screens/onboarding/).
import { useParams } from 'react-router-dom';
import { STEPS } from '../ui/index.js';
import { DraftContext, useDraftStore } from './onboarding/draft.js';
import Welcome from './onboarding/Welcome.jsx';
import Detect from './onboarding/Detect.jsx';
import Shape from './onboarding/Shape.jsx';
import Secrets from './onboarding/Secrets.jsx';
import Plot from './onboarding/Plot.jsx';
import CloudSetup from './onboarding/CloudSetup.jsx';
import Launch from './onboarding/Launch.jsx';

const SCREENS = { welcome: Welcome, detect: Detect, shape: Shape, secrets: Secrets, plot: Plot, cloud: CloudSetup, launch: Launch };

export default function Onboarding() {
  const { step } = useParams();
  const draft = useDraftStore();
  const current = STEPS.some((s) => s.id === step) ? step : 'welcome';
  const Screen = SCREENS[current];
  return (
    <DraftContext.Provider value={draft}>
      <Screen />
    </DraftContext.Provider>
  );
}
