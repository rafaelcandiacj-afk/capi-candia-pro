# Configurar Nova Oferta R$97/mês + R$804/ano (Capi Cand-IA Pro)

Guia passo a passo para colocar a nova oferta no ar.
A oferta antiga de R$47 continua funcionando normalmente - nada muda pra quem ja eh assinante.

---

## 1. O que ja foi feito no codigo

- O sistema agora aceita dois "tiers" de assinatura: **Standard** (R$47/R$397) e **Pro** (R$97/R$804)
- **IMPORTANTE:** A deteccao do tier eh feita por **OFFER_ID** (ID da oferta na Guru), NAO por product_id nem nome do produto
  - Motivo: As ofertas R$47 e R$97 estao dentro do **mesmo produto** "Capi Când-IA Pro — Mensal" (ID 1773774908)
  - Idem: R$397 e R$804 estao dentro do **mesmo produto** "Capi Când-IA Pro — Anual" (ID 1773783918)
  - Ou seja: product_id e nome do produto NAO diferenciam tier — ambos tem "Pro" no nome
- **Fallback por valor da transacao:** Se o offer_id nao bater com nenhuma env var, o sistema detecta pelo valor:
  - R$97,00-R$396,99 → pro mensal
  - R$804,00+ → pro anual
  - R$47 ou R$397 → standard (nao cai no fallback pro)
- Os emails de notificacao (pra voce, Rafael) mostram o valor REAL do webhook, nao hardcoded
- O webhook do PagarMe tambem foi atualizado (deteccao por valor da transacao)

---

## 2. O que voce precisa fazer na Guru (passo a passo)

### Passo 1: Criar a OFERTA de R$97 (mensal)

**NAO precisa criar produto novo!** A oferta fica dentro do produto existente "Capi Când-IA Pro — Mensal" (ID 1773774908).

1. Entre no painel da Guru (clkdmg.site)
2. Va em **Produtos** > encontre "Capi Când-IA Pro — Mensal"
3. Dentro do produto, crie uma **nova oferta** com preco **R$ 97,00**
4. **ANOTE o ID da oferta** (offer_id) — eh um numero/string que aparece nas configuracoes da oferta
5. O link do checkout mensal sera algo como: `https://clkdmg.site/subscribe/mensal-capi-candia-pro`

### Passo 2: Criar a OFERTA de R$804 (anual)

**NAO precisa criar produto novo!** A oferta fica dentro do produto existente "Capi Când-IA Pro — Anual" (ID 1773783918).

1. Dentro do produto "Capi Când-IA Pro — Anual", crie uma **nova oferta** com preco **R$ 804,00**
2. **ANOTE o ID da oferta** (offer_id)
3. O link do checkout anual sera algo como: `https://clkdmg.site/subscribe/anual-capi-candia-pro`

### Passo 3: Verificar o webhook

1. Va em **Configuracoes** > **Webhooks** (ou **Integracao** > **Webhooks**)
2. Verifique se ja existe um webhook apontando para: `https://capicand-ia.com/api/webhook/guru`
3. Se ja existe, **NAO precisa criar outro** — o mesmo webhook serve para todas as ofertas
4. Se nao existe, crie um novo webhook com:
   - **URL:** `https://capicand-ia.com/api/webhook/guru`
   - **Eventos:** Assinatura ativada, Pagamento confirmado, Assinatura cancelada, Assinatura expirada
   - **Formato:** JSON

---

## 3. Variaveis de ambiente no Railway

Depois de criar as ofertas na Guru, adicione as variaveis no Railway:

1. Entre no Railway (railway.app)
2. Clique no seu projeto (Capi Cand-IA)
3. Va em **Variables**
4. Adicione estas variaveis:

| Nome da variavel | Valor | O que eh |
|---|---|---|
| `GURU_OFFER_ID_MONTHLY_97` | `(ID da oferta mensal R$97 que voce criou)` | Offer ID da oferta mensal R$97 na Guru |
| `GURU_OFFER_ID_ANNUAL_804` | `(ID da oferta anual R$804 que voce criou)` | Offer ID da oferta anual R$804 na Guru |

**Variaveis antigas (opcionais/deprecated):**

| Nome da variavel | Valor | Status |
|---|---|---|
| `GURU_PRODUCT_ID_MONTHLY_97` | (codigo do produto) | DEPRECATED — NAO usado pra detectar tier |
| `GURU_PRODUCT_ID_ANNUAL_97` | (codigo do produto) | DEPRECATED — NAO usado pra detectar tier |

5. Clique em **Deploy** (ou espere o deploy automatico)

---

## 4. Configuracao do Resend (email)

**NAO precisa mudar nada no Resend.** Os emails ja estao configurados e funcionam para qualquer oferta.
O email de notificacao ao Rafael mostra o valor REAL da transacao (vindo do webhook).

---

## 5. Como testar antes de ir ao ar

### Teste unitario (sem servidor):

```bash
node backend/test-webhook-r97.js
```

Deve mostrar 34 testes passando, incluindo os cenarios criticos:
- R$47 com produto "Pro" → tier = standard (NAO vira pro!)
- R$97 com offer_id correto → tier = pro
- R$397 com produto "Pro Anual" → tier = standard
- R$804 com offer_id correto → tier = pro
- Fallback por valor sem offer_id configurado

### Teste real com webhook:

1. Faca uma compra de teste no checkout novo
2. Verifique nos logs do Railway:
   - `Guru tier detectado: pro (source: offer_id, ...)`
   - `Guru: plano ativado para [email]: tier=pro`
3. Verifique se voce recebeu o email de notificacao com badge "PRO" e valor correto
4. Verifique se o usuario recebeu o email de boas-vindas

---

## 6. Checklist final

- [ ] Oferta mensal R$97 criada na Guru (dentro do produto existente)
- [ ] Oferta anual R$804 criada na Guru (dentro do produto existente)
- [ ] Offer ID da oferta mensal anotado
- [ ] Offer ID da oferta anual anotado
- [ ] Variavel `GURU_OFFER_ID_MONTHLY_97` adicionada no Railway
- [ ] Variavel `GURU_OFFER_ID_ANNUAL_804` adicionada no Railway
- [ ] Deploy feito no Railway
- [ ] `node backend/test-webhook-r97.js` — 34 testes passando
- [ ] Teste com compra real funcionou
- [ ] Email de notificacao pro Rafael chegou com badge PRO e valor correto
- [ ] Email de boas-vindas pro cliente chegou

---

## 7. Racional tecnico

### Por que offer_id e nao product_id?

Na Guru, um **produto** pode ter multiplas **ofertas** com precos diferentes. No nosso caso:
- Produto "Capi Când-IA Pro — Mensal" (1773774908) tem oferta R$47 (standard) E oferta R$97 (pro)
- Produto "Capi Când-IA Pro — Anual" (1773783918) tem oferta R$397 (standard) E oferta R$804 (pro)

Se usassemos product_id, todos os assinantes de R$47 seriam classificados como "pro" — um bug critico.

### Ordem de precedencia na deteccao:
1. **offer_id** (env var) — fonte principal e mais confiavel
2. **valor da transacao** — fallback de seguranca (R$97-R$396 → pro mensal, R$804+ → pro anual)
3. **Tudo mais** → standard

### Observacoes
- O arquivo `backend/server.js` eh muito grande (340KB, 5000+ linhas). Idealmente deveria ser separado em modulos.
- A API key do Resend tem fallback hardcoded no codigo — deveria estar apenas na env var.
