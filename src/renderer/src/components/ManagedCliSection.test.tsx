import { render, screen, fireEvent } from '@solidjs/testing-library';
import { describe, it, expect, vi } from 'vitest';
import { ManagedCliCard, cliPathError, safeCliError } from './ManagedCliSection';
import type { ManagedCliState } from '@openbot/contracts/ipc';
export const emptyCli: ManagedCliState = {id:'codex',source:'none',executable:null,version:null,managedVersion:null,pinnedVersion:null,latestVersion:null,autoUpdate:true,customPath:null,phase:'idle',progress:null,error:null,checkedAt:null};
describe('managed CLI controls',()=>{
 it('validates paths and hides profile paths in errors',()=>{expect(cliPathError('relative.exe')).toBeTruthy(); expect(cliPathError('C:\\Tools\\codex.exe')).toBe(''); expect(safeCliError('Failed C:\\Users\\Example\\cli.exe')).not.toContain('Example');});
 it('offers install, never removal for a system CLI',()=>{render(()=><ManagedCliCard state={{...emptyCli,source:'system'}} onAction={vi.fn()}/>);expect(screen.queryByRole('button',{name:'Usuñ'})).toBeNull();});
 it('sends install and disables it while downloading',async()=>{const action=vi.fn();render(()=><ManagedCliCard state={emptyCli} onAction={action}/>);fireEvent.click(screen.getByRole('button',{name:'Pobierz'}));expect(action).toHaveBeenCalledWith('installCli',{id:'codex'});});
});
