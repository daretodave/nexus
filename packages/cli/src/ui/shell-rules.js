// The shell's pure rules: the Vault rail item's words and weight, and where
// the cockpit's tray line sits. No React, so the tests read them directly.

/**
 * The Vault item's tooltip and weight (every view board's rail): an owner's
 * vault holds this repo's secret names; a contributor's checkout needs no
 * project secrets, so the item draws quiet.
 */
export function vaultRail(owner) {
  return owner
    ? { tip: 'Vault: secret names for this repo', quiet: false }
    : { tip: "No project secrets needed: contributors open PRs; the owner's loop deploys.", quiet: true };
}

/**
 * The tray line, measured: how far the parked tray's middle sits above the
 * left pane's bottom. nexus.css fixes --tray-y at 361px (397px with a routed
 * composer; 319/355px below 800px of height), the dock's heights added up; a
 * routed docked composer grows with its content (height: auto), so the app
 * measures where the tray really is. Null without a tray: the CSS stands.
 */
export function trayY(pane, tray) {
  if (!pane || !tray) return null;
  const p = pane.getBoundingClientRect();
  const t = tray.getBoundingClientRect();
  if (!p.height || !t.height) return null;
  return Math.round(p.bottom - (t.top + t.height / 2));
}
