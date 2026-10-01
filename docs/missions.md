# Missões urbanas

Missões levam o explorador a lugares de Joinville. Cada missão tem **etapas ordenadas**, cada etapa
acontece num lugar e é comprovada por um **tipo de validação** (na POC, QR code no balcão).

## Modelo e criação (#57, RF26)

- **Missão:** título, descrição, **XP total**, janela de validade (início e fim, no horário de
  Joinville) e status (`active` ou `archived`). De 1 a 10 etapas.
- **Etapa:** posição (1, 2, 3...), o que fazer ("Peça o café especial"), o lugar (`place_id`, sem FK
  entre schemas) e o tipo de validação (`qr`).
- **XP:** o total é dividido entre as etapas e um bônus de conclusão (`xpSplit`): cada etapa vale
  `floor(total / (etapas + 1))` e o bônus fica com o resto. Ex.: 100 XP em 3 etapas = 25 por etapa + 25 de bônus.
  A soma é sempre exatamente o total.
- **Quem cria:**
  - **parceiro** (portal, `/parceiro/missoes`): só com etapas nos lugares que **administra**
    (`placesManagedBy`, API pública de places). Sem lugar, o portal pede para reivindicar um primeiro;
  - **admin**: em qualquer lugar existente (regra no caso de uso e na RLS; sem tela própria na POC).
- **Editar** mantém o id de cada etapa pela posição (o QR impresso da etapa 1 continua valendo).
  **Encerrar** (com confirmação) tira a missão da lista pública e não pode ser desfeito.

### Segurança

- O caso de uso confere o papel, o dono e os lugares; a action usa `withUser` (id sempre da sessão).
- **RLS no schema `missions`** (repositório grava com `asUser`): todos leem; só `partner`/`admin`
  criam, sempre em nome próprio; só o dono ou o admin editam/encerram; o dono não transfere a missão
  (`owner_id` fora do grant de UPDATE); etapas só na própria missão.
- Se o lugar é do parceiro, quem confere é o caso de uso: a RLS não consulta `places` (sem junção entre schemas).
