# W3-UI4

## Remote desktop

The page offers host enable/disable, loopback or LAN and port, one-time token with copy and dismissal, token regeneration, viewer policy and removal, session downgrade to view, and local Stop. A persistent banner offers Stop while a viewer is connected. The client offers address, token and mode, status and a canvas for JPEG frames. Mouse and keyboard input is sent only while connected with control granted. F10 releases keyboard focus. The page warns that the connection is not encrypted outside a secure tunnel.

## Workflows

Nodes can be moved using pointer handles; dragging a connection handle onto a target adds an edge. Approval connections use the selected Allow/Deny path. Numeric coordinates and the connection selectors remain available for keyboard operation. Agent, channel and routine choices load from the corresponding APIs. Missing saved references are marked unavailable.

## Verification and limitations

- Renderer and Storybook typechecks passed. Biome passed on changed files with one pre-existing CSS specificity warning.
- Focused tests: remote token and persistent Stop 2/2; workflow resource selection, node drag and connection drag 3/3.
- No visual inspection, Electron sandbox, two-computer connection, real screen capture, input delivery, approval card or live network test was run. The tests do not establish end-to-end security or performance.
- Storybook examples show the token, Stop banner and workflow canvas in light and dark themes; they do not model a complete host/client session. Screen coordinates, keyboard combinations and frame throughput need real-device acceptance. Workflow pointer drawing and keyboard alternatives need accessibility and usability review.
