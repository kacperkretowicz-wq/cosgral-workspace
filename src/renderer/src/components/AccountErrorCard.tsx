import type { AccountError } from "@openbot/contracts/ipc";
import { t } from "../i18n";
import { Button, Card, Heading, Text } from "./ui";
/** Network failures are informational. Do not repeat diagnostic wording about quotas in this card. */
export function AccountErrorCard(props: { view: AccountError; onDismiss: () => void }) {
  return (
    <Card
      class="account-switched-card"
      role="status"
      aria-live="polite"
      aria-label={t("Network error for {account}", { account: props.view.accountLabel })}
    >
      <Heading as="h3" size="sm">
        {t("Connection problem")}
      </Heading>
      <Text as="p">
        {t("Network error on {account}. Your account stayed selected.", { account: props.view.accountLabel })}
      </Text>
      <Text as="p" tone="secondary">
        {t("Check your connection and send the message again when you are ready.")}
      </Text>
      <Button variant="ghost" type="button" onClick={props.onDismiss}>
        {t("Dismiss")}
      </Button>
    </Card>
  );
}
