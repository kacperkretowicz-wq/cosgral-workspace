# W3-UI3

- Island activation selects the requested pending card and agent; when the request is absent it falls back to the oldest card. Existing dock and island windows remain unchanged.
- Marketplace: search, kind/category filters, details, suggestions, install/update, local-skill protection and uninstall. Deleting an agent requires confirmation. Catalog and bot events reload the view.
- Workflows: create/edit/delete, manual or routine trigger, agent/approval/channel nodes, numerical X/Y positions, visible connections, live validation, run/cancel and history. Connections are edited using selectors and steps are positioned using numeric fields; there is no drag-and-drop. Agent, channel and routine references are entered as IDs.
- Light/dark Storybook examples use demo data. They show the detail and canvas components, not full navigation.

## Verification and limits

- Renderer and Storybook typechecks passed. Biome passed on changed files with one pre-existing CSS specificity warning.
- Focused tests: island selection 1/1, Marketplace local conflict 1/1, workflow validation display 1/1. These do not cover full IPC flows or execution.
- No full suite, build, visual inspection, Electron sandbox or real agent run was performed. Confirmation, installation, event updates, run/cancel and island activation need end-to-end acceptance.
- Canvas positions outside the visible area and many nodes need usability testing. The minimal dock/island windows were not redesigned.
