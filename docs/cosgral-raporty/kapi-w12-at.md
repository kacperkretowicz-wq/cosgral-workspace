# KAPI-AT — odświeżenie i18n-inwentarz + parytet

**Gałąź:** `team/kapi/w12-p`  
**Baza integracji:** `2dfb55f09`  
**Kolejka:** #36

## Zakres
- `docs/cosgral/i18n-inwentarz.md` — **Stan aktualny (19.11, KAPI-AT)**; metryki KAPI-P → archiwum
- `i18n.test.tsx` — rozszerzona lista powierzchni (Routine/Vault/Memory/ApprovalRules/Conversation/*)
- Metryki: **2219/2219** kluczy; ~119 plików z `t()`; **9** sztywnych aria (tylko Remote/Mobile KK)

## Testy
- `i18n` 8/8
- Biome na własnych plikach

## Luki
- `#3` / `#7` `dist:win` bez `GO-kapi-dist.txt`
- Inwentarz nie jest AST (template / dynamiczne klucze)

## Notka UI / KK
Sztywne aria zostały tylko w Remote/Mobile — reszta KAPI po `t()`. Po tipie: dedupe kluczy przy merge.
