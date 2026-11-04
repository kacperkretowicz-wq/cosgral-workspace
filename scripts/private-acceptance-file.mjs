import { lstat, readFile, open } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const exec = promisify(execFile);
const windowsAclCheck = `
$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
try {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $acl = Get-Acl -LiteralPath $env:PAPERCLIP_PRIVATE_ACCEPTANCE_FILE
  if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid) { exit 1 }
  $allowed = @($sid, 'S-1-5-18', 'S-1-5-32-544')
  if ($env:PAPERCLIP_PRIVATE_ACCEPTANCE_MODE -eq 'create') {
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $acl.SetOwner([System.Security.Principal.SecurityIdentifier]::new($sid))
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($trustedSid in $allowed) {
      $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
        [System.Security.Principal.SecurityIdentifier]::new($trustedSid), 'FullControl', 'Allow'))
    }
    Set-Acl -LiteralPath $env:PAPERCLIP_PRIVATE_ACCEPTANCE_FILE -AclObject $acl
    $acl = Get-Acl -LiteralPath $env:PAPERCLIP_PRIVATE_ACCEPTANCE_FILE
  }
  foreach ($entry in $acl.Access) {
    if ($entry.AccessControlType -eq 'Allow' -and
        $entry.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin $allowed) { exit 1 }
  }
  exit 0
} catch { exit 1 }
`;

async function assertPrivate(path, mode = 'read') {
  const stat = await lstat(path);
  if (!stat.isFile()) throw new Error('private file must be a regular file');
  if (process.platform === 'win32') {
    try {
      await exec(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-Command', windowsAclCheck], {
          env: { ...process.env, PAPERCLIP_PRIVATE_ACCEPTANCE_FILE: path, PAPERCLIP_PRIVATE_ACCEPTANCE_MODE: mode },
          timeout: 15000, maxBuffer: 65536, windowsHide: true,
        });
    } catch { throw new Error('private file must be owned by the current user with a private Windows ACL'); }
  } else if ((stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid()) {
    throw new Error('private file must be owned by current user, regular, mode 0600');
  }
}

export async function createPrivateAcceptanceFile(path, contents) {
  const handle = await open(path, 'wx', 0o600);
  try {
    // Establish privacy while the new file is empty, before writing credentials.
    await assertPrivate(path, 'create');
    await handle.writeFile(contents, 'utf8');
  } finally { await handle.close(); }
}

export async function readPrivateAcceptanceJson(path) {
  await assertPrivate(path);
  const contents = await readFile(path, 'utf8');
  try { return JSON.parse(contents); } catch { throw new Error('invalid private JSON file (contents withheld)'); }
}
