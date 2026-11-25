import type { BotProfile } from "../data";
import { t } from "../i18n";
import { RoutinePanel } from "./RoutinePanel";
import { ScheduleOverview } from "./ScheduleOverview";
import { CalendarClock, RefreshCw } from "./ui/icons";
import { WorkPage, WorkPageSections } from "./WorkPage";

/** Schedule: the plan of the coming days as a timeline, and the routines that fill it. */
export function SchedulePage(props: { bots: ReadonlyArray<BotProfile> }) {
  return (
    <WorkPage
      page="schedule"
      title={t("Schedule")}
      description={t("What your agents will do and when, and what already ran.")}
      class="schedule-page"
    >
      <WorkPageSections
        page="schedule"
        label={t("Schedule sections")}
        sections={[
          {
            id: "plan",
            label: t("Plan"),
            description: t("Planned and finished routine runs, day by day."),
            icon: CalendarClock,
            render: () => <ScheduleOverview bots={props.bots} />,
          },
          {
            id: "routines",
            label: t("Routines"),
            description: t("Repeating work: what an agent does, how often, and where it reports."),
            icon: RefreshCw,
            render: () => <RoutinePanel bots={[...props.bots]} heading={false} />,
          },
        ]}
      />
    </WorkPage>
  );
}
