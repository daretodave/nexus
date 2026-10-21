export const meta = {
  name: 'build-9-9',
  description: 'Build chunk 9.9 in its worktree, adversarially verify, fix, land',
  phases: [{ title: 'Build' }, { title: 'Verify' }, { title: 'Fix' }, { title: 'Land' }],
}
phase('Build')
const build = await agent('You are the builder.', { label: 'build', phase: 'Build' })
phase('Verify')
const found = await agent('You are an adversarial reviewer.', { label: 'verify-1', phase: 'Verify' })
phase('Fix')
const fixed = await agent('You are the builder again.', { label: 'fix-1', phase: 'Fix' })
phase('Land')
await agent('Land it.', { label: 'land', phase: 'Land' })
