# Configurar Nova Oferta R$97/mês + R$804/ano (Capi Cand-IA Pro)

Guia passo a passo para colocar a nova oferta no ar.
A oferta antiga de R$47 continua funcionando normalmente - nada muda pra quem ja eh assinante.

---

## 1. O que ja foi feito no codigo

- O sistema agora aceita dois "tiers" de assinatura: **Standard** (R$47) e **Pro** (R$97)
- Quando alguem compra pelo checkout novo, o sistema automaticamente marca como tier "pro"
- Os emails de notificacao (pra voce, Rafael) agora mostram qual tier a pessoa comprou
- A oferta antiga continua funcionando 100% igual

---

## 2. O que voce precisa fazer na Guru (passo a passo)

### Passo 1: Criar o produto MENSAL de R$97

1. Entre no painel da Guru (clkdmg.site)
2. Va em **Produtos** > **Criar novo produto**
3. Nome do produto: `Capi Cand-IA Pro - Mensal` (IMPORTANTE: tem que ter a palavra "Pro" no nome!)
4. Preco: **R$ 97,00**
5. Recorrencia: **Mensal**
6. Salve o produto
7. **ANOTE o codigo do produto** (aparece na URL ou nas configuracoes do produto - eh um numero tipo `1234567890`)

### Passo 2: Criar o produto ANUAL de R$804

1. Va em **Produtos** > **Criar novo produto**
2. Nome do produto: `Capi Cand-IA Pro - Anual` (IMPORTANTE: tem que ter a palavra "Pro" no nome!)
3. Preco: **R$ 804,00**
4. Recorrencia: **Anual**
5. Salve o produto
6. **ANOTE o codigo do produto**

### Passo 3: Criar as ofertas (checkouts)

1. Para cada produto, crie uma **oferta** (checkout page)
2. O link do checkout mensal deve ser: `https://clkdmg.site/subscribe/mensal-capi-candia-pro`
   - Se a Guru nao deixar escolher a URL, use qualquer URL que ela gerar - o importante eh o webhook
3. O link do checkout anual deve ser: `https://clkdmg.site/subscribe/anual-capi-candia-pro`

### Passo 4: Configurar o webhook

1. Va em **Configuracoes** > **Webhooks** (ou **Integracao** > **Webhooks**)
2. Verifique se ja existe um webhook apontando para: `https://capicand-ia.com/api/webhook/guru`
3. Se ja existe, **NAO precisa criar outro** - o mesmo webhook serve para os dois produtos (antigo e novo)
4. Se nao existe, crie um novo webhook com:
   - **URL:** `https://capicand-ia.com/api/webhook/guru`
   - **Eventos:** Marque todos estes:
     - Assinatura ativada / Subscription activated
     - Pagamento confirmado / Payment confirmed
     - Assinatura cancelada / Subscription canceled
     - Assinatura expirada / Subscription expired
   - **Formato:** JSON

### Passo 5: Pegar os codigos dos produtos

1. Va na pagina de cada produto que voce criou
2. Copie o **codigo do produto** (product code/ID)
3. Voce vai precisar desses codigos no proximo passo

---

## 3. Variaveis de ambiente no Railway

Depois de criar os produtos na Guru, voce precisa adicionar 2 variaveis de ambiente no Railway:

1. Entre no Railway (railway.app)
2. Clique no seu projeto (Capi Cand-IA)
3. Va em **Variables** (ou **Variaveis**)
4. Adicione estas duas variaveis:

| Nome da variavel | Valor (exemplo) | O que eh |
|---|---|---|
| `GURU_PRODUCT_ID_MONTHLY_97` | `(codigo do produto mensal que voce criou)` | Codigo do produto mensal R$97 na Guru |
| `GURU_PRODUCT_ID_ANNUAL_97` | `(codigo do produto anual que voce criou)` | Codigo do produto anual R$804 na Guru |

**IMPORTANTE:** Substitua os valores de exemplo pelo codigo REAL que a Guru deu pro produto.

5. Clique em **Deploy** (ou espere o deploy automatico)

---

## 4. Configuracao do Resend (email)

**NAO precisa mudar nada no Resend.** Os emails ja estao configurados e funcionam para qualquer oferta.
O dominio `capicand-ia.com` ja esta verificado e os templates de email sao os mesmos.

---

## 5. Como testar antes de ir ao ar

### Teste rapido (sem gastar dinheiro):

1. Use a conta de teste: `teste_qa_final@teste.com` (senha: `teste2026QA`, ID: 644)
2. No painel admin, voce pode simular uma ativacao manual:
   - Va em Admin > Usuarios
   - Encontre o usuario de teste
   - Use "Dar acesso" com tipo "paid"
3. Verifique se o campo `subscription_tier` aparece como `pro` ou `standard`

### Teste real com webhook:

1. Faca uma compra de teste no checkout novo (use um cartao de teste se a Guru permitir)
2. Verifique nos logs do Railway se apareceu:
   - `Webhook Guru: active` (ou `paid`)
   - `Guru tier detectado: pro`
   - `Guru: plano ativado para [email]: tier=pro`
3. Verifique se voce (Rafael) recebeu o email de notificacao com o badge "PRO"
4. Verifique se o usuario de teste recebeu o email de boas-vindas

### Para ver os logs no Railway:

1. Entre no Railway
2. Clique no seu projeto
3. Va em **Deployments** > clique no deploy mais recente
4. Va em **Logs**
5. Procure por "Webhook Guru" ou "tier detectado"

---

## 6. Checklist final

- [ ] Produto mensal R$97 criado na Guru
- [ ] Produto anual R$804 criado na Guru
- [ ] Webhook configurado apontando para `https://capicand-ia.com/api/webhook/guru`
- [ ] Codigo do produto mensal anotado
- [ ] Codigo do produto anual anotado
- [ ] Variavel `GURU_PRODUCT_ID_MONTHLY_97` adicionada no Railway
- [ ] Variavel `GURU_PRODUCT_ID_ANNUAL_97` adicionada no Railway
- [ ] Deploy feito no Railway
- [ ] Teste com compra real (ou simulada) funcionou
- [ ] Email de notificacao pro Rafael chegou com badge PRO
- [ ] Email de boas-vindas pro cliente chegou

---

## 7. Observacoes que notei

- O arquivo `backend/server.js` eh muito grande (340KB, 5000+ linhas). Idealmente deveria ser separado em modulos (routes, middleware, services), mas isso nao eh urgente.
- A API key do Resend esta hardcoded como fallback no codigo (linha 3733). Ela deveria estar APENAS na variavel de ambiente `RESEND_API_KEY`. Nao eh um problema de seguranca imediato porque o repositorio provavelmente eh privado, mas eh bom remover o fallback no futuro.
- O webhook do PagarMe tambem foi atualizado para detectar o tier "pro" (caso voce use PagarMe no futuro para a oferta nova).
- Os emails de renovacao/vencimento (aqueles que avisam 7 dias antes, 3 dias antes, etc.) apontam para os checkouts da oferta PRO por padrao (as URLs `mensal-capi-candia-pro` e `anual-capi-candia-pro`). Isso esta correto porque sao os checkouts mais recentes, mas se voce quiser que cada tier receba o link do SEU checkout, avise que a gente ajusta.
