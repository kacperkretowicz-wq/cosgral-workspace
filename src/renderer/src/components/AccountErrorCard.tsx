import type { AccountError } from "@openbot/contracts/ipc";
import { Button, Card, Heading, Text } from "./ui";
/** Network failures are informational. Do not repeat diagnostic wording about quotas in this card. */
export function AccountErrorCard(props: { view: AccountError; onDismiss: () => void }) {
  return (
    <Card
      class="account-switched-card"
      role="status"
      aria-live="polite"
      aria-label={`Network error for ${props.view.accountLabel}`}
    >
      <Heading as="h3" size="sm">
        Connection problem
      </Heading>
      <Text as="p">Network error on {props.view.accountLabel}. Your account stayed selected.</Text>
      <Text as="p" tone="secondary">
        Check your connection and send the message again when you are ready.
      </Text>
      <Button variant="ghost" type="button" onClick={props.onDismiss}>
        Dismiss
      </Button>
    </Card>
  );
}
