import type {AgentModelOption} from '@openbot/contracts/ipc';
import {Show} from 'solid-js';
import type {BotProfile} from '../data';
import {Badge} from './ui';
export function FallbackModelBadge(props:{bot:Pick<BotProfile,'model'|'activeModel'>;models?:AgentModelOption[]}){
 const model=()=>props.bot.activeModel && props.bot.activeModel!==props.bot.model ? props.bot.activeModel : null;
 return <Show when={model()}>{active=><Badge class="fallback-model-badge" size="sm" role="status">model zapasowy: {props.models?.find(item=>item.id===active())?.name ?? active()}</Badge>}</Show>;
}
