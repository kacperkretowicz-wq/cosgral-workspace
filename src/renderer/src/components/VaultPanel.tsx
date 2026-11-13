import {
  isVaultItemKind,
  type SaveVaultItemInput,
  type VaultItemKind,
  type VaultItemSummary,
  type VaultStatus,
} from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";
import { createSignal, For, onSettled, Show } from "solid-js";

export function VaultForm(props: {
  initial?: VaultItemSummary;
  kind?: VaultItemKind;
  onSave: (input: SaveVaultItemInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [kind, setKind] = createSignal<VaultItemKind>(props.initial?.kind ?? props.kind ?? "login");
  const [label, setLabel] = createSignal(props.initial?.label ?? "");
  const [url, setUrl] = createSignal(props.initial?.origin ?? "");
  const [username, setUsername] = createSignal(props.initial?.username ?? "");
  const [name, setName] = createSignal(props.initial?.name ?? "");
  const [secret, setSecret] = createSignal("");
  const [key, setKey] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [month, setMonth] = createSignal(props.initial?.cardExpiry?.split("/")[0] ?? "");
  const [year, setYear] = createSignal(props.initial?.cardExpiry?.split("/")[1] ?? "");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  async function save() {
    if (
      props.initial &&
      (kind() === "contact" || kind() === "totp") &&
      !window.confirm(
        "Existing contact fields or account cannot be read back. Saving replaces them with the values entered here. Continue?",
      )
    )
      return;
    const common = { ...(props.initial ? { id: props.initial.id } : {}), label: label().trim() };
    let input: SaveVaultItemInput;
    switch (kind()) {
      case "login":
        input = {
          ...common,
          kind: "login",
          url: url().trim(),
          username: username().trim(),
          ...(secret() ? { password: secret() } : {}),
          ...(key() ? { twoStepKey: key() } : {}),
        };
        break;
      case "card":
        input = {
          ...common,
          kind: "card",
          holderName: name(),
          expiryMonth: Number(month()),
          expiryYear: Number(year()),
          ...(secret() ? { number: secret() } : {}),
          ...(key() ? { cvc: key() } : {}),
        };
        break;
      case "contact":
        input = {
          ...common,
          kind: "contact",
          name: name(),
          ...(email() ? { email: email() } : {}),
          ...(phone() ? { phone: phone() } : {}),
          ...(address() ? { address: address() } : {}),
        };
        break;
      case "apiKey":
        input = { ...common, kind: "apiKey", name: name(), ...(secret() ? { value: secret() } : {}) };
        break;
      case "totp":
        input = {
          ...common,
          kind: "totp",
          issuer: name(),
          ...(username() ? { account: username() } : {}),
          ...(secret() ? { secret: secret() } : {}),
        };
        break;
    }
    setBusy(true);
    setError("");
    try {
      await props.onSave(input);
      setSecret("");
      setKey("");
    } catch {
      setError("Could not save item. Check the fields and encryption status.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="w2-panel" aria-label="Vault item form">
      <h3>{props.initial ? "Edit item" : "Add item"}</h3>
      <label>
        Kind
        <select
          aria-label="Kind"
          disabled={!!props.initial || !!props.kind}
          value={kind()}
          onChange={(e) => {
            const value = e.currentTarget.value;
            if (isVaultItemKind(value)) setKind(value);
          }}
        >
          <option value="login">Login</option>
          <option value="card">Card</option>
          <option value="contact">Contact</option>
          <option value="apiKey">API key</option>
          <option value="totp">Authenticator</option>
        </select>
      </label>
      <label>
        Label
        <input value={label()} onInput={(e) => setLabel(e.currentTarget.value)} />
      </label>
      <Show when={kind() === "login"}>
        <label>
          Site URL
          <input value={url()} onInput={(e) => setUrl(e.currentTarget.value)} />
        </label>
        <label>
          Username
          <input value={username()} onInput={(e) => setUsername(e.currentTarget.value)} />
        </label>
        <label>
          Password
          <input
            aria-label="Password"
            type="password"
            autocomplete="new-password"
            value={secret()}
            onInput={(e) => setSecret(e.currentTarget.value)}
          />
        </label>
        <label>
          Two-step key
          <input type="password" autocomplete="off" value={key()} onInput={(e) => setKey(e.currentTarget.value)} />
        </label>
      </Show>
      <Show when={kind() === "card"}>
        <label>
          Cardholder
          <input value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label>
          Card number
          <input
            type="password"
            autocomplete="off"
            value={secret()}
            onInput={(e) => setSecret(e.currentTarget.value)}
          />
        </label>
        <label>
          Expiry month
          <input type="number" value={month()} onInput={(e) => setMonth(e.currentTarget.value)} />
        </label>
        <label>
          Expiry year
          <input type="number" value={year()} onInput={(e) => setYear(e.currentTarget.value)} />
        </label>
        <label>
          Security code
          <input type="password" autocomplete="off" value={key()} onInput={(e) => setKey(e.currentTarget.value)} />
        </label>
      </Show>
      <Show when={kind() === "contact"}>
        <label>
          Name
          <input value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label>
          Email
          <input value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
        </label>
        <label>
          Phone
          <input value={phone()} onInput={(e) => setPhone(e.currentTarget.value)} />
        </label>
        <label>
          Address
          <textarea value={address()} onInput={(e) => setAddress(e.currentTarget.value)} />
        </label>
      </Show>
      <Show when={kind() === "apiKey" || kind() === "totp"}>
        <label>
          {kind() === "apiKey" ? "Variable name" : "Issuer"}
          <input value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <Show when={kind() === "totp"}>
          <label>
            Account
            <input value={username()} onInput={(e) => setUsername(e.currentTarget.value)} />
          </label>
        </Show>
        <label>
          Secret
          <input
            type="password"
            autocomplete="off"
            value={secret()}
            onInput={(e) => setSecret(e.currentTarget.value)}
          />
        </label>
      </Show>
      <Show when={props.initial}>
        <small>Leave secret fields empty to keep their existing values.</small>
        <Show when={kind() === "contact" || kind() === "totp"}>
          <p>
            Existing contact fields or account cannot be read back. Enter all values to retain them; blank values
            replace the old ones.
          </p>
        </Show>
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <button type="button" disabled={busy()} onClick={() => void save()}>
        Save item
      </button>
      <Show when={props.onCancel}>
        <button type="button" onClick={() => props.onCancel?.()}>
          Cancel
        </button>
      </Show>
    </section>
  );
}

export function VaultPanel() {
  const [items, setItems] = createSignal<VaultItemSummary[]>([]);
  const [status, setStatus] = createSignal<VaultStatus>();
  const [editing, setEditing] = createSignal<VaultItemSummary>();
  const [adding, setAdding] = createSignal(false);
  const [error, setError] = createSignal("");
  let serial = 0;
  async function refresh() {
    const api = window.openbot.vault;
    if (!api) {
      setError("Vault is unavailable in this build.");
      return;
    }
    const n = ++serial;
    try {
      const [list, value] = await Promise.all([api.list(), api.status()]);
      if (n === serial) {
        setItems(list);
        setStatus(value);
        setError("");
      }
    } catch {
      if (n === serial) setError("Could not load Vault.");
    }
  }
  onSettled(() => {
    void refresh();
    if (!window.openbot.vault) return;
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "vault-changed") void refresh();
    });
    return () => {
      serial++;
      off();
    };
  });
  return (
    <section class="w2-panel" aria-label="Vault">
      <h2>Vault</h2>
      <Show when={status()}>
        {(s) => (
          <p>
            {s().encryptionAvailable
              ? "System encryption available"
              : "System encryption unavailable — saving is disabled"}{" "}
            · {s().items} items
          </p>
        )}
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <For each={items()}>
        {(item) => (
          <article class="w2-item">
            <strong>{item.label}</strong>
            <span>
              {item.kind} {item.origin ?? item.name ?? item.cardLast4 ?? ""}
            </span>
            <div>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setEditing(item);
                }}
              >
                Edit
              </button>{" "}
              <button
                type="button"
                onClick={() => {
                  const vault = window.openbot.vault;
                  if (vault && window.confirm(`Delete ${item.label}?`))
                    void vault
                      .delete({ itemId: item.id })
                      .then(refresh)
                      .catch(() => setError("Could not delete item."));
                }}
              >
                Delete
              </button>
            </div>
          </article>
        )}
      </For>
      <button
        type="button"
        disabled={!status()?.encryptionAvailable}
        onClick={() => {
          setEditing(undefined);
          setAdding(true);
        }}
      >
        Add item
      </button>
      <Show when={editing() ?? (adding() ? "new" : undefined)} keyed>
        {(item) => (
          <VaultForm
            initial={isString(item) ? undefined : item}
            onCancel={() => {
              setAdding(false);
              setEditing(undefined);
            }}
            onSave={async (input) => {
              const vault = window.openbot.vault;
              if (!vault) throw new Error("Vault unavailable");
              await vault.save(input);
              setAdding(false);
              setEditing(undefined);
              await refresh();
            }}
          />
        )}
      </Show>
    </section>
  );
}
