// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentConfigurationSummaryView } from './AgentConfigurationSummary';
describe('agent configuration summary', () => {
 it('shows authoritative counts, all states and redacted errors', () => {
  for (const [state, label] of Object.entries({ available: 'dostępny', working: 'pracuje', waiting: 'oczekuje', offline: 'offline', error: 'błąd' })) {
   const html = renderToStaticMarkup(<AgentConfigurationSummaryView stats={{ completedTasks: 12, state: state as 'available', recentErrors: [{ id: 'r', at: '2026-11-04', message: 'Błąd wykonania' }] }} />);
   expect(html).toContain(label); expect(html).toContain('12'); expect(html).toContain('Błąd wykonania');
  }
 });
 it('does not claim runtime integrations are verified', () => {
  const html = renderToStaticMarkup(<AgentConfigurationSummaryView />);
  expect(html).toContain('niezweryfikowane'); expect(html).toContain('deklaracje');
 });
});
