import {Show} from "solid-js";
import {expect,userEvent,within,waitFor} from "storybook/test";
import type {Meta,StoryObj} from "storybook-solidjs-vite";
import {ContextIndicator} from "../src/components/ContextIndicator";
import {ContextSettingsSection} from "../src/components/ContextSettingsSection";
import {createMockContext} from "./mock-context";
import {createMockOpenBot} from "./mock-openbot";
import {ThemeFrame} from "./theme-frame";
function Scene(props:{variant:"reported"|"unavailable"|"warning"|"compacting"|"settings";light?:boolean}){return <ThemeFrame theme={props.light?"light":"dark"}><div class="w2-library providers-page"><Show when={props.variant==="settings"} fallback={<ContextIndicator botId="chief" threadId="one"/>}><ContextSettingsSection/></Show></div></ThemeFrame>;}
const meta={title:"COSGRAL/Context controls",component:Scene,args:{variant:"reported",light:false},beforeEach:async({args})=>{
 const previous=window.openbot;const mock=createMockOpenBot();const api=createMockContext(mock.emitAgentEvent);
 if(args.variant==="unavailable")api.simulate.silent("chief","one","This provider does not report context usage.",false);
 else api.simulate.report("chief","one",args.variant==="warning"?8200:4200,10000);
 if(args.variant==="compacting")await api.compact({botId:"chief",threadId:"one"});
 window.openbot={...mock.api,context:api};return()=>{mock.dispose();window.openbot=previous;};
}} satisfies Meta<typeof Scene>;
export default meta;type Story=StoryObj<typeof meta>;
export const Reported:Story={play:async({canvasElement})=>{const c=within(canvasElement);await expect(await c.findByText("4,200 / 10,000 tokens (42%)")).toBeInTheDocument();await expect(c.getByRole("progressbar")).toHaveAttribute("value","42");}};
export const Unavailable:Story={args:{variant:"unavailable"},play:async({canvasElement})=>{const c=within(canvasElement);await expect(await c.findByText(/This provider does not report context usage/)).toBeInTheDocument();await expect(c.queryByRole("progressbar")).not.toBeInTheDocument();await expect(c.queryByRole("button",{name:"Compact"})).not.toBeInTheDocument();}};
export const Warning:Story={args:{variant:"warning"},play:async({canvasElement})=>{await expect(await within(canvasElement).findByText("Context is getting full")).toBeInTheDocument();}};
export const Compacting:Story={args:{variant:"compacting"},play:async({canvasElement})=>{const c=within(canvasElement);await expect(await c.findByText(/Compacting context/)).toBeInTheDocument();await expect(c.getByRole("button",{name:"Compact"})).toBeDisabled();}};
export const Settings:Story={args:{variant:"settings"},play:async({canvasElement})=>{const c=within(canvasElement);const input=await c.findByLabelText("Compaction threshold (%)");await userEvent.clear(input);await userEvent.type(input,"85");await userEvent.click(c.getByRole("switch",{name:"Automatically compact context"}));await userEvent.click(c.getByRole("button",{name:"Save context settings"}));await waitFor(()=>expect(c.getByText("Context settings saved.")).toBeInTheDocument());}};
export const Light:Story={args:{variant:"warning",light:true},play:async({canvasElement})=>{await expect(await within(canvasElement).findByRole("progressbar")).toHaveAttribute("value","82");}};
