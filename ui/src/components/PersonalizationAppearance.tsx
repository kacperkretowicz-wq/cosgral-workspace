import { usePersonalization } from "../hooks/usePersonalization";
/** Applies the same saved appearance outside the project conversation. */
export function PersonalizationAppearance({ userId, companyId }: { userId: string; companyId: string }) {
  usePersonalization(userId, companyId);
  return null;
}
