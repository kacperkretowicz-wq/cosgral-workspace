# W3-UI1

## Agent activity and computer control

The existing agent rows show limit/reset and error states. Active computer control appears below the agent row with a Stop button, which calls the computer-use API and revokes the session. The initial state and subsequent events update the list. Light and dark sidebar stories include a demo.

Validation: Sidebar.eyes-local.test.tsx 5/5; renderer typecheck passed before formatting; Biome passed with an existing CSS specificity warning. The app and stories were not visually inspected.

## Remaining

Agent settings and templates, application settings and onboarding, island activation, workflows, and remote desktop screens are not implemented by this change.
