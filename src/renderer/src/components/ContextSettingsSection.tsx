import type {ContextDesktopApi,ContextSettings} from "@openbot/contracts/ipc";
import {applyContextSettings,CONTEXT_SETTINGS_LIMITS} from "@openbot/contracts/ipc";
import {createSignal,onSettled,Show} from "solid-js";
import type {ContextEvents} from "./ContextIndicator";
import {providerError} from "./provider-error";
import {Button,Card,Field,Heading,Input,Switch,Text} from "./ui";
import "../styles/context.css";
export function ContextSettingsSection(props:{api?:ContextDesktopApi;onEvent?:ContextEvents}={}) {
 const api=props.api??window.openbot?.context;
 const [settings,setSettings]=createSignal<ContextSettings>();const [threshold,setThreshold]=createSignal("");const [busy,setBusy]=createSignal(false);const [error,setError]=createSignal("");const [notice,setNotice]=createSignal("");
 let generation=0;
 onSettled(()=>{
  const serial=++generation;
  void api?.getSettings().then(next=>{if(serial===generation){setSettings(next);setThreshold(String(next.thresholdPercent));}}).catch(e=>setError(providerError(e,"Could not load context settings.")));
  const off=(props.onEvent??window.openbot?.agent?.onEvent)?.(event=>{if(event.type==="context-settings-changed"){generation++;setSettings({autoCompact:event.autoCompact,thresholdPercent:event.thresholdPercent});setThreshold(String(event.thresholdPercent));}});
  return ()=>{generation++;off?.();};
 });
 async function save(){const value=settings();if(!value||!api||busy())return;
  let next:ContextSettings;
  try {next=applyContextSettings(value,{thresholdPercent:Number(threshold())});} catch(e){setError(providerError(e,"Invalid threshold."));return;}
  setBusy(true);setError("");setNotice("");
  try {const saved=await api.updateSettings(next);setSettings(saved);setThreshold(String(saved.thresholdPercent));setNotice("Context settings saved.");}
  catch(e){setError(providerError(e,"Could not save context settings."));}finally{setBusy(false);}
 }
 return <Card class="context-panel" role="region" aria-label="Context settings"><Heading as="h3" size="sm">Conversation context</Heading>
 <Text as="p" tone="secondary">Automatically compact reported context near the chosen threshold. A warning appears from {CONTEXT_SETTINGS_LIMITS.warnPercent}%.</Text>
 <Show when={error()}><Text as="p" tone="danger" role="alert">{error()}</Text></Show>
 <Show when={settings()} fallback={<Text as="p" tone="secondary">{api?"Loading context settings...":"Context settings are unavailable in this version."}</Text>}>{value=><>
 <Switch label="Automatically compact context" checked={value().autoCompact} disabled={busy()} onChange={autoCompact=>setSettings(current=>current?{...current,autoCompact}:current)}/>
 <Field label="Compaction threshold (%)" description={`Whole number from ${CONTEXT_SETTINGS_LIMITS.minThresholdPercent} to ${CONTEXT_SETTINGS_LIMITS.maxThresholdPercent}; default ${CONTEXT_SETTINGS_LIMITS.defaultThresholdPercent}.`}><Input type="number" min={CONTEXT_SETTINGS_LIMITS.minThresholdPercent} max={CONTEXT_SETTINGS_LIMITS.maxThresholdPercent} step={1} value={threshold()} disabled={busy()} onInput={e=>setThreshold(e.currentTarget.value)}/></Field>
 <Button disabled={busy()} onClick={()=>void save()}>Save context settings</Button>
 </>}</Show><Show when={notice()}><Text as="p" role="status">{notice()}</Text></Show></Card>;
}
