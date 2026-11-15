import type { ManagedCliState, SubscriptionsDesktopApi } from '@openbot/contracts/ipc';
import { createSignal, createEffect, For, Show, onSettled, onCleanup } from 'solid-js';
import { Badge, Button, Card, Field, Heading, Input, Switch, Text } from './ui';
export type CliAction = Exclude<keyof SubscriptionsDesktopApi, 'listCli'>;
export type CliInput = {id: ManagedCliState['id']; version?: string | null; customPath?: string | null; autoUpdate?: boolean};
export function cliPathError(path: string): string {
 if (!path.trim()) return '';
 return path.length > 1024 || /[\r\n\0]/.test(path) || !/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(path.trim()) ? 'Podaj pełną ścieżkę do pliku CLI (maks. 1024 znaki).' : '';
}
export function safeCliError(message: string): string {
 return message.replace(/[A-Za-z]:[\\/][^\r\n]*/g, '[ścieżka CLI]').replace(/\/(?:Users|home)\/[^\s]*/g, '[ścieżka CLI]');
}
const sources = {custom:'Własna ścieżka', managed:'Pobrane', system:'Systemowe', none:'Brak'};
const phases = {idle:'Gotowe',checking:'Sprawdzanie wersji', 'awaiting-approval':'Czeka na zgodę w Needs you',downloading:'Pobieranie',verifying:'Sprawdzanie SHA-256',installing:'Instalowanie',removing:'Usuwanie',error:'Nie udało się'};
export function ManagedCliCard(props: {state: ManagedCliState; pending?: boolean; onAction: (action: CliAction, input: CliInput)=>void}) {
 const [path,setPath]=createSignal(''); const [version,setVersion]=createSignal('');
 createEffect(()=>props.state.customPath, value=>{setPath(value ?? '');});
 createEffect(()=>props.state.pinnedVersion, value=>{setVersion(value ?? '');});
 const busy=()=>props.pending || !['idle','error'].includes(props.state.phase);
 const send=(action:CliAction, extra: Omit<CliInput,'id'> = {})=>props.onAction(action,{id:props.state.id,...extra});
 const percent=()=>props.state.progress?.totalBytes ? Math.min(100,Math.max(0,100*props.state.progress.receivedBytes/props.state.progress.totalBytes)) : undefined;
 return <Card class="managed-cli-card">
 <div class="providers-heading"><Heading as="h3" size="md">{props.state.id==='codex'?'Codex':'Claude'}</Heading><Badge>{sources[props.state.source]}</Badge></div>
 <Text as="p">W użyciu: {props.state.version ?? '—'} · Pobrana: {props.state.managedVersion ?? '—'} · Najnowsza: {props.state.latestVersion ?? 'jeszcze nie sprawdzono'}</Text>
 <Text as="p" role="status" aria-live="polite">{phases[props.state.phase]}</Text>
 <Show when={props.state.progress}>{progress=><div role="progressbar" aria-label="Postęp pobierania" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent()}><div class="managed-cli-track"><div class="managed-cli-fill" style={{width:`${percent() ?? 0}%`}} /></div><Text as="p" tone="muted">{progress().receivedBytes} / {progress().totalBytes || '?'} bajtów</Text></div>}</Show>
 <Show when={props.state.error}><Text as="p" tone="danger" role="alert">{safeCliError(props.state.error ?? '')}</Text></Show>
 <div class="managed-cli-actions">
 <Button disabled={busy()} onClick={()=>send('installCli')}>Pobierz</Button>
 <Button disabled={busy()} onClick={()=>send('checkCli')}>Sprawdź</Button>
 <Show when={props.state.managedVersion}><Button disabled={busy()} onClick={()=>send('updateCli')}>Zaktualizuj</Button><Button disabled={busy()} onClick={()=>send('removeCli')}>Usuń</Button></Show>
 <Show when={props.state.error}><Button disabled={busy()} onClick={()=>send(props.state.managedVersion?'updateCli':'installCli')}>Ponów</Button></Show>
 </div>
 <Switch label="Aktualizuj automatycznie" checked={props.state.autoUpdate} disabled={busy()} onChange={autoUpdate=>send('setCliSettings',{autoUpdate})}/>
 <Text as="p" tone="muted">Przypięcie wersji wstrzymuje automatyczne aktualizacje.</Text>
 <Field label="Przypięta wersja"><Input value={version()} onInput={e=>setVersion(e.currentTarget.value)} /></Field>
 <div class="managed-cli-actions"><Button disabled={busy() || !/^[0-9A-Za-z.+-]{1,64}$/.test(version())} onClick={()=>send('pinCli',{version:version()})}>Przypnij</Button><Button disabled={busy() || !props.state.pinnedVersion} onClick={()=>send('pinCli',{version:null})}>Odepnij</Button></div>
 <Field label="Własna ścieżka do CLI" error={cliPathError(path())}><Input value={path()} onInput={e=>setPath(e.currentTarget.value)} /></Field>
 <div class="managed-cli-actions"><Button disabled={busy() || !path().trim() || !!cliPathError(path())} onClick={()=>send('setCliSettings',{customPath:path().trim()})}>Zapisz ścieżkę</Button><Button disabled={busy() || !props.state.customPath} onClick={()=>send('setCliSettings',{customPath:null})}>Wyczyść ścieżkę</Button></div>
 </Card>;
}
export function ManagedCliSection(props: {provider?: string; onReady?: ()=>void}) {
 const [states,setStates]=createSignal<ManagedCliState[]>([]); const [error,setError]=createSignal(''); const [pending,setPending]=createSignal<string[]>([]);
 let revision=0;
 const replace=(state:ManagedCliState)=>setStates(items=>[...items.filter(item=>item.id!==state.id),state].sort((a,b)=>a.id.localeCompare(b.id)));
 async function load(){ const serial=++revision; try {const result=await window.openbot.subscriptions?.listCli(); if(serial===revision) {setStates(result ?? []);setError('');}} catch(e){setError(safeCliError(String(e)));} }
 onSettled(()=>{void load(); const off=window.openbot.agent?.onEvent(event=>{if(event.type==='managed-cli-changed'){revision++;replace(event.state);}});onCleanup(()=>{revision++;off?.();});});
 async function action(method:CliAction,input:CliInput){const api=window.openbot.subscriptions; if(!api)return;setPending(ids=>[...ids,input.id]);setError('');try {
 // Input shape is constrained by each card action; the desktop validates it again.
 const invoke=api[method] as (input:CliInput)=>Promise<ManagedCliState>;
 const state=await invoke(input);replace(state);if(method==='installCli' && state.source!=='none' && state.phase==='idle') props.onReady?.();
 }catch(e){setError(safeCliError(String(e)));}finally{setPending(ids=>ids.filter(id=>id!==input.id));}}
 return <section class="providers-section" aria-label="Narzędzia CLI"><Heading as="h2" size="md">{props.provider?'Połącz dostawcę':'Narzędzia CLI'}</Heading><Text as="p" tone="muted">Własna ścieżka → pobrane → systemowe. Pierwsze pobranie wymaga zgody. Logowanie wkrótce.</Text>
 <Show when={error()}><Text as="p" role="alert" tone="danger">{error()}</Text><Button onClick={()=>void load()}>Ponów wczytanie</Button></Show>
 <Show when={states().length} fallback={<Text as="p" tone="muted">{window.openbot.subscriptions?'Wczytywanie narzędzi CLI…':'Zarządzanie CLI jest niedostępne w tej wersji.'}</Text>}><div class="managed-cli-grid"><For each={states().filter(state=>!props.provider || state.id===props.provider)}>{state=><ManagedCliCard state={state} pending={pending().includes(state.id)} onAction={(method,input)=>void action(method,input)}/>}</For></div></Show></section>;
}

